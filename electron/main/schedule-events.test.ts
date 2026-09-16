import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioDatabase } from "./database/database.js";

function withDatabase(run: (database: StudioDatabase) => void): void {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-schedule-events-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    run(database);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function createApprovedPromo(database: StudioDatabase) {
  const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Calendar Track", primaryGenre: "Psytrance", story: "A scheduling test." });
  const plan = database.createReleasePlan({ releaseId: release.id, title: "Calendar Plan" });
  const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Launch caption", purpose: "Announce", contentType: "caption", targetPlatforms: ["Instagram"], plannedDate: "2026-10-01", plannedTime: "18:00" });
  database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
  database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED" });
  const packItem = database.saveCampaignPackItems(release.id, "en", "test", [{ kind: "caption", channel: "Instagram", content: "Approved copy" }])[0]!;
  database.updateCampaignPackItemStatus(packItem.id, "approved");
  const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Approved copy", campaignPackItemId: packItem.id, status: "SUCCESS", model: "test" });
  database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED", reviewActor: "tester" });
  return { release, plan, item, packItem, promo: database.getPromoGenerationById(promo.id)! };
}

test("only approved promo content can be scheduled", () => withDatabase((database) => {
  const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Draft Promo", primaryGenre: "Psytrance", story: "Draft" });
  const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan" });
  const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Announce", contentType: "caption", targetPlatforms: ["Instagram"] });
  const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Generated", status: "SUCCESS", model: "test" });
  assert.throws(() => database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" }), /Only APPROVED promo content/);
}));

test("creates, lists, edits, reschedules and cancels ScheduleEvent", () => withDatabase((database) => {
  const { promo, release, item } = createApprovedPromo(database);
  const created = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" });
  assert.equal(created.releaseId, release.id);
  assert.equal(created.campaignItemTitle, item.title);
  assert.equal(created.status, "DRAFT");
  assert.equal(created.scheduledAt, "2026-10-01T16:00:00.000Z");
  assert.equal(created.timezone, "Europe/Berlin");

  const scheduled = database.updateScheduleEvent({ id: created.id, status: "SCHEDULED", platform: "Facebook", scheduledAt: "2026-10-02T10:30:00+02:00" });
  assert.equal(scheduled.platform, "Facebook");
  assert.equal(scheduled.status, "SCHEDULED");
  assert.equal(scheduled.scheduledAt, "2026-10-02T08:30:00.000Z");
  assert.deepEqual(database.listScheduleEvents({ releaseId: release.id }).map((event) => event.id), [created.id]);

  const cancelled = database.cancelScheduleEvent(created.id);
  assert.equal(cancelled.status, "CANCELLED");
}));

test("protects duplicate promo/platform/time schedules", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const input = { promoGenerationId: promo.id, platform: "Instagram" as const, scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" };
  database.createScheduleEvent(input);
  assert.throws(() => database.createScheduleEvent(input), /already scheduled/);
}));

test("validates timezone, platform and does not create publishing queue items", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  assert.throws(() => database.createScheduleEvent({ promoGenerationId: promo.id, platform: "LinkedIn" as never, scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" }), /Invalid schedule platform/);
  assert.throws(() => database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Mars/Base" }), /Invalid schedule timezone/);
  assert.equal(database.listPublishingQueue().length, 0);
}));
test("sends a READY supported ScheduleEvent to the Publishing Queue once", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const result = database.sendScheduleEventToPublishingQueue(event.id, "tester");
  assert.equal(result.publishingQueueItem.status, "draft");
  assert.equal(result.publishingQueueItem.platform, "Instagram");
  assert.equal(result.scheduleEvent.publishingQueueId, result.publishingQueueItem.id);
  assert.equal(result.scheduleEvent.queuedBy, "tester");
  assert.equal(database.listPublishingQueue().length, 1);
  assert.throws(() => database.sendScheduleEventToPublishingQueue(event.id), /already linked/);
}));

test("rejects non-READY, cancelled, unsupported, and no-longer-approved schedule events", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" });
  assert.throws(() => database.sendScheduleEventToPublishingQueue(event.id), /Only READY/);
  database.cancelScheduleEvent(event.id);
  assert.throws(() => database.sendScheduleEventToPublishingQueue(event.id), /Only READY/);

  const unsupported = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "TikTok", scheduledAt: "2026-10-02T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: unsupported.id, status: "READY" });
  assert.throws(() => database.sendScheduleEventToPublishingQueue(unsupported.id), /not supported/);

  const changed = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Facebook", scheduledAt: "2026-10-03T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: changed.id, status: "READY" });
  database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "REJECTED", reviewActor: "tester" });
  assert.throws(() => database.sendScheduleEventToPublishingQueue(changed.id), /Only APPROVED/);
  assert.equal(database.listPublishingQueue().length, 0);
}));
test("reviews bridge-created queue items with explicit audit metadata", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-04T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queued = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  const approved = database.reviewPublishingQueueItem({ id: queued.id, action: "APPROVE", actor: "reviewer", reason: "Copy approved" });
  assert.equal(approved.status, "approved");
  assert.equal(approved.sourceScheduleEventId, event.id);
  assert.equal(approved.reviewedBy, "reviewer");
  assert.equal(approved.reviewReason, "Copy approved");
  const scheduled = database.reviewPublishingQueueItem({ id: queued.id, action: "SCHEDULE", actor: "reviewer" });
  assert.equal(scheduled.status, "scheduled");
  const eventLog = (database as unknown as { database: { prepare(sql: string): { all(...values: unknown[]): unknown[] } } }).database.prepare("SELECT event_type FROM events WHERE entity_id = ? ORDER BY created_at").all(queued.id) as Array<{ event_type: string }>;
  assert.ok(eventLog.some((entry) => entry.event_type === "publishing_queue.reviewed"));
}));

test("rejects invalid queue review and guards approved queue content", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Facebook", scheduledAt: "2026-10-05T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queued = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  assert.throws(() => database.reviewPublishingQueueItem({ id: queued.id, action: "SCHEDULE" }), /Invalid publishing transition/);
  const rejected = database.reviewPublishingQueueItem({ id: queued.id, action: "REJECT", reason: "Needs new hook" });
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.error, "Needs new hook");
  const returned = database.reviewPublishingQueueItem({ id: queued.id, action: "RETURN_TO_DRAFT" });
  assert.equal(returned.status, "draft");
  const approved = database.reviewPublishingQueueItem({ id: queued.id, action: "APPROVE" });
  assert.throws(() => database.updatePublishingQueueContent({ id: queued.id, caption: "Changed", scheduledAt: approved.scheduledAt }), /Return this queue item to Draft/);
  database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "REJECTED", reviewActor: "tester" });
  database.reviewPublishingQueueItem({ id: queued.id, action: "RETURN_TO_DRAFT" });
  assert.throws(() => database.reviewPublishingQueueItem({ id: queued.id, action: "APPROVE" }), /no longer approved/);
}));
test("rejects new manual queue creation while preserving readable legacy queue records", () => withDatabase((database) => {
  assert.throws(() => database.createPublishingQueueItem(), /READY ScheduleEvent/);
  const { release, packItem } = createApprovedPromo(database);
  const legacyId = "legacy-readable";
  (database as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): unknown } } }).database.prepare("INSERT INTO publishing_queue(id,release_id,campaign_pack_item_id,media_generation_id,platform,caption,scheduled_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'draft',?,?)").run(legacyId,release.id,packItem.id,null,"Instagram","Historic draft","2026-10-06T16:00:00.000Z","2026-09-01T00:00:00.000Z","2026-09-01T00:00:00.000Z");
  const legacy = database.getPublishingQueueItem(legacyId)!;
  assert.equal(legacy.sourceScheduleEventId, null);
  assert.equal(legacy.caption, "Historic draft");
}));

test("new bridge-created queue drafts always retain their ScheduleEvent source", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-07T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queued = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  assert.equal(queued.sourceScheduleEventId, event.id);
  assert.ok(queued.scheduledAt);
}));
test("cannot review an unlinked legacy item or edit a scheduled bridge item", () => withDatabase((database) => {
  const { release, packItem, promo } = createApprovedPromo(database);
  const legacyId = "legacy-no-source";
  (database as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): unknown } } }).database.prepare("INSERT INTO publishing_queue(id,release_id,campaign_pack_item_id,media_generation_id,platform,caption,scheduled_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'draft',?,?)").run(legacyId,release.id,packItem.id,null,"Instagram","Historic draft","2026-10-08T16:00:00.000Z","2026-09-01T00:00:00.000Z","2026-09-01T00:00:00.000Z");
  assert.throws(() => database.reviewPublishingQueueItem({ id: legacyId, action: "APPROVE" }), /must come from a ScheduleEvent/);

  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-09T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queue = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  database.reviewPublishingQueueItem({ id: queue.id, action: "APPROVE" });
  const scheduled = database.reviewPublishingQueueItem({ id: queue.id, action: "SCHEDULE" });
  assert.throws(() => database.updatePublishingQueueContent({ id: queue.id, caption: "Changed", scheduledAt: scheduled.scheduledAt }), /Return this queue item to Draft/);
}));

test("scheduled items can transition to publishing via beginPublishing", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-10T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queued = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  database.reviewPublishingQueueItem({ id: queued.id, action: "APPROVE" });
  const scheduledReview = database.reviewPublishingQueueItem({ id: queued.id, action: "SCHEDULE" });
  assert.equal(scheduledReview.status, "scheduled");

  const publishing = database.beginPublishing(queued.id);
  assert.equal(publishing.status, "publishing");

  const published = database.markPublishingSucceeded(queued.id, "facebook:page-1", "remote-post-123");
  assert.equal(published.status, "published");
  assert.equal(published.remotePostId, "remote-post-123");
  assert.equal(published.destinationId, "facebook:page-1");
  assert.ok(published.publishedAt);
}));

test("publishing items can transition to failed via markPublishingFailed", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Facebook", scheduledAt: "2026-10-11T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queued = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  database.reviewPublishingQueueItem({ id: queued.id, action: "APPROVE" });
  database.reviewPublishingQueueItem({ id: queued.id, action: "SCHEDULE" });
  database.beginPublishing(queued.id);

  const failed = database.markPublishingFailed(queued.id, "Meta API returned HTTP 403: token expired");
  assert.equal(failed.status, "failed");
  assert.ok(failed.error?.includes("token expired"));

  const retryDraft = database.reviewPublishingQueueItem({ id: queued.id, action: "RETURN_TO_DRAFT" });
  assert.equal(retryDraft.status, "draft");
}));

test("beginPublishing rejects non-scheduled items", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-12T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queued = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  assert.throws(() => database.beginPublishing(queued.id), /Only scheduled items/);
  database.reviewPublishingQueueItem({ id: queued.id, action: "APPROVE" });
  assert.throws(() => database.beginPublishing(queued.id), /Only scheduled items/);
}));

test("publishing status is stored in audit trail", () => withDatabase((database) => {
  const { promo } = createApprovedPromo(database);
  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-13T16:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queued = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  database.reviewPublishingQueueItem({ id: queued.id, action: "APPROVE" });
  database.reviewPublishingQueueItem({ id: queued.id, action: "SCHEDULE" });
  database.beginPublishing(queued.id);

  const eventLog = (database as unknown as { database: { prepare(sql: string): { all(...values: unknown[]): unknown[] } } }).database.prepare("SELECT event_type FROM events WHERE entity_id = ? ORDER BY created_at").all(queued.id) as Array<{ event_type: string }>;
  assert.ok(eventLog.some((entry) => entry.event_type === "publishing_queue.publishing_started"));
}));