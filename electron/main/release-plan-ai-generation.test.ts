import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ConversationProviderName, ConversationProviderRouteResult, ConversationProviderRouter } from "./conversation-runtime.js";
import { StudioDatabase } from "./database/database.js";
import {
  buildReleasePlanGenerationContext,
  buildReleasePlanSystemPrompt,
  buildReleasePlanUserPrompt,
  validateAndNormalizeDraft,
  generateAiReleasePlanDraft,
  type ReleasePlanGenerationContext
} from "./release-plan-ai-generation.js";

function createMockProviderRouter(output: string, options?: { ok?: boolean; provider?: ConversationProviderName; model?: string; fallbackUsed?: boolean }): ConversationProviderRouter {
  const ok = options?.ok ?? true;
  const provider = options?.provider ?? "ollama";
  const model = options?.model ?? "qwen3.5:9b";
  const fallbackUsed = options?.fallbackUsed ?? false;
  return async (): Promise<ConversationProviderRouteResult> => ({
    ok,
    provider,
    model,
    output,
    durationMs: 42,
    attempts: [{ provider, model, label: "Mock", ok, durationMs: 42 }],
    trace: { startTimestamp: new Date().toISOString(), endTimestamp: new Date().toISOString(), durationMs: 42, finalStatus: ok ? "success" : "crash", fallbackUsed, diagnostics: [] }
  });
}

function createFailingProviderRouter(): ConversationProviderRouter {
  return async (): Promise<ConversationProviderRouteResult> => ({
    ok: false,
    output: "",
    durationMs: 10,
    attempts: [{ provider: "ollama", model: "qwen3.5:9b", label: "Mock", ok: false, durationMs: 10, errorType: "PROVIDER_UNAVAILABLE", errorMessage: "Mock failure" }],
    errorMessage: "Mock provider failure"
  });
}

function createTestContext(overrides?: { releaseDate?: string | null; assets?: boolean; previousPlan?: boolean }): ReleasePlanGenerationContext {
  const releaseDate = overrides?.releaseDate === undefined ? "2026-10-15" : overrides.releaseDate;
  return buildReleasePlanGenerationContext({
    release: {
      id: "rel-test-001",
      title: "Solar Flare",
      artistId: "the-arkadiusz",
      artistName: "The Arkadiusz",
      primaryGenre: "Psytrance",
      story: "A journey through light.",
      status: "planned",
      releaseDate,
      createdAt: "2026-01-01T00:00:00Z"
    },
    assets: overrides?.assets === false ? [] : [
      { id: "asset-audio-1", releaseId: "rel-test-001", trackId: null, kind: "audio", filePath: "/tmp/master.wav", fileName: "master.wav", mimeType: "audio/wav", sizeBytes: 50000000, modifiedAt: null, createdAt: "2026-01-01T00:00:00Z", width: null, height: null },
      { id: "asset-cover-1", releaseId: "rel-test-001", trackId: null, kind: "cover", filePath: "/tmp/cover.png", fileName: "cover.png", mimeType: "image/png", sizeBytes: 2000000, modifiedAt: null, createdAt: "2026-01-01T00:00:00Z", width: 3000, height: 3000 }
    ],
    brandProfile: null,
    audioAnalysis: null,
    previousPlan: overrides?.previousPlan === false ? null : overrides?.previousPlan === true ? {
      title: "Solar Flare Release Plan",
      summary: "Previous plan for Solar Flare.",
      items: [{ title: "Old announcement", purpose: "Announce", contentType: "caption", targetPlatforms: ["Instagram"] }]
    } : null,
    analyticsSummary: null
  });
}

const VALID_AI_RESPONSE = JSON.stringify({
  title: "Solar Flare Campaign",
  summary: "A focused promotion arc for Solar Flare across key platforms.",
  items: [
    { title: "Release announcement", purpose: "Introduce the track", contentType: "caption", targetPlatforms: ["Instagram", "Facebook"], plannedDate: "2026-10-15", plannedTime: "10:00", cta: "Listen now", notes: "Use cover art", assetRequirements: ["cover"], copyRequirements: ["hook"] },
    { title: "Teaser video", purpose: "Build anticipation", contentType: "video-hook", targetPlatforms: ["TikTok", "YouTube"], plannedDate: "2026-10-08", plannedTime: "16:00", cta: "Follow for release", notes: "Use best drop", assetRequirements: ["audio excerpt"], copyRequirements: ["visual cue"] },
    { title: "Countdown post", purpose: "Final push", contentType: "caption", targetPlatforms: ["Instagram"], plannedDate: "2026-10-14", plannedTime: "12:00", cta: "Tomorrow!", notes: "", assetRequirements: [], copyRequirements: [] }
  ]
});

test("buildReleasePlanSystemPrompt returns structured prompt", () => {
  const prompt = buildReleasePlanSystemPrompt();
  assert.ok(prompt.includes("Release Plan"));
  assert.ok(prompt.includes("JSON"));
  assert.ok(prompt.includes("contentType"));
  assert.ok(prompt.includes("targetPlatforms"));
  assert.ok(!prompt.toLowerCase().includes("harness"));
});

test("buildReleasePlanUserPrompt includes release context", () => {
  const context = createTestContext();
  const prompt = buildReleasePlanUserPrompt(context);
  assert.ok(prompt.includes("The Arkadiusz"));
  assert.ok(prompt.includes("Solar Flare"));
  assert.ok(prompt.includes("Psytrance"));
  assert.ok(prompt.includes("2026-10-15"));
  assert.ok(prompt.includes("Audio master: attached"));
  assert.ok(prompt.includes("Cover artwork: attached"));
});

test("buildReleasePlanUserPrompt handles missing assets", () => {
  const context = createTestContext({ assets: false });
  const prompt = buildReleasePlanUserPrompt(context);
  assert.ok(prompt.includes("Audio master: not yet attached"));
  assert.ok(prompt.includes("Cover artwork: not yet attached"));
});

test("buildReleasePlanUserPrompt handles missing release date", () => {
  const context = createTestContext({ releaseDate: null });
  const prompt = buildReleasePlanUserPrompt(context);
  assert.ok(prompt.includes("Release date: not set"));
});

test("buildReleasePlanUserPrompt includes previous plan for regeneration", () => {
  const context = createTestContext({ previousPlan: true });
  const prompt = buildReleasePlanUserPrompt(context);
  assert.ok(prompt.includes("Previous plan revision"));
  assert.ok(prompt.includes("Old announcement"));
});

test("validateAndNormalizeDraft accepts valid AI output", () => {
  const raw = JSON.parse(VALID_AI_RESPONSE);
  const draft = validateAndNormalizeDraft(raw);
  assert.ok(draft !== null);
  assert.equal(draft!.title, "Solar Flare Campaign");
  assert.equal(draft!.items.length, 3);
  assert.equal(draft!.items[0]?.contentType, "caption");
  assert.deepEqual(draft!.items[0]?.targetPlatforms, ["Instagram", "Facebook"]);
});

test("validateAndNormalizeDraft rejects null/undefined", () => {
  assert.equal(validateAndNormalizeDraft(null), null);
  assert.equal(validateAndNormalizeDraft(undefined), null);
  assert.equal(validateAndNormalizeDraft("string"), null);
});

test("validateAndNormalizeDraft rejects missing title", () => {
  const raw = { summary: "Test", items: [{ title: "Item", purpose: "P", contentType: "caption", targetPlatforms: ["Instagram"] }] };
  assert.equal(validateAndNormalizeDraft(raw), null);
});

test("validateAndNormalizeDraft rejects empty title", () => {
  const raw = { title: "  ", summary: "Test", items: [{ title: "Item", purpose: "P", contentType: "caption", targetPlatforms: ["Instagram"] }] };
  assert.equal(validateAndNormalizeDraft(raw), null);
});

test("validateAndNormalizeDraft rejects missing items array", () => {
  const raw = { title: "Test", summary: "Summary" };
  assert.equal(validateAndNormalizeDraft(raw), null);
});

test("validateAndNormalizeDraft rejects empty items array", () => {
  const raw = { title: "Test", summary: "Summary", items: [] };
  assert.equal(validateAndNormalizeDraft(raw), null);
});

test("validateAndNormalizeDraft filters items with invalid contentType", () => {
  const raw = {
    title: "Test",
    summary: "Summary",
    items: [
      { title: "Valid", purpose: "P", contentType: "caption", targetPlatforms: ["Instagram"] },
      { title: "Invalid", purpose: "P", contentType: "invalid-type", targetPlatforms: ["Instagram"] }
    ]
  };
  const draft = validateAndNormalizeDraft(raw);
  assert.ok(draft !== null);
  assert.equal(draft!.items.length, 1);
  assert.equal(draft!.items[0]?.title, "Valid");
});

test("validateAndNormalizeDraft rejects items with no valid platforms", () => {
  const raw = {
    title: "Test",
    summary: "Summary",
    items: [{ title: "Item", purpose: "P", contentType: "caption", targetPlatforms: [] }]
  };
  assert.equal(validateAndNormalizeDraft(raw), null);
});

test("validateAndNormalizeDraft normalizes platform names", () => {
  const raw = {
    title: "Test",
    summary: "Summary",
    items: [{ title: "Item", purpose: "P", contentType: "caption", targetPlatforms: ["instagram", "FACEBOOK", "TikTok"] }]
  };
  const draft = validateAndNormalizeDraft(raw);
  assert.ok(draft !== null);
  assert.deepEqual(draft!.items[0]?.targetPlatforms, ["Instagram", "Facebook", "TikTok"]);
});

test("validateAndNormalizeDraft normalizes date strings", () => {
  const raw = {
    title: "Test",
    summary: "Summary",
    items: [{ title: "Item", purpose: "P", contentType: "caption", targetPlatforms: ["Instagram"], plannedDate: "2026-10-15" }]
  };
  const draft = validateAndNormalizeDraft(raw);
  assert.ok(draft !== null);
  assert.equal(draft!.items[0]?.plannedDate, "2026-10-15");
});

test("validateAndNormalizeDraft rejects invalid date strings", () => {
  const raw = {
    title: "Test",
    summary: "Summary",
    items: [{ title: "Item", purpose: "P", contentType: "caption", targetPlatforms: ["Instagram"], plannedDate: "not-a-date" }]
  };
  const draft = validateAndNormalizeDraft(raw);
  assert.ok(draft !== null);
  assert.equal(draft!.items[0]?.plannedDate, null);
});

test("validateAndNormalizeDraft normalizes time strings", () => {
  const raw = {
    title: "Test",
    summary: "Summary",
    items: [{ title: "Item", purpose: "P", contentType: "caption", targetPlatforms: ["Instagram"], plannedTime: "10:00" }]
  };
  const draft = validateAndNormalizeDraft(raw);
  assert.ok(draft !== null);
  assert.equal(draft!.items[0]?.plannedTime, "10:00");
});

test("validateAndNormalizeDraft rejects invalid time strings", () => {
  const raw = {
    title: "Test",
    summary: "Summary",
    items: [{ title: "Item", purpose: "P", contentType: "caption", targetPlatforms: ["Instagram"], plannedTime: "25:00" }]
  };
  const draft = validateAndNormalizeDraft(raw);
  assert.ok(draft !== null);
  assert.equal(draft!.items[0]?.plannedTime, null);
});

test("generateAiReleasePlanDraft returns validated draft on success", async () => {
  const context = createTestContext();
  const router = createMockProviderRouter(VALID_AI_RESPONSE);
  const result = await generateAiReleasePlanDraft(context, { providerRouter: router });
  assert.ok(result !== null);
  assert.equal(result!.draft.title, "Solar Flare Campaign");
  assert.equal(result!.draft.items.length, 3);
  assert.equal(result!.provider, "ollama");
  assert.equal(result!.model, "qwen3.5:9b");
  assert.equal(result!.fallbackUsed, false);
});

test("generateAiReleasePlanDraft returns null on provider failure", async () => {
  const context = createTestContext();
  const router = createFailingProviderRouter();
  const result = await generateAiReleasePlanDraft(context, { providerRouter: router });
  assert.equal(result, null);
});

test("generateAiReleasePlanDraft returns null on invalid JSON", async () => {
  const context = createTestContext();
  const router = createMockProviderRouter("This is not JSON at all");
  const result = await generateAiReleasePlanDraft(context, { providerRouter: router });
  assert.equal(result, null);
});

test("generateAiReleasePlanDraft returns null on empty output", async () => {
  const context = createTestContext();
  const router = createMockProviderRouter("");
  const result = await generateAiReleasePlanDraft(context, { providerRouter: router });
  assert.equal(result, null);
});

test("generateAiReleasePlanDraft strips <think> tags before parsing", async () => {
  const responseWithThinking = `<think>Let me plan this carefully.</think>${VALID_AI_RESPONSE}`;
  const context = createTestContext();
  const router = createMockProviderRouter(responseWithThinking);
  const result = await generateAiReleasePlanDraft(context, { providerRouter: router });
  assert.ok(result !== null);
  assert.equal(result!.draft.title, "Solar Flare Campaign");
});

test("generateAiReleasePlanDraft handles markdown-fenced JSON", async () => {
  const fencedResponse = "```json\n" + VALID_AI_RESPONSE + "\n```";
  const context = createTestContext();
  const router = createMockProviderRouter(fencedResponse);
  const result = await generateAiReleasePlanDraft(context, { providerRouter: router });
  assert.ok(result !== null);
  assert.equal(result!.draft.title, "Solar Flare Campaign");
});

test("generateAiReleasePlanDraft preserves provider trace", async () => {
  const context = createTestContext();
  const router = createMockProviderRouter(VALID_AI_RESPONSE, { fallbackUsed: true });
  const result = await generateAiReleasePlanDraft(context, { providerRouter: router });
  assert.ok(result !== null);
  assert.equal(result!.fallbackUsed, true);
});

test("AI-generated plan persists as DRAFT through database", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-ai-persist-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "AI Test", primaryGenre: "Psytrance", story: "Test AI persistence." });
    const draft = JSON.parse(VALID_AI_RESPONSE);
    const validatedDraft = validateAndNormalizeDraft(draft);
    assert.ok(validatedDraft !== null);
    const plan = database.generateReleasePlanFromDraft(release.id, validatedDraft!, { actor: "ai" });
    assert.equal(plan.status, "DRAFT");
    assert.equal(plan.createdBy, "ai");
    assert.equal(plan.campaignItems.length, 3);
    for (const item of plan.campaignItems) {
      assert.equal(item.releasePlanId, plan.id);
      assert.equal(item.status, "DRAFT");
    }
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("AI output cannot control revisionNumber", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-ai-revision-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Revision Test", primaryGenre: "Psytrance", story: "Test." });
    const draft = validateAndNormalizeDraft(JSON.parse(VALID_AI_RESPONSE))!;
    const plan1 = database.generateReleasePlanFromDraft(release.id, draft, {});
    assert.equal(plan1.revisionNumber, 1);
    const plan2 = database.generateReleasePlanFromDraft(release.id, draft, {});
    assert.equal(plan2.revisionNumber, 2);
    assert.equal(plan2.previousPlanId, plan1.id);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("AI output cannot control status", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-ai-status-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Status Test", primaryGenre: "Psytrance", story: "Test." });
    const draft = validateAndNormalizeDraft(JSON.parse(VALID_AI_RESPONSE))!;
    const plan = database.generateReleasePlanFromDraft(release.id, draft, {});
    assert.equal(plan.status, "DRAFT");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("campaign item IDs are generated by application", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-ai-ids-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "ID Test", primaryGenre: "Psytrance", story: "Test." });
    const draft = validateAndNormalizeDraft(JSON.parse(VALID_AI_RESPONSE))!;
    const plan = database.generateReleasePlanFromDraft(release.id, draft, {});
    for (const item of plan.campaignItems) {
      assert.ok(typeof item.id === "string");
      assert.ok(item.id.length > 0);
      assert.equal(item.releasePlanId, plan.id);
    }
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("regeneration with AI draft creates new revision", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-ai-regen-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Regen Test", primaryGenre: "Psytrance", story: "Test." });
    const draft1 = validateAndNormalizeDraft(JSON.parse(VALID_AI_RESPONSE))!;
    const v1 = database.generateReleasePlanFromDraft(release.id, draft1, {});
    assert.equal(v1.revisionNumber, 1);
    const draft2 = validateAndNormalizeDraft({
      title: "Regen Campaign",
      summary: "New plan.",
      items: [{ title: "New item", purpose: "Test", contentType: "video-hook", targetPlatforms: ["TikTok"] }]
    });
    assert.ok(draft2 !== null);
    const v2 = database.regenerateReleasePlanFromDraft(release.id, draft2!, { reason: "New direction" });
    assert.equal(v2.revisionNumber, 2);
    assert.equal(v2.previousPlanId, v1.id);
    assert.equal(v2.status, "DRAFT");
    const oldV1 = database.getReleasePlan(v1.id)!;
    assert.equal(oldV1.revisionNumber, 1);
    assert.equal(oldV1.campaignItems.length, 3);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("regeneration after approval succeeds with AI draft", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-ai-regen-approve-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Regen Approve", primaryGenre: "Psytrance", story: "Test." });
    const draft1 = validateAndNormalizeDraft(JSON.parse(VALID_AI_RESPONSE))!;
    const v1 = database.generateReleasePlanFromDraft(release.id, draft1, {});
    database.changeReleasePlanStatus({ id: v1.id, status: "REVIEWED" });
    database.changeReleasePlanStatus({ id: v1.id, status: "APPROVED", actor: "label" });
    assert.equal(database.getReleasePlan(v1.id)?.status, "APPROVED");
    const draft2 = validateAndNormalizeDraft({
      title: "New Direction",
      summary: "Fresh plan.",
      items: [{ title: "Fresh item", purpose: "Test", contentType: "caption", targetPlatforms: ["Instagram"] }]
    });
    assert.ok(draft2 !== null);
    const v2 = database.regenerateReleasePlanFromDraft(release.id, draft2!, { reason: "Approved plan needs update" });
    assert.equal(v2.status, "DRAFT");
    assert.equal(v2.revisionNumber, 2);
    assert.equal(v2.previousPlanId, v1.id);
    assert.equal(database.getReleasePlan(v1.id)?.status, "APPROVED");
    assert.equal(database.getCurrentReleasePlan(release.id)?.id, v2.id);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("no product-facing Harness Plan terminology in AI generation output", () => {
  const context = createTestContext();
  const systemPrompt = buildReleasePlanSystemPrompt();
  const userPrompt = buildReleasePlanUserPrompt(context);
  assert.ok(!systemPrompt.toLowerCase().includes("harness plan"));
  assert.ok(!systemPrompt.toLowerCase().includes("harness"));
  assert.ok(!userPrompt.toLowerCase().includes("harness plan"));
  const draft = validateAndNormalizeDraft(JSON.parse(VALID_AI_RESPONSE));
  assert.ok(draft !== null);
  assert.ok(!JSON.stringify(draft).toLowerCase().includes("harness"));
});

test("fallback behavior: database generateReleasePlan still works without AI", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-fallback-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Fallback Test", primaryGenre: "Psytrance", story: "Test." });
    const plan = database.generateReleasePlan({ releaseId: release.id, actor: "system" });
    assert.equal(plan.status, "DRAFT");
    assert.equal(plan.revisionNumber, 1);
    assert.ok(plan.campaignItems.length > 0);
    assert.ok(plan.title.includes("Fallback Test"));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("provider diagnostics are available in generation result", async () => {
  const context = createTestContext();
  const router = createMockProviderRouter(VALID_AI_RESPONSE, { provider: "ollama", model: "qwen3.5:9b", fallbackUsed: false });
  const result = await generateAiReleasePlanDraft(context, { providerRouter: router });
  assert.ok(result !== null);
  assert.equal(result!.provider, "ollama");
  assert.equal(result!.model, "qwen3.5:9b");
  assert.ok(typeof result!.durationMs === "number");
  assert.ok(result!.durationMs >= 0);
});

test("AI generation with mocked provider integration test", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ai-studio-release-plan-ai-integration-"));
  const database = new StudioDatabase(path.join(directory, "studio.sqlite"));
  try {
    database.initialize();
    const release = database.createReleaseDraft({ artistId: "the-arkadiusz", title: "Integration Test", primaryGenre: "Psytrance", story: "Full integration." });
    const assets = database.listAssets(release.id);
    const context = buildReleasePlanGenerationContext({
      release: database.listReleases().find((r) => r.id === release.id)!,
      assets,
      brandProfile: null,
      audioAnalysis: null,
      previousPlan: null,
      analyticsSummary: null
    });
    const router = createMockProviderRouter(VALID_AI_RESPONSE);
    const aiResult = await generateAiReleasePlanDraft(context, { providerRouter: router });
    assert.ok(aiResult !== null);
    const plan = database.generateReleasePlanFromDraft(release.id, aiResult!.draft, { actor: "ai-test" });
    assert.equal(plan.status, "DRAFT");
    assert.equal(plan.revisionNumber, 1);
    assert.equal(plan.campaignItems.length, 3);
    assert.ok(plan.title.includes("Solar Flare Campaign"));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("buildReleasePlanUserPrompt includes analytics summary when present", () => {
  const context = buildReleasePlanGenerationContext({
    release: {
      id: "rel-analytics-001", title: "Test Track", artistId: "the-arkadiusz", artistName: "The Arkadiusz",
      primaryGenre: "Psytrance", story: "Test.", status: "planned", releaseDate: "2026-11-01", createdAt: "2026-01-01T00:00:00Z"
    },
    assets: [], brandProfile: null, audioAnalysis: null, previousPlan: null,
    analyticsSummary: {
      releaseId: "rel-analytics-001", totalSnapshots: 12, recentSnapshotAt: "2026-10-15T10:00:00.000Z",
      platforms: [
        { platform: "Instagram", postCount: 8, avgReach: 450, avgImpressions: 720, avgLikes: 25, avgComments: 4, avgShares: 2, totalReach: 3600, totalImpressions: 5760, totalLikes: 200, totalComments: 32, totalShares: 16 },
        { platform: "Facebook", postCount: 4, avgReach: 200, avgImpressions: 350, avgLikes: 10, avgComments: 2, avgShares: 1, totalReach: 800, totalImpressions: 1400, totalLikes: 40, totalComments: 8, totalShares: 4 }
      ]
    }
  });
  const prompt = buildReleasePlanUserPrompt(context);
  assert.ok(prompt.includes("Historical post-publish analytics"), "Should include analytics section header");
  assert.ok(prompt.includes("Total past posts with analytics: 12"), "Should include total snapshot count");
  assert.ok(prompt.includes("Instagram: 8 posts"), "Should include Instagram summary");
  assert.ok(prompt.includes("avg reach 450"), "Should include avg reach");
  assert.ok(prompt.includes("Facebook: 4 posts"), "Should include Facebook summary");
  assert.ok(prompt.includes("do not repeat past campaigns"), "Should include innovation guidance");
  assert.ok(!prompt.includes("rel-analytics-001"), "Should not expose internal release ID");
});

test("buildReleasePlanUserPrompt works without analytics (null summary)", () => {
  const context = buildReleasePlanGenerationContext({
    release: {
      id: "rel-no-analytics", title: "Test Track", artistId: "the-arkadiusz", artistName: "The Arkadiusz",
      primaryGenre: "Psytrance", story: "Test.", status: "planned", releaseDate: "2026-11-01", createdAt: "2026-01-01T00:00:00Z"
    },
    assets: [], brandProfile: null, audioAnalysis: null, previousPlan: null, analyticsSummary: null
  });
  const prompt = buildReleasePlanUserPrompt(context);
  assert.ok(!prompt.includes("Historical post-publish analytics"), "Should not include analytics section");
  assert.ok(prompt.includes("Artist: The Arkadiusz"), "Should still include basic release info");
});

test("buildReleasePlanUserPrompt works with empty analytics (0 snapshots)", () => {
  const context = buildReleasePlanGenerationContext({
    release: {
      id: "rel-empty-analytics", title: "Test Track", artistId: "the-arkadiusz", artistName: "The Arkadiusz",
      primaryGenre: "Psytrance", story: "Test.", status: "planned", releaseDate: "2026-11-01", createdAt: "2026-01-01T00:00:00Z"
    },
    assets: [], brandProfile: null, audioAnalysis: null, previousPlan: null,
    analyticsSummary: { releaseId: "rel-empty-analytics", totalSnapshots: 0, platforms: [], recentSnapshotAt: null }
  });
  const prompt = buildReleasePlanUserPrompt(context);
  assert.ok(!prompt.includes("Historical post-publish analytics"), "Should not include analytics section for 0 snapshots");
});

test("analytics summary is bounded to platform-level aggregates", () => {
  const context = buildReleasePlanGenerationContext({
    release: {
      id: "rel-bounded", title: "Test Track", artistId: "the-arkadiusz", artistName: "The Arkadiusz",
      primaryGenre: "Psytrance", story: "Test.", status: "planned", releaseDate: "2026-11-01", createdAt: "2026-01-01T00:00:00Z"
    },
    assets: [], brandProfile: null, audioAnalysis: null, previousPlan: null,
    analyticsSummary: {
      releaseId: "rel-bounded", totalSnapshots: 50, recentSnapshotAt: "2026-10-15T10:00:00.000Z",
      platforms: [
        { platform: "Instagram", postCount: 30, avgReach: 1000, avgImpressions: 2000, avgLikes: 50, avgComments: 10, avgShares: 5, totalReach: 30000, totalImpressions: 60000, totalLikes: 1500, totalComments: 300, totalShares: 150 }
      ]
    }
  });
  const prompt = buildReleasePlanUserPrompt(context);
  const lines = prompt.split("\n");
  const analyticsLines = lines.filter((l) => l.startsWith("- Instagram:") || l.includes("Total past posts") || l.includes("Most recent"));
  assert.ok(analyticsLines.length <= 4, "Analytics section should be compact (max ~4 lines)");
  assert.ok(!prompt.includes("30000"), "Should not include raw totalReach in prompt");
  assert.ok(!prompt.includes("60000"), "Should not include raw totalImpressions in prompt");
});

test("no raw internal IDs exposed in analytics prompt", () => {
  const context = buildReleasePlanGenerationContext({
    release: {
      id: "rel-secret-id", title: "Test Track", artistId: "the-arkadiusz", artistName: "The Arkadiusz",
      primaryGenre: "Psytrance", story: "Test.", status: "planned", releaseDate: "2026-11-01", createdAt: "2026-01-01T00:00:00Z"
    },
    assets: [], brandProfile: null, audioAnalysis: null, previousPlan: null,
    analyticsSummary: {
      releaseId: "rel-secret-id", totalSnapshots: 5, recentSnapshotAt: "2026-10-15T10:00:00.000Z",
      platforms: [{ platform: "Instagram", postCount: 5, avgReach: 100, avgImpressions: 200, avgLikes: 10, avgComments: 2, avgShares: 1, totalReach: 500, totalImpressions: 1000, totalLikes: 50, totalComments: 10, totalShares: 5 }]
    }
  });
  const prompt = buildReleasePlanUserPrompt(context);
  assert.ok(!prompt.includes("rel-secret-id"), "Should not expose release ID");
  assert.ok(!prompt.includes("the-arkadiusz"), "Should not expose artist ID (only artist name)");
});
