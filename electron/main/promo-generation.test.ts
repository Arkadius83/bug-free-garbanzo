import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioDatabase } from "./database/database.js";
import { generatePromoContent } from "./promo-generation.js";

function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-promo-gen-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  database.initialize();
  const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Test Release", primaryGenre: "House", story: "A test story" });
  const getReleaseSummary = () => ({ id: release.id, artistId: "the-arkadiusz" as const, artistName: "Test Artist", title: "Test Release", primaryGenre: "House", story: "A test story", releaseDate: "2026-12-01", status: "planned" as const, createdAt: "2026-09-15T10:00:00Z" });
  return { database, release, directory, getReleaseSummary };
}

test("rejects generation when release plan is DRAFT", async () => {
  const { database, release, directory } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Draft Plan", summary: "Not approved" });
    database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    await assert.rejects(
      () => generatePromoContent({ releasePlanId: plan.id, model: "test", language: "en" }, { database, getReleaseSummary: () => undefined }),
      /Only an APPROVED Release Plan can generate promo content/
    );
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("rejects generation when release plan is REVIEWED", async () => {
  const { database, release, directory } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Reviewed Plan", summary: "Almost" });
    database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    await assert.rejects(
      () => generatePromoContent({ releasePlanId: plan.id, model: "test", language: "en" }, { database, getReleaseSummary: () => undefined }),
      /Only an APPROVED Release Plan can generate promo content/
    );
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("generates promo content for approved plan with generable items", async () => {
  const { database, release, directory, getReleaseSummary } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Approved Plan", summary: "Ready" });
    database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.createCampaignItem({ releasePlanId: plan.id, title: "Hook", purpose: "Teaser", contentType: "video-hook", targetPlatforms: ["TikTok"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    const result = await generatePromoContent({ releasePlanId: plan.id, model: "qwen3:4b", language: "en" }, { database, getReleaseSummary });
    assert.equal(result.totalItems, 2);
    assert.equal(result.items.length, 2);
    assert.equal(typeof result.items[0].status, "string");
    assert.ok(typeof result.items[0].promoGenerationId === "string");
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("skips unsupported content types", async () => {
  const { database, release, directory, getReleaseSummary } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    database.createCampaignItem({ releasePlanId: plan.id, title: "Other", purpose: "N/A", contentType: "other", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    const result = await generatePromoContent({ releasePlanId: plan.id, model: "test", language: "en" }, { database, getReleaseSummary });
    assert.equal(result.totalItems, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.items[0].status, "SKIPPED");
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("does not re-generate for existing campaign item generations", async () => {
  const { database, release, directory, getReleaseSummary } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Existing content", status: "SUCCESS", model: "prev" });

    const result = await generatePromoContent({ releasePlanId: plan.id, model: "test", language: "en" }, { database, getReleaseSummary });
    assert.equal(result.totalItems, 1);
    assert.equal(result.items[0].status, "SUCCESS");
    assert.ok(typeof result.items[0].promoGenerationId === "string");
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("persists generation records in database", async () => {
  const { database, release, directory, getReleaseSummary } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    await generatePromoContent({ releasePlanId: plan.id, model: "test", language: "en" }, { database, getReleaseSummary });

    const promos = database.listPromoGenerations(plan.id);
    assert.ok(promos.length >= 1);
    assert.equal(promos[0].releasePlanId, plan.id);
    assert.equal(promos[0].campaignItemId, item.id);
    assert.equal(promos[0].contentType, "caption");
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("promo generation starts with GENERATED review status", () => {
  const { database, release, directory, getReleaseSummary } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Test content", status: "SUCCESS", model: "test" });

    const promo = database.getPromoGenerationByCampaignItem(item.id);
    assert.ok(promo);
    assert.equal(promo.reviewStatus, "GENERATED");
    assert.equal(promo.originalContent, "Test content");
    assert.equal(promo.editedContent, null);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("updatePromoGenerationReview sets review status and metadata", () => {
  const { database, release, directory } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Test", status: "SUCCESS", model: "test" });

    const updated = database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED", reviewActor: "admin", reviewReason: "Looks good" });
    assert.equal(updated.reviewStatus, "APPROVED");
    assert.equal(updated.reviewActor, "admin");
    assert.equal(updated.reviewReason, "Looks good");
    assert.ok(updated.reviewedAt);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("editPromoGenerationContent saves edited content and sets EDITED status", () => {
  const { database, release, directory } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Original", status: "SUCCESS", model: "test" });

    const edited = database.editPromoGenerationContent({ promoGenerationId: promo.id, editedContent: "Edited version" });
    assert.equal(edited.reviewStatus, "EDITED");
    assert.equal(edited.editedContent, "Edited version");
    assert.equal(edited.originalContent, "Original");
    assert.equal(edited.generatedContent, "Original");
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("editPromoGenerationContent rejects editing approved content", () => {
  const { database, release, directory } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Test", status: "SUCCESS", model: "test" });
    database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED" });

    assert.throws(() => database.editPromoGenerationContent({ promoGenerationId: promo.id, editedContent: "Nope" }), /Approved content cannot be edited/);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("retryPromoGeneration updates existing record and resets review status", () => {
  const { database, release, directory } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Old content", status: "SUCCESS", model: "old" });
    database.updatePromoGenerationReview({ promoGenerationId: promo.id, reviewStatus: "APPROVED" });

    const retried = database.retryPromoGeneration({ promoGenerationId: promo.id, generatedContent: "New content", model: "new" });
    assert.equal(retried.generatedContent, "New content");
    assert.equal(retried.model, "new");
    assert.equal(retried.reviewStatus, "GENERATED");
    assert.equal(retried.editedContent, null);
    assert.equal(retried.reviewActor, null);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("getPromoGenerationById retrieves by id", () => {
  const { database, release, directory } = setup();
  try {
    const plan = database.createReleasePlan({ releaseId: release.id, title: "Plan", summary: "Test" });
    const item = database.createCampaignItem({ releasePlanId: plan.id, title: "Caption", purpose: "Post", contentType: "caption", targetPlatforms: ["Instagram"] });
    database.changeReleasePlanStatus({ id: plan.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: plan.id, status: "APPROVED", actor: "mgr", reason: "ok" });

    const promo = database.insertPromoGeneration({ releaseId: release.id, releasePlanId: plan.id, campaignItemId: item.id, contentType: "caption", generatedContent: "Test", status: "SUCCESS", model: "test" });
    const found = database.getPromoGenerationById(promo.id);
    assert.ok(found);
    assert.equal(found.id, promo.id);
    assert.equal(found.reviewStatus, "GENERATED");
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});
