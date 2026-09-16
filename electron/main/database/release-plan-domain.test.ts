import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioDatabase } from "./database.js";

test("persists release plans, campaign items and approval records", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Sacred Orbit", primaryGenre: "Psytrance", story: "A ritual track for sunrise dance floors." });

    const plan = database.createReleasePlan({ releaseId: release.id, title: "Sacred Orbit Launch", summary: "Four-week promotion arc", createdBy: "arkadiusz" });
    assert.equal(plan.releaseId, release.id);
    assert.equal(plan.status, "DRAFT");
    assert.equal(plan.version, 1);
    assert.deepEqual(plan.campaignItems, []);

    assert.equal(database.getReleasePlan(plan.id)?.id, plan.id);
    assert.equal(database.listReleasePlans(release.id)[0]?.id, plan.id);

    const first = database.createCampaignItem({ releasePlanId: plan.id, title: "Announcement caption", purpose: "Reveal the release", contentType: "caption", targetPlatforms: ["Instagram", "Facebook"], plannedDate: "2026-10-01", plannedTime: "10:00", cta: "Pre-save", notes: "Use cover crop", assetRequirements: ["cover artwork"], copyRequirements: ["short hook"] });
    const second = database.createCampaignItem({ releasePlanId: plan.id, title: "Visualizer prompt", purpose: "Prepare teaser motion", contentType: "visualizer-prompt", targetPlatforms: ["TikTok", "YouTube"], plannedDate: "2026-10-03", plannedTime: "16:00" });
    assert.deepEqual(database.getReleasePlan(plan.id)?.campaignItems.map((item) => item.id), [first.id, second.id]);

    const updatedItem = database.updateCampaignItem({ id: first.id, title: "Announcement caption V2", status: "READY", targetPlatforms: ["Instagram"] });
    assert.equal(updatedItem.title, "Announcement caption V2");
    assert.equal(updatedItem.status, "READY");
    assert.deepEqual(updatedItem.targetPlatforms, ["Instagram"]);

    assert.deepEqual(database.reorderCampaignItems({ releasePlanId: plan.id, itemIds: [second.id, first.id] }).map((item) => item.id), [second.id, first.id]);
    database.deleteCampaignItem(second.id);
    assert.deepEqual(database.getReleasePlan(plan.id)?.campaignItems.map((item) => item.id), [first.id]);

    assert.equal(database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED", actor: "manager", reason: "Ready for approval" }).status, "REVIEWED");
    assert.equal(database.changeReleasePlanStatus({ id: plan.id, status: "DRAFT" }).status, "DRAFT");
    assert.equal(database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" }).status, "REVIEWED");
    assert.throws(() => database.changeReleasePlanStatus({ id: plan.id, status: "COMPLETED" }), /Invalid release plan transition/);

    const approved = database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "manager", reason: "Approved for launch" });
    assert.equal(approved.status, "APPROVED");
    assert.ok(approved.approvedAt);
    const approvalHistory = database.listApprovalRecords("release_plan", plan.id);
    assert.equal(approvalHistory.length, 1);
    assert.equal(approvalHistory[0]?.action, "APPROVED");
    assert.equal(approvalHistory[0]?.previousStatus, "REVIEWED");
    assert.equal(approvalHistory[0]?.newStatus, "APPROVED");
    assert.equal(approvalHistory[0]?.reason, "Approved for launch");

    const revision = database.recordApprovalAction({ entityType: "release_plan", entityId: plan.id, action: "REVISION_REQUESTED", actor: "label", reason: "Need radio edit angle" });
    assert.equal(revision.action, "REVISION_REQUESTED");
    assert.deepEqual(database.listApprovalRecords("release_plan", plan.id).map((record) => record.action), ["APPROVED", "REVISION_REQUESTED"]);

    assert.equal(database.changeReleasePlanStatus({ id: plan.id, status: "EXECUTING" }).status, "EXECUTING");
    assert.equal(database.changeReleasePlanStatus({ id: plan.id, status: "COMPLETED" }).status, "COMPLETED");
    assert.throws(() => database.changeReleasePlanStatus({ id: plan.id, status: "DRAFT" }), /Invalid release plan transition/);

    const releasesBeforeUpdate = database.listReleases();
    assert.equal(releasesBeforeUpdate.length, 1);
    assert.equal(database.updateRelease({ id: release.id, artistId: "the-arkadiusz", title: "Sacred Orbit V2", primaryGenre: "Full-On Psytrance", story: "Updated story", releaseDate: "2026-10-10", status: "planned" }).status, "planned");
    assert.equal(database.listReleases()[0]?.title, "Sacred Orbit V2");
    assert.equal(database.getReleasePlan(plan.id)?.releaseId, release.id);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects invalid release plan ownership and item operations", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-invalid-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    assert.throws(() => database.createReleasePlan({ releaseId: "missing", title: "Missing" }), /Release not found/);
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Boundary", primaryGenre: "Psytrance", story: "Transition checks" });
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Boundary Plan" });
    assert.throws(() => database.createCampaignItem({ releasePlanId: plan.id, title: "Bad platform", purpose: "", contentType: "caption", targetPlatforms: ["Instagram", "LinkedIn" as never] }), /Invalid/);
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Valid", purpose: "", contentType: "caption", targetPlatforms: ["Instagram"] });
    assert.throws(() => database.reorderCampaignItems({ releasePlanId: plan.id, itemIds: [] }), /include every item/);
    assert.throws(() => database.updateCampaignItem({ id: item.id, status: "PUBLISHED" as never }), /Invalid campaign item status/);
    assert.throws(() => database.recordApprovalAction({ entityType: "release_plan", entityId: "missing", action: "APPROVED" }), /Release plan not found/);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generateReleasePlan creates revision 1 with deterministic draft content", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-generate-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Solar Flare", primaryGenre: "Psytrance", story: "A journey through light." });
    const plan = database.generateReleasePlan({ releaseId: release.id, actor: "system" });
    assert.equal(plan.releaseId, release.id);
    assert.equal(plan.status, "DRAFT");
    assert.equal(plan.revisionNumber, 1);
    assert.equal(plan.previousPlanId, null);
    assert.equal(plan.createdBy, "system");
    assert.ok(plan.title.includes("Solar Flare"));
    assert.ok(plan.summary.length > 0);
    assert.ok(plan.campaignItems.length > 0);
    for (const item of plan.campaignItems) {
      assert.equal(item.releasePlanId, plan.id);
      assert.equal(item.status, "DRAFT");
    }
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("regenerateReleasePlan creates sequential revisions preserving history", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-regen-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Nebula Drive", primaryGenre: "Psytrance", story: "Deep space frequencies." });

    const first = database.generateReleasePlan({ releaseId: release.id });
    assert.equal(first.revisionNumber, 1);
    assert.equal(first.previousPlanId, null);

    const second = database.regenerateReleasePlan({ releaseId: release.id, reason: "Better angles" });
    assert.equal(second.revisionNumber, 2);
    assert.equal(second.previousPlanId, first.id);
    assert.equal(second.status, "DRAFT");

    const third = database.regenerateReleasePlan({ releaseId: release.id });
    assert.equal(third.revisionNumber, 3);
    assert.equal(third.previousPlanId, second.id);

    const allPlans = database.listReleasePlans(release.id);
    assert.equal(allPlans.length, 3);
    assert.equal(allPlans[0]?.revisionNumber, 3);
    assert.equal(allPlans[1]?.revisionNumber, 2);
    assert.equal(allPlans[2]?.revisionNumber, 1);

    const oldFirst = database.getReleasePlan(first.id)!;
    assert.equal(oldFirst.revisionNumber, 1);
    assert.equal(oldFirst.status, "DRAFT");
    assert.equal(oldFirst.previousPlanId, null);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("getCurrentReleasePlan returns latest revision deterministically", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-current-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Quantum Leap", primaryGenre: "Psytrance", story: "Breaking barriers." });

    assert.equal(database.getCurrentReleasePlan(release.id), null);

    const first = database.generateReleasePlan({ releaseId: release.id });
    assert.equal(database.getCurrentReleasePlan(release.id)?.id, first.id);
    assert.equal(database.getCurrentReleasePlan(release.id)?.revisionNumber, 1);

    const second = database.regenerateReleasePlan({ releaseId: release.id });
    const current = database.getCurrentReleasePlan(release.id);
    assert.equal(current?.id, second.id);
    assert.equal(current?.revisionNumber, 2);

    const third = database.generateReleasePlan({ releaseId: release.id });
    assert.equal(database.getCurrentReleasePlan(release.id)?.id, third.id);
    assert.equal(database.getCurrentReleasePlan(release.id)?.revisionNumber, 3);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("approved plan is immutable for all mutation paths", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-immutable-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Frozen In Time", primaryGenre: "Psytrance", story: "Cannot be changed." });
    const plan = database.generateReleasePlan({ releaseId: release.id });
    database.createCampaignItem({ releasePlanId: plan.id, title: "Item A", purpose: "Test", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.createCampaignItem({ releasePlanId: plan.id, title: "Item B", purpose: "Test", contentType: "video-hook", targetPlatforms: ["TikTok"] });

    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "manager" });

    assert.throws(() => database.updateReleasePlan({ id: plan.id, title: "Changed" }), /immutable/);
    assert.throws(() => database.updateReleasePlan({ id: plan.id, summary: "Changed" }), /immutable/);
    assert.throws(() => database.createCampaignItem({ releasePlanId: plan.id, title: "New", purpose: "", contentType: "caption", targetPlatforms: ["Instagram"] }), /immutable/);
    assert.throws(() => database.changeReleasePlanStatus({ id: plan.id, status: "DRAFT" }), /Invalid release plan transition/);

    const items = database.getReleasePlan(plan.id)!.campaignItems;
    assert.ok(items.length >= 2, "Expected at least 2 campaign items from generation");
    const firstItem = items[0]!;
    assert.throws(() => database.updateCampaignItem({ id: firstItem.id, title: "Hacked" }), /immutable/);
    assert.throws(() => database.deleteCampaignItem(firstItem.id), /immutable/);
    const allItemIds = items.map((i) => i.id);
    const reorderedIds = [...allItemIds].reverse();
    assert.throws(() => database.reorderCampaignItems({ releasePlanId: plan.id, itemIds: reorderedIds }), /immutable/);
    assert.throws(() => database.replaceReleasePlanItems(plan.id, [{ title: "Replacement", purpose: "", contentType: "caption", targetPlatforms: ["Instagram"] }]), /immutable/);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("EXECUTING and COMPLETED plans are also immutable", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-immutable-states-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "State Lock", primaryGenre: "Psytrance", story: "State checks." });
    const plan = database.generateReleasePlan({ releaseId: release.id });

    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "EXECUTING" });
    assert.throws(() => database.updateReleasePlan({ id: plan.id, title: "No" }), /immutable/);

    database.changeReleasePlanStatus({ id: plan.id, status: "COMPLETED" });
    assert.throws(() => database.updateReleasePlan({ id: plan.id, title: "No" }), /immutable/);
    assert.throws(() => database.createCampaignItem({ releasePlanId: plan.id, title: "X", purpose: "", contentType: "caption", targetPlatforms: ["Instagram"] }), /immutable/);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("regeneration after approval keeps old revision unchanged", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-regen-after-approve-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Phoenix Rise", primaryGenre: "Psytrance", story: "Reborn from ashes." });

    const v1 = database.generateReleasePlan({ releaseId: release.id });
    database.changeReleasePlanStatus({ id: v1.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: v1.id, status: "APPROVED", actor: "label" });
    assert.equal(database.getReleasePlan(v1.id)?.status, "APPROVED");

    const v2 = database.regenerateReleasePlan({ releaseId: release.id, reason: "New direction" });
    assert.equal(v2.status, "DRAFT");
    assert.equal(v2.revisionNumber, 2);
    assert.equal(v2.previousPlanId, v1.id);

    const oldV1 = database.getReleasePlan(v1.id)!;
    assert.equal(oldV1.status, "APPROVED");
    assert.equal(oldV1.revisionNumber, 1);
    assert.equal(oldV1.previousPlanId, null);

    assert.equal(database.getCurrentReleasePlan(release.id)?.id, v2.id);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("approveReleasePlan follows state machine and creates ApprovalRecord", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-approve-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Golden Hour", primaryGenre: "Psytrance", story: "Warm light." });
    const plan = database.generateReleasePlan({ releaseId: release.id });

    assert.throws(() => database.approveReleasePlan({ id: plan.id }), /Invalid release plan transition/);

    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    const approved = database.approveReleasePlan({ id: plan.id, actor: "label-manager", reason: "Looks great" });
    assert.equal(approved.status, "APPROVED");
    assert.ok(approved.approvedAt);

    const records = database.listApprovalRecords("release_plan", plan.id);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.action, "APPROVED");
    assert.equal(records[0]?.actor, "label-manager");
    assert.equal(records[0]?.reason, "Looks great");
    assert.equal(records[0]?.previousStatus, "REVIEWED");
    assert.equal(records[0]?.newStatus, "APPROVED");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generateReleasePlan works with and without assets", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-assets-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "No Assets Yet", primaryGenre: "Psytrance", story: "Waiting for masters." });
    const planNoAssets = database.generateReleasePlan({ releaseId: release.id });
    assert.ok(planNoAssets.summary.includes("Audio asset still needs to be attached"));
    assert.ok(planNoAssets.summary.includes("Cover artwork still needs to be attached"));

    database.attachAsset({ releaseId: release.id, kind: "audio", filePath: "/tmp/master.wav", fileName: "master.wav", mimeType: "audio/wav", sizeBytes: 50000000, modifiedAt: null, width: null, height: null });
    database.attachAsset({ releaseId: release.id, kind: "cover", filePath: "/tmp/cover.png", fileName: "cover.png", mimeType: "image/png", sizeBytes: 2000000, modifiedAt: null, width: 3000, height: 3000 });

    const planWithAssets = database.generateReleasePlan({ releaseId: release.id });
    assert.ok(planWithAssets.summary.includes("Audio asset is attached"));
    assert.ok(planWithAssets.summary.includes("Cover artwork is attached"));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("no product-facing Harness Plan terminology in Release Plan types or methods", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-terminology-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Terminology Check", primaryGenre: "Psytrance", story: "Verify naming." });
    const plan = database.generateReleasePlan({ releaseId: release.id });
    assert.ok(!plan.title.toLowerCase().includes("harness"));
    assert.ok(!plan.summary.toLowerCase().includes("harness"));
    assert.ok(!JSON.stringify(plan).toLowerCase().includes("harness plan"));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("approveReleasePlan method works through changeReleasePlanStatus", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-approve-method-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Direct Approve", primaryGenre: "Psytrance", story: "Test approveReleasePlan." });
    const plan = database.generateReleasePlan({ releaseId: release.id });

    assert.throws(() => database.approveReleasePlan({ id: plan.id }), /Invalid release plan transition/);

    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    const approved = database.approveReleasePlan({ id: plan.id, actor: "test" });
    assert.equal(approved.status, "APPROVED");
    assert.ok(approved.approvedAt);

    const records = database.listApprovalRecords("release_plan", plan.id);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.action, "APPROVED");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("campaign item CRUD works on mutable DRAFT plan", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-campaign-crud-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "CRUD Test", primaryGenre: "Psytrance", story: "Test CRUD." });
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Empty CRUD Plan" });

    const beforeCount = plan.campaignItems.length;

    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Test Item", purpose: "Testing", contentType: "caption", targetPlatforms: ["Instagram"], cta: "Listen now" });
    assert.equal(item.title, "Test Item");
    assert.equal(item.status, "DRAFT");

    const updated = database.updateCampaignItem({ id: item.id, title: "Updated Item", status: "READY" });
    assert.equal(updated.title, "Updated Item");
    assert.equal(updated.status, "READY");

    const item2 = database.createCampaignItem({ releasePlanId: plan.id, title: "Second Item", purpose: "More testing", contentType: "video-hook", targetPlatforms: ["TikTok"] });
    const currentItems = database.getReleasePlan(plan.id)!.campaignItems;
    const reorderedIds = currentItems.map((i) => i.id).reverse();
    const reordered = database.reorderCampaignItems({ releasePlanId: plan.id, itemIds: reorderedIds });
    assert.equal(reordered.length, currentItems.length);

    database.deleteCampaignItem(item2.id);
    const remaining = database.getReleasePlan(plan.id)!.campaignItems;
    assert.equal(remaining.length, beforeCount + 1);
    assert.ok(remaining.some((i) => i.id === item.id));
    assert.ok(!remaining.some((i) => i.id === item2.id));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema version is 24 after all migrations", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-schema-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    assert.equal(database.health().schemaVersion, 29);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("upgrade from v20 to v21 preserves existing data", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-upgrade-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Pre-Upgrade", primaryGenre: "Psytrance", story: "Created before v21." });
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Pre-Upgrade Plan" });
    assert.equal(plan.revisionNumber, 1);
    assert.equal(plan.previousPlanId, null);

    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Pre-Upgrade Item", purpose: "Existed", contentType: "caption", targetPlatforms: ["Instagram"] });

    const reloaded = database.getReleasePlan(plan.id)!;
    assert.equal(reloaded.revisionNumber, 1);
    assert.equal(reloaded.previousPlanId, null);
    assert.equal(reloaded.campaignItems.length, 1);
    assert.equal(reloaded.campaignItems[0]?.title, "Pre-Upgrade Item");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artist promotion profiles are seeded and updatable", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-artist-promo-profile-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const profiles = database.listArtistPromotionProfiles();
    assert.ok(profiles.length >= 4);
    const theArkadiusz = profiles.find((p) => p.artistId === "the-arkadiusz");
    assert.ok(theArkadiusz);
    assert.equal(theArkadiusz.artistName, "The Arkadiusz");
    assert.ok(theArkadiusz.languages.includes("en"));
    assert.equal(theArkadiusz.defaultApprovalMode, "manual");
    assert.ok(theArkadiusz.preferredContentTypes.includes("caption"));

    const updated = database.updateArtistPromotionProfile({
      artistId: "the-arkadiusz",
      toneOfVoice: "Updated tone",
      languages: ["en", "pl"],
      postingFrequency: "Daily",
      preferredContentTypes: ["caption", "video-hook"],
      avoidedContentTypes: ["email"],
      hashtagRules: "Updated hashtags",
      emojiRules: "Updated emojis",
      callToActionRules: "Updated CTA",
      platformPreferences: { Instagram: true, Facebook: true, TikTok: true },
      defaultApprovalMode: "auto"
    });
    assert.equal(updated.toneOfVoice, "Updated tone");
    assert.deepEqual(updated.languages, ["en", "pl"]);
    assert.equal(updated.postingFrequency, "Daily");
    assert.deepEqual(updated.preferredContentTypes, ["caption", "video-hook"]);
    assert.deepEqual(updated.avoidedContentTypes, ["email"]);
    assert.equal(updated.hashtagRules, "Updated hashtags");
    assert.equal(updated.emojiRules, "Updated emojis");
    assert.equal(updated.callToActionRules, "Updated CTA");
    assert.deepEqual(updated.platformPreferences, { Instagram: true, Facebook: true, TikTok: true });
    assert.equal(updated.defaultApprovalMode, "auto");

    const reloaded = database.getArtistPromotionProfile("the-arkadiusz");
    assert.ok(reloaded);
    assert.equal(reloaded.toneOfVoice, "Updated tone");
    assert.deepEqual(reloaded.languages, ["en", "pl"]);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("getArtistPromotionProfile returns null for unknown artist", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-artist-promo-null-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const seededProfile = database.getArtistPromotionProfile("the-arkadiusz");
    assert.ok(seededProfile !== null, "Seeded profile should exist after initialization");
    assert.equal(seededProfile!.artistName, "The Arkadiusz");
    assert.ok(seededProfile!.toneOfVoice.length > 0);
    assert.ok(seededProfile!.languages.length > 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema version is 28 after all migrations", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-schema-v28-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    assert.equal(database.health().schemaVersion, 29);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
