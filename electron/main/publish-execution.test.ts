import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioDatabase } from "./database/database.js";

function withDatabase(run: (database: StudioDatabase) => void): void {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-publish-execution-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    run(database);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function createScheduledQueueItem(database: StudioDatabase, platform: "Facebook" | "Instagram" = "Facebook") {
  const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Publish Test Release", primaryGenre: "Psytrance", story: "Testing real publish execution." });
  const plan = database.createReleasePlan({ releaseId: release.id, title: "Publish Test Plan" });
  const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Publish caption", purpose: "Announce", contentType: "caption", targetPlatforms: [platform], plannedDate: "2026-11-01", plannedTime: "18:00" });
  database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
  database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED" });
  const packItem = database.saveCampaignPackItems(release.id, "en", "test", [{ kind: "caption", channel: platform, content: "Approved publish copy" }])[0]!;
  database.updateCampaignPackItemStatus(packItem.id, "approved");
  const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Approved publish copy", campaignPackItemId: packItem.id, status: "SUCCESS", model: "test" });
  database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED", reviewActor: "tester" });

  const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform, scheduledAt: "2026-11-01T18:00:00.000Z", timezone: "Europe/Berlin" });
  database.updateScheduleEvent({ id: event.id, status: "READY" });
  const queueItem = database.sendScheduleEventToPublishingQueue(event.id).publishingQueueItem;
  database.reviewPublishingQueueItem({ id: queueItem.id, action: "APPROVE" });
  database.reviewPublishingQueueItem({ id: queueItem.id, action: "SCHEDULE" });
  return { release, plan, item, packItem, promo, event, queueItem: database.getPublishingQueueItem(queueItem.id)! };
}

function getEvents(database: StudioDatabase, entityId: string) {
  return (database as unknown as { database: { prepare(sql: string): { all(...values: unknown[]): unknown[] } } })
    .database.prepare("SELECT event_type, payload_json FROM events WHERE entity_id = ? ORDER BY created_at")
    .all(entityId) as Array<{ event_type: string; payload_json: string | null }>;
}

test("successful Facebook publish transitions to PUBLISHED with remote post ID", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  assert.equal(queueItem.status, "scheduled");

  const publishing = database.beginPublishing(queueItem.id);
  assert.equal(publishing.status, "publishing");

  const published = database.markPublishingSucceeded(queueItem.id, "facebook:page-123", "fb-post-456");
  assert.equal(published.status, "published");
  assert.equal(published.destinationId, "facebook:page-123");
  assert.equal(published.remotePostId, "fb-post-456");
  assert.ok(published.publishedAt);
  assert.equal(published.error, null);
}));

test("successful Instagram publish transitions to PUBLISHED with remote post ID", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Instagram");
  assert.equal(queueItem.status, "scheduled");

  const publishing = database.beginPublishing(queueItem.id);
  assert.equal(publishing.status, "publishing");

  const published = database.markPublishingSucceeded(queueItem.id, "instagram:user-789", "ig-container-012");
  assert.equal(published.status, "published");
  assert.equal(published.destinationId, "instagram:user-789");
  assert.equal(published.remotePostId, "ig-container-012");
  assert.ok(published.publishedAt);
}));

test("provider failure transitions to FAILED with error message", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");

  database.beginPublishing(queueItem.id);
  const failed = database.markPublishingFailed(queueItem.id, "Meta API error: OAuth token expired (HTTP 401)");
  assert.equal(failed.status, "failed");
  assert.ok(failed.error?.includes("OAuth token expired"));
  assert.ok(failed.error?.includes("HTTP 401"));
  assert.equal(failed.remotePostId, null);
  assert.equal(failed.publishedAt, null);
}));

test("already published item cannot be published again", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  database.beginPublishing(queueItem.id);
  database.markPublishingSucceeded(queueItem.id, "facebook:page-1", "post-1");
  assert.equal(database.getPublishingQueueItem(queueItem.id)!.status, "published");

  assert.throws(() => database.beginPublishing(queueItem.id), /Only scheduled items can be published/);
}));

test("failed item can be retried via RETURN_TO_DRAFT then APPROVE then SCHEDULE", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  database.beginPublishing(queueItem.id);
  database.markPublishingFailed(queueItem.id, "Network timeout");

  const draft = database.reviewPublishingQueueItem({ id: queueItem.id, action: "RETURN_TO_DRAFT" });
  assert.equal(draft.status, "draft");

  const approved = database.reviewPublishingQueueItem({ id: queueItem.id, action: "APPROVE" });
  assert.equal(approved.status, "approved");

  const scheduled = database.reviewPublishingQueueItem({ id: queueItem.id, action: "SCHEDULE" });
  assert.equal(scheduled.status, "scheduled");

  const publishing = database.beginPublishing(queueItem.id);
  assert.equal(publishing.status, "publishing");

  const published = database.markPublishingSucceeded(queueItem.id, "facebook:page-1", "retry-post-1");
  assert.equal(published.status, "published");
  assert.equal(published.remotePostId, "retry-post-1");
}));

test("publishing item cannot be edited", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  database.beginPublishing(queueItem.id);

  assert.throws(
    () => database.updatePublishingQueueContent({ id: queueItem.id, caption: "Changed caption", scheduledAt: queueItem.scheduledAt }),
    /Return this queue item to Draft before editing/
  );
}));

test("unsupported platform is rejected by beginPublishing", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  assert.equal(queueItem.platform, "Facebook");

  (database as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): unknown } } }).database.prepare("UPDATE publishing_queue SET platform = 'SoundCloud' WHERE id = ?").run(queueItem.id);
  const soundcloud = database.getPublishingQueueItem(queueItem.id)!;
  assert.equal(soundcloud.platform, "SoundCloud");

  assert.throws(() => database.beginPublishing(queueItem.id), /SoundCloud publishing is not available yet/);
}));

test("audit trail records publishing lifecycle events", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");

  database.beginPublishing(queueItem.id);
  database.markPublishingSucceeded(queueItem.id, "facebook:page-1", "audit-post-1");

  const events = getEvents(database, queueItem.id);
  const eventTypes = events.map((e) => e.event_type);
  assert.ok(eventTypes.includes("publishing_queue.publishing_started"), "Should record publishing_started");
  assert.ok(eventTypes.includes("publishing_queue.publishing_succeeded"), "Should record publishing_succeeded");

  const startedPayload = events.find((e) => e.event_type === "publishing_queue.publishing_started");
  assert.ok(startedPayload);
  const payload = JSON.parse(startedPayload.payload_json!) as { platform: string; releaseTitle: string };
  assert.equal(payload.platform, "Facebook");
  assert.equal(payload.releaseTitle, "Publish Test Release");
}));

test("audit trail records failure events", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Instagram");

  database.beginPublishing(queueItem.id);
  database.markPublishingFailed(queueItem.id, "Rate limit exceeded");

  const events = getEvents(database, queueItem.id);
  const eventTypes = events.map((e) => e.event_type);
  assert.ok(eventTypes.includes("publishing_queue.publishing_started"), "Should record publishing_started");
  assert.ok(eventTypes.includes("publishing_queue.publishing_failed"), "Should record publishing_failed");

  const failedPayload = events.find((e) => e.event_type === "publishing_queue.publishing_failed");
  assert.ok(failedPayload);
  const payload = JSON.parse(failedPayload.payload_json!) as { error: string };
  assert.equal(payload.error, "Rate limit exceeded");
}));

test("markPublishingSucceeded clears previous error", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  database.beginPublishing(queueItem.id);
  database.markPublishingFailed(queueItem.id, "First failure");
  assert.equal(database.getPublishingQueueItem(queueItem.id)!.error, "First failure");

  database.reviewPublishingQueueItem({ id: queueItem.id, action: "RETURN_TO_DRAFT" });
  database.reviewPublishingQueueItem({ id: queueItem.id, action: "APPROVE" });
  database.reviewPublishingQueueItem({ id: queueItem.id, action: "SCHEDULE" });
  database.beginPublishing(queueItem.id);
  const published = database.markPublishingSucceeded(queueItem.id, "facebook:page-1", "post-ok");
  assert.equal(published.error, null);
  assert.equal(published.remotePostId, "post-ok");
}));

test("publishing status is correctly reflected in listPublishingQueue", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");

  let queue = database.listPublishingQueue();
  let item = queue.find((i) => i.id === queueItem.id);
  assert.ok(item);
  assert.equal(item.status, "scheduled");

  database.beginPublishing(queueItem.id);
  queue = database.listPublishingQueue();
  item = queue.find((i) => i.id === queueItem.id);
  assert.equal(item!.status, "publishing");

  database.markPublishingSucceeded(queueItem.id, "facebook:page-1", "list-post-1");
  queue = database.listPublishingQueue();
  item = queue.find((i) => i.id === queueItem.id);
  assert.equal(item!.status, "published");
  assert.equal(item!.remotePostId, "list-post-1");
}));

test("schema version is 29 after all migrations", () => withDatabase((database) => {
  assert.equal(database.health().schemaVersion, 29);
}));

test("storePostAnalytics creates snapshot with verification data", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  database.beginPublishing(queueItem.id);
  const published = database.markPublishingSucceeded(queueItem.id, "facebook:page-1", "fb-post-999");
  assert.equal(published.status, "published");

  const snapshot = database.storePostAnalytics({
    publishingQueueItemId: queueItem.id,
    releaseId: queueItem.releaseId,
    externalPostId: "fb-post-999",
    platform: "Facebook",
    verified: true,
    verifiedAt: "2026-11-02T10:00:00.000Z",
    verificationError: null,
    views: null, reach: 150, impressions: 200, likes: 12, comments: 3, shares: 1, clicks: null
  });

  assert.ok(snapshot.id);
  assert.equal(snapshot.publishingQueueItemId, queueItem.id);
  assert.equal(snapshot.releaseId, queueItem.releaseId);
  assert.equal(snapshot.externalPostId, "fb-post-999");
  assert.equal(snapshot.platform, "Facebook");
  assert.equal(snapshot.verified, true);
  assert.equal(snapshot.verifiedAt, "2026-11-02T10:00:00.000Z");
  assert.equal(snapshot.verificationError, null);
  assert.equal(snapshot.reach, 150);
  assert.equal(snapshot.impressions, 200);
  assert.equal(snapshot.likes, 12);
  assert.equal(snapshot.comments, 3);
  assert.equal(snapshot.shares, 1);
  assert.equal(snapshot.clicks, null);
  assert.ok(snapshot.capturedAt);
  assert.ok(snapshot.createdAt);
}));

test("storePostAnalytics records verification failure", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Instagram");
  database.beginPublishing(queueItem.id);
  database.markPublishingSucceeded(queueItem.id, "instagram:user-1", "ig-post-456");

  const snapshot = database.storePostAnalytics({
    publishingQueueItemId: queueItem.id,
    releaseId: queueItem.releaseId,
    externalPostId: "ig-post-456",
    platform: "Instagram",
    verified: false,
    verifiedAt: null,
    verificationError: "Post not found or access denied",
    views: null, reach: null, impressions: null, likes: null, comments: null, shares: null, clicks: null
  });

  assert.equal(snapshot.verified, false);
  assert.equal(snapshot.verificationError, "Post not found or access denied");
  assert.equal(snapshot.verifiedAt, null);
}));

test("getAnalyticsSnapshots returns snapshots in reverse chronological order", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  database.beginPublishing(queueItem.id);
  database.markPublishingSucceeded(queueItem.id, "facebook:page-1", "fb-post-order");

  database.storePostAnalytics({
    publishingQueueItemId: queueItem.id, releaseId: queueItem.releaseId,
    externalPostId: "fb-post-order", platform: "Facebook",
    verified: true, verifiedAt: new Date().toISOString(), verificationError: null,
    views: 100, reach: 50, impressions: 80, likes: 5, comments: 1, shares: 0, clicks: null
  });

  database.storePostAnalytics({
    publishingQueueItemId: queueItem.id, releaseId: queueItem.releaseId,
    externalPostId: "fb-post-order", platform: "Facebook",
    verified: true, verifiedAt: new Date().toISOString(), verificationError: null,
    views: 200, reach: 100, impressions: 160, likes: 10, comments: 3, shares: 2, clicks: null
  });

  const snapshots = database.getAnalyticsSnapshots(queueItem.id);
  assert.equal(snapshots.length, 2);
  assert.ok(snapshots[0].createdAt >= snapshots[1].createdAt, "Should be reverse chronological");
  assert.equal(snapshots[0].views, 200);
  assert.equal(snapshots[1].views, 100);
}));

test("analytics are linked to correct release and external post ID", () => withDatabase((database) => {
  const { queueItem, release } = createScheduledQueueItem(database, "Facebook");
  database.beginPublishing(queueItem.id);
  database.markPublishingSucceeded(queueItem.id, "facebook:page-1", "fb-post-linked");

  database.storePostAnalytics({
    publishingQueueItemId: queueItem.id, releaseId: release.id,
    externalPostId: "fb-post-linked", platform: "Facebook",
    verified: true, verifiedAt: new Date().toISOString(), verificationError: null,
    views: 50, reach: 25, impressions: 40, likes: 2, comments: 0, shares: 0, clicks: null
  });

  const snapshots = database.getAnalyticsSnapshots(queueItem.id);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].releaseId, release.id);
  assert.equal(snapshots[0].externalPostId, "fb-post-linked");
  assert.equal(snapshots[0].publishingQueueItemId, queueItem.id);
}));

test("no duplicate snapshots for same queue item without new poll", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Instagram");
  database.beginPublishing(queueItem.id);
  database.markPublishingSucceeded(queueItem.id, "instagram:user-1", "ig-post-dup");

  const snapshotData = {
    publishingQueueItemId: queueItem.id, releaseId: queueItem.releaseId,
    externalPostId: "ig-post-dup", platform: "Instagram" as const,
    verified: true, verifiedAt: new Date().toISOString(), verificationError: null,
    views: null, reach: 30, impressions: 45, likes: 4, comments: 1, shares: 0, clicks: null
  };

  database.storePostAnalytics(snapshotData);
  database.storePostAnalytics(snapshotData);

  const snapshots = database.getAnalyticsSnapshots(queueItem.id);
  assert.equal(snapshots.length, 2, "Each poll creates its own snapshot row");
  assert.equal(snapshots[0].reach, 30);
  assert.equal(snapshots[1].reach, 30);
}));

test("missing external post ID prevents verification", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  assert.equal(queueItem.remotePostId, null);

  assert.throws(() => {
    if (!queueItem.remotePostId) throw new Error("No external post ID stored for this item");
  }, /No external post ID stored/);
}));

test("non-published item cannot have analytics fetched", () => withDatabase((database) => {
  const { queueItem } = createScheduledQueueItem(database, "Facebook");
  assert.equal(queueItem.status, "scheduled");

  assert.throws(() => {
    if (queueItem.status !== "published") throw new Error("Only published items can have analytics fetched");
  }, /Only published items can have analytics fetched/);
}));
