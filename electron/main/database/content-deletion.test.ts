import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioDatabase } from "./database.js";
import type { CampaignPackItem, ReleaseSummary } from "../../shared/contracts.js";

type RunContext = { release: ReleaseSummary; directory: string };

function withContentDatabase(run: (database: StudioDatabase, context: RunContext) => void) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "content-deletion-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Cleanup Release", primaryGenre: "House", story: "Safe delete tests." });
    run(database, { release, directory });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function savePack(database: StudioDatabase, releaseId: string): CampaignPackItem[] {
  return database.saveCampaignPackItems(releaseId, "en", "test-model", [
    { kind: "caption", channel: "Instagram", content: "First caption" },
    { kind: "image-prompt", channel: null, content: "First artwork prompt" }
  ]);
}

function createApprovedPromoPlan(database: StudioDatabase, releaseId: string) {
  const plan = database.createReleasePlan({ releaseId, title: "Deletion Plan", summary: "Plan used by safe delete tests" });
  const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Announce", contentType: "caption", targetPlatforms: ["Instagram"] });
  const second = database.createCampaignItem({ releasePlanId: plan.id, title: "Hook", purpose: "Tease", contentType: "video-hook", targetPlatforms: ["TikTok"] });
  database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
  database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "manager", reason: "Approved for tests" });
  return { plan, item, second };
}

test("deleteDraft removes a single unreferenced draft and keeps unrelated records", () => {
  withContentDatabase((database, { release }) => {
    const first = database.saveGeneratedDraft({ releaseId: release.id, channel: "Instagram", language: "en", content: "Obsolete draft", model: "test-model" });
    const second = database.saveGeneratedDraft({ releaseId: release.id, channel: "TikTok", language: "en", content: "Keep this draft", model: "test-model" });
    const pack = savePack(database, release.id);

    database.deleteDraft(first.id);

    const drafts = database.listDrafts(release.id);
    assert.deepEqual(drafts.map((draft) => draft.id), [second.id]);
    assert.deepEqual(database.listCampaignPackItems(release.id).map((item) => item.id), pack.map((item) => item.id));
    assert.throws(() => database.deleteDraft(first.id), /Draft not found/);
  });
});

test("deleteCampaignPackItem removes a single unreferenced promotion format and keeps others", () => {
  withContentDatabase((database, { release }) => {
    const pack = savePack(database, release.id);
    const caption = pack.find((item) => item.kind === "caption")!;
    const prompt = pack.find((item) => item.kind === "image-prompt")!;

    assert.deepEqual(database.getCampaignPackItemDependencyStatus(caption.id), {
      canDelete: true,
      deleteMode: "normal",
      dependencies: { publishingQueue: 0, promoGenerations: 0, mediaGenerations: 0 }
    });
    database.deleteCampaignPackItem(caption.id);

    const remaining = database.listCampaignPackItems(release.id);
    assert.deepEqual(remaining.map((item) => item.id), [prompt.id]);
    assert.throws(() => database.deleteCampaignPackItem(caption.id), /Promotion format not found/);
  });
});

test("deleteCampaignPackItem is blocked when referenced by the Publishing Queue", () => {
  withContentDatabase((database, { release }) => {
    const pack = savePack(database, release.id);
    const caption = pack.find((item) => item.kind === "caption")!;
    database.updateCampaignPackItemStatus(caption.id, "approved");
    const queueItem = database.createPublishingQueueItem({ releaseId: release.id, campaignPackItemId: caption.id, mediaGenerationId: null, platform: "Instagram", scheduledAt: "2026-10-01T18:00:00.000Z" });

    const status = database.getCampaignPackItemDependencyStatus(caption.id);
    assert.equal(status.canDelete, false);
    assert.equal(status.deleteMode, "blocked");
    assert.equal(status.dependencies.publishingQueue, 1);
    assert.throws(() => database.deleteCampaignPackItem(caption.id), /Publishing Queue/);
    assert.ok(database.listPublishingQueue().some((item) => item.id === queueItem.id));
    assert.equal(database.listCampaignPackItems(release.id).some((item) => item.id === caption.id), true);
  });
});

test("deleteCampaignPackItem is blocked when referenced by a media generation", () => {
  withContentDatabase((database, { release }) => {
    const pack = savePack(database, release.id);
    const prompt = pack.find((item) => item.kind === "image-prompt")!;
    database.updateCampaignPackItemStatus(prompt.id, "approved");
    const media = database.createMediaGeneration(prompt, "comfyui", "image");

    const status = database.getCampaignPackItemDependencyStatus(prompt.id);
    assert.equal(status.canDelete, false);
    assert.equal(status.deleteMode, "blocked");
    assert.equal(status.dependencies.mediaGenerations, 1);
    assert.throws(() => database.deleteCampaignPackItem(prompt.id), /media generation/);
    assert.ok(database.getMediaGeneration(media.id));
    assert.equal(database.listCampaignPackItems(release.id).some((item) => item.id === prompt.id), true);
  });
});

test("deleteCampaignPackItem detaches promo-only references and preserves promo, generated content, plan, and schedules", () => {
  withContentDatabase((database, { release }) => {
    const pack = savePack(database, release.id);
    const caption = pack.find((item) => item.kind === "caption")!;
    const { plan, item } = createApprovedPromoPlan(database, release.id);
    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Linked caption must survive", status: "SUCCESS", model: "test-model", campaignPackItemId: caption.id });
    database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED", reviewActor: "manager", reviewReason: "Ready" });
    const schedule = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" });

    const status = database.getCampaignPackItemDependencyStatus(caption.id);
    assert.equal(status.canDelete, true);
    assert.equal(status.deleteMode, "detach-promo");
    assert.deepEqual(status.dependencies, { publishingQueue: 0, promoGenerations: 1, mediaGenerations: 0 });

    database.deleteCampaignPackItem(caption.id);

    assert.equal(database.listCampaignPackItems(release.id).some((row) => row.id === caption.id), false);
    const surviving = database.getPromoGenerationById(promo.id)!;
    assert.ok(surviving);
    assert.equal(surviving.campaignPackItemId, null);
    assert.equal(surviving.generatedContent, "Linked caption must survive");
    assert.equal(surviving.reviewStatus, "APPROVED");
    assert.equal(database.getReleasePlan(plan.id)?.status, "APPROVED");
    assert.ok(database.listScheduleEvents({ releaseId: release.id }).some((row) => row.id === schedule.id));
    assert.equal((database as unknown as { database: DatabaseSync }).database.prepare("PRAGMA foreign_key_check").all().length, 0);
  });
});

test("cleanupStaleMediaGenerations removes only FAILED/REJECTED media, their local files, and never active media", () => {
  withContentDatabase((database, { release, directory }) => {
    const pack = savePack(database, release.id);
    const prompt = pack.find((item) => item.kind === "image-prompt")!;
    database.updateCampaignPackItemStatus(prompt.id, "approved");

    const failedFile = path.join(directory, "failed.png");
    const rejectedFile = path.join(directory, "rejected.png");
    const readyFile = path.join(directory, "ready.png");
    writeFileSync(failedFile, "failed-bytes");
    writeFileSync(rejectedFile, "rejected-bytes");
    writeFileSync(readyFile, "ready-bytes");

    const failed = database.createMediaGeneration(prompt, "comfyui", "image");
    database.updateMediaGeneration(failed.id, { status: "failed", localPath: failedFile, mimeType: "image/png", error: "boom" });
    const rejected = database.createMediaGeneration(prompt, "openai", "image");
    database.updateMediaGeneration(rejected.id, { status: "rejected", localPath: rejectedFile, mimeType: "image/png", error: null });
    const ready = database.createMediaGeneration(prompt, "kling", "image");
    database.updateMediaGeneration(ready.id, { status: "ready", localPath: readyFile, mimeType: "image/png", error: null });
    const approved = database.createMediaGeneration(prompt, "comfyui", "image");
    database.updateMediaGeneration(approved.id, { status: "approved", localPath: readyFile, mimeType: "image/png", error: null });

    const result = database.cleanupStaleMediaGenerations(release.id);

    assert.deepEqual([...result.removedIds].sort(), [failed.id, rejected.id].sort());
    assert.deepEqual([...result.removedFiles].sort(), [failedFile, rejectedFile].sort());
    assert.equal(existsSync(failedFile), false);
    assert.equal(existsSync(rejectedFile), false);
    assert.equal(existsSync(readyFile), true);
    assert.ok(database.getMediaGeneration(ready.id));
    assert.ok(database.getMediaGeneration(approved.id));
    assert.equal(database.getMediaGeneration(failed.id), undefined);
    assert.equal(database.getMediaGeneration(rejected.id), undefined);

    const status = database.getCampaignPackItemDependencyStatus(prompt.id);
    assert.equal(status.canDelete, false);
    assert.equal(status.deleteMode, "blocked");
    assert.equal(status.dependencies.mediaGenerations, 2);
    assert.throws(() => database.deleteCampaignPackItem(prompt.id), /media generation/);
    assert.equal((database as unknown as { database: DatabaseSync }).database.prepare("PRAGMA foreign_key_check").all().length, 0);

    database.updateMediaGeneration(ready.id, { status: "failed", localPath: readyFile, mimeType: "image/png", error: "regressed" });
    database.updateMediaGeneration(approved.id, { status: "rejected", localPath: readyFile, mimeType: "image/png", error: null });
    const secondPass = database.cleanupStaleMediaGenerations(release.id);
    assert.deepEqual([...secondPass.removedIds].sort(), [ready.id, approved.id].sort());
    assert.equal(database.getCampaignPackItemDependencyStatus(prompt.id).canDelete, true);
    database.deleteCampaignPackItem(prompt.id);
    assert.equal(database.listCampaignPackItems(release.id).some((row) => row.id === prompt.id), false);
    assert.equal((database as unknown as { database: DatabaseSync }).database.prepare("PRAGMA foreign_key_check").all().length, 0);
  });
});

test("cleanupStaleMediaGenerations skips media referenced by the Publishing Queue", () => {
  withContentDatabase((database, { release }) => {
    const pack = savePack(database, release.id);
    const caption = pack.find((item) => item.kind === "caption")!;
    const prompt = pack.find((item) => item.kind === "image-prompt")!;
    database.updateCampaignPackItemStatus(caption.id, "approved");
    database.updateCampaignPackItemStatus(prompt.id, "approved");
    const queuedMedia = database.createMediaGeneration(prompt, "comfyui", "image");
    database.updateMediaGeneration(queuedMedia.id, { status: "ready", localPath: null, mimeType: null, error: null });
    database.updateMediaGeneration(queuedMedia.id, { status: "approved", localPath: null, mimeType: null, error: null });
    const queueItem = database.createPublishingQueueItem({ releaseId: release.id, campaignPackItemId: caption.id, mediaGenerationId: queuedMedia.id, platform: "Instagram", scheduledAt: "2026-10-01T18:00:00.000Z" });
    database.updateMediaGeneration(queuedMedia.id, { status: "failed", localPath: null, mimeType: null, error: "regressed after queue" });

    const result = database.cleanupStaleMediaGenerations(release.id);

    assert.deepEqual(result.removedIds, []);
    assert.ok(database.getMediaGeneration(queuedMedia.id));
    assert.ok(database.listPublishingQueue().some((row) => row.id === queueItem.id));
  });
});

test("deletePromoGeneration removes a single unreferenced generated release plan item and keeps others", () => {
  withContentDatabase((database, { release }) => {
    const { plan, item, second: other } = createApprovedPromoPlan(database, release.id);
    const doomed = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Delete me", status: "SUCCESS", model: "test-model" });
    const kept = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: other.id, contentType: "video-hook", generatedContent: "Keep me", status: "SUCCESS", model: "test-model" });

    database.deletePromoGeneration(doomed.id);

    const remaining = database.listPromoGenerations(plan.id);
    assert.deepEqual(remaining.map((promo) => promo.id), [kept.id]);
    assert.throws(() => database.deletePromoGeneration(doomed.id), /Promo generation not found/);
    assert.equal(database.getReleasePlan(plan.id)?.campaignItems.length, 2);
  });
});

test("deletePromoGeneration is blocked when referenced by a ScheduleEvent", () => {
  withContentDatabase((database, { release }) => {
    const { plan, item } = createApprovedPromoPlan(database, release.id);
    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Scheduled content", status: "SUCCESS", model: "test-model" });
    database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED", reviewActor: "manager", reviewReason: "Ready" });
    const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" });

    assert.throws(() => database.deletePromoGeneration(promo.id), /ScheduleEvent/);
    assert.ok(database.listScheduleEvents({ releaseId: release.id }).some((row) => row.id === event.id));
    assert.ok(database.getPromoGenerationById(promo.id));
  });
});

test("deletePromoGeneration is blocked once the item reached the Publishing Queue", () => {
  withContentDatabase((database, { release }) => {
    const pack = savePack(database, release.id);
    const caption = pack.find((item) => item.kind === "caption")!;
    database.updateCampaignPackItemStatus(caption.id, "approved");
    const { plan, item } = createApprovedPromoPlan(database, release.id);
    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Queued content", status: "SUCCESS", model: "test-model", campaignPackItemId: caption.id });
    database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED", reviewActor: "manager", reviewReason: "Ready" });
    const event = database.createScheduleEvent({ promoGenerationId: promo.id, platform: "Instagram", scheduledAt: "2026-10-01T16:00:00.000Z", timezone: "Europe/Berlin" });
    database.updateScheduleEvent({ id: event.id, status: "READY" });
    const queued = database.sendScheduleEventToPublishingQueue(event.id);

    assert.throws(() => database.deletePromoGeneration(promo.id), /Publishing Queue/);
    assert.ok(database.listPublishingQueue().some((row) => row.id === queued.publishingQueueItem.id));
    assert.ok(database.getPromoGenerationById(promo.id));
  });
});

test("deletePromoGeneration is blocked for locked APPROVED content", () => {
  withContentDatabase((database, { release }) => {
    const { plan, item } = createApprovedPromoPlan(database, release.id);
    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Approved content", status: "SUCCESS", model: "test-model" });
    database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED", reviewActor: "manager", reviewReason: "Ready" });

    assert.throws(() => database.deletePromoGeneration(promo.id), /locked/);
    assert.ok(database.getPromoGenerationById(promo.id));
  });
});

test("deleting one entity type does not remove records of the other entity types", () => {
  withContentDatabase((database, { release }) => {
    const draft = database.saveGeneratedDraft({ releaseId: release.id, channel: "Instagram", language: "en", content: "Draft only", model: "test-model" });
    const pack = savePack(database, release.id);
    const { plan, item } = createApprovedPromoPlan(database, release.id);
    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Promo only", status: "SUCCESS", model: "test-model" });

    database.deleteDraft(draft.id);
    assert.equal(database.listDrafts(release.id).length, 0);
    assert.equal(database.listCampaignPackItems(release.id).length, pack.length);
    assert.equal(database.listPromoGenerations(plan.id).length, 1);

    const prompt = pack.find((row) => row.kind === "image-prompt")!;
    database.deleteCampaignPackItem(prompt.id);
    assert.equal(database.listCampaignPackItems(release.id).length, pack.length - 1);
    assert.ok(database.getPromoGenerationById(promo.id));
    assert.equal(database.getReleasePlan(plan.id)?.campaignItems.length, 2);
    assert.equal((database as unknown as { database: DatabaseSync }).database.prepare("PRAGMA foreign_key_check").all().length, 0);

    database.deletePromoGeneration(promo.id);
    assert.equal(database.listPromoGenerations(plan.id).length, 0);
    assert.equal(database.listCampaignPackItems(release.id).length, pack.length - 1);
    assert.equal(database.getReleasePlan(plan.id)?.campaignItems.length, 2);
    assert.equal(database.listScheduleEvents({ releaseId: release.id }).length, 0);
  });
});
