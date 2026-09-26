import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migrations } from "./migrations.js";
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

function withPlanDatabase(run: (database: StudioDatabase, file: string) => void) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "release-plan-consolidation-"));
  const file = path.join(directory, "studio.sqlite");
  const database = new StudioDatabase(file);
  try { database.initialize(); run(database, file); }
  finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
}

function draftRelease(database: StudioDatabase) {
  return database.createReleaseDraft({ artistId: "arkadelic", title: "Persistence", primaryGenre: "Psytrance", story: "Domain test" });
}

test("plan revisions, items, versions and approval records survive database reopen", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "release-plan-reopen-"));
  const file = path.join(directory, "studio.sqlite");
  let database = new StudioDatabase(file);
  try {
    database.initialize();
    const release = draftRelease(database);
    const first = database.generateReleasePlan({ releaseId: release.id });
    const edited = database.updateReleasePlan({ id: first.id, title: "Edited", summary: "Summary" });
    assert.equal(edited.version, first.version + 1);
    database.changeReleasePlanStatus({ id: first.id, status: "REVIEWED" });
    const approved = database.approveReleasePlan({ id: first.id, actor: "test-reviewer" });
    const records = database.listApprovalRecords("release_plan", first.id);
    const second = database.regenerateReleasePlan({ releaseId: release.id });
    database.close();
    database = new StudioDatabase(file);
    database.initialize();
    assert.deepEqual(database.getReleasePlan(first.id), approved);
    assert.deepEqual(database.getCurrentReleasePlan(release.id), second);
    assert.deepEqual(database.listApprovalRecords("release_plan", first.id), records);
    assert.equal(database.health().schemaVersion, 32);
    database.initialize();
    assert.deepEqual(database.getReleasePlan(first.id), approved);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const reportedVersion of [19, 30]) {
  test("Release Plan works after upgrading v19 schema reporting version " + reportedVersion, () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "release-plan-recovery-"));
    const file = path.join(directory, "studio.sqlite");
    const raw = new DatabaseSync(file);
    for (const migration of migrations.filter(item => item.version <= 19)) raw.exec(migration.sql);
    raw.exec("PRAGMA user_version = " + reportedVersion);
    raw.close();
    const database = new StudioDatabase(file);
    try {
      database.initialize();
      const release = draftRelease(database);
      const plan = database.generateReleasePlan({ releaseId: release.id });
      assert.equal(plan.revisionNumber, 1);
      assert.ok(plan.campaignItems.length > 0);
      assert.equal(database.health().schemaVersion, 32);
    } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
  });
}

test("failed replacement rolls back deletion and retains original campaign items", () => withPlanDatabase(database => {
  const release = draftRelease(database);
  const plan = database.generateReleasePlan({ releaseId: release.id });
  assert.throws(() => database.replaceReleasePlanItems(plan.id, [
    { title: "Valid", purpose: "", contentType: "caption", targetPlatforms: ["Facebook"] },
    { title: "Invalid", purpose: "", contentType: "caption", targetPlatforms: ["invalid" as never] }
  ]), /Invalid/);
  assert.deepEqual(database.getReleasePlan(plan.id), plan);
}));

test("invalid generated revision leaves previous plan and revision numbering intact", () => withPlanDatabase(database => {
  const release = draftRelease(database);
  const first = database.generateReleasePlan({ releaseId: release.id });
  assert.throws(() => database.generateReleasePlanFromDraft(release.id, { title: " ", summary: "", items: [] }, {}), /title is required/);
  assert.throws(() => database.generateReleasePlanFromDraft(release.id, {
    title: "Invalid generated content", summary: "", items: [{
      title: "Invalid", purpose: "", contentType: "invalid" as never, targetPlatforms: ["Facebook"],
      plannedDate: null, plannedTime: null, cta: "", notes: "", assetRequirements: [], copyRequirements: []
    }]
  }, {}), /Invalid/);
  assert.deepEqual(database.listReleasePlans(release.id), [first]);
  assert.equal(database.regenerateReleasePlan({ releaseId: release.id }).revisionNumber, 2);
}));

test("failed update audit rolls back plan content and version", () => withPlanDatabase((database, file) => {
  const release = draftRelease(database);
  const plan = database.createReleasePlan({ releaseId: release.id, title: "Original" });
  const raw = new DatabaseSync(file);
  try {
    raw.exec("CREATE TRIGGER reject_plan_event BEFORE INSERT ON events WHEN NEW.event_type = 'release_plan.updated' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
    assert.throws(() => database.updateReleasePlan({ id: plan.id, title: "Changed" }), /test audit failure/);
    assert.deepEqual(database.getReleasePlan(plan.id), plan);
  } finally { raw.close(); }
}));

test("invalid order and ownership do not mutate campaign items", () => withPlanDatabase(database => {
  const release = draftRelease(database);
  const plan = database.generateReleasePlan({ releaseId: release.id });
  const item = plan.campaignItems[0]!;
  assert.throws(() => database.updateCampaignItem({ id: item.id, sortOrder: -1 }), /sort order/);
  assert.throws(() => database.createCampaignItem({ releasePlanId: "missing", title: "X", purpose: "", contentType: "caption", targetPlatforms: [] }), /not found/);
  assert.throws(() => database.reorderCampaignItems({ releasePlanId: plan.id, itemIds: plan.campaignItems.map(() => item.id) }), /exactly once/);
  assert.deepEqual(database.getReleasePlan(plan.id), plan);
}));

test("approval and generation never create publishing or scheduling records", () => withPlanDatabase((database, file) => {
  const release = draftRelease(database);
  const plan = database.generateReleasePlan({ releaseId: release.id });
  database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
  database.approveReleasePlan({ id: plan.id });
  const raw = new DatabaseSync(file);
  try {
    for (const table of ["publishing_queue", "schedule_events", "promo_generations"]) {
      assert.equal(raw.prepare("SELECT COUNT(*) AS count FROM " + table).get()?.count, 0);
    }
  } finally { raw.close(); }
}));

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

test("Release Plan uses the current consolidated schema", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-schema-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    assert.equal(database.health().schemaVersion, 32);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("revision metadata is present when reading persisted campaign items", () => {
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
