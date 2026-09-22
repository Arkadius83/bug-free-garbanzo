import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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

    assert.throws(() => database.deleteCampaignPackItem(prompt.id), /media generation/);
    assert.ok(database.getMediaGeneration(media.id));
    assert.equal(database.listCampaignPackItems(release.id).some((item) => item.id === prompt.id), true);
  });
});

test("deleteCampaignPackItem is blocked when referenced by generated promo content", () => {
  withContentDatabase((database, { release }) => {
    const pack = savePack(database, release.id);
    const caption = pack.find((item) => item.kind === "caption")!;
    const { plan, item } = createApprovedPromoPlan(database, release.id);
    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Linked caption", status: "SUCCESS", model: "test-model", campaignPackItemId: caption.id });

    assert.throws(() => database.deleteCampaignPackItem(caption.id), /promo content/);
    assert.ok(database.getPromoGenerationById(promo.id));
    assert.equal(database.listCampaignPackItems(release.id).some((row) => row.id === caption.id), true);
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

    database.deletePromoGeneration(promo.id);
    assert.equal(database.listPromoGenerations(plan.id).length, 0);
    assert.equal(database.listCampaignPackItems(release.id).length, pack.length - 1);
    assert.equal(database.getReleasePlan(plan.id)?.campaignItems.length, 2);
    assert.equal(database.listScheduleEvents({ releaseId: release.id }).length, 0);
  });
});
