import type { GenerateReleasePlanInput, RegenerateReleasePlanInput, ReleasePlan } from "../shared/contracts.js";
import type { ConversationProviderRouter } from "./conversation-runtime.js";
import type { StudioDatabase } from "./database/database.js";
import { buildReleasePlanGenerationContext, generateAiReleasePlanDraft } from "./release-plan-ai-generation.js";

export type ReleasePlanGenerationOptions = { signal?: AbortSignal; timeoutMs?: number };

export async function generateAndPersistAiReleasePlan(
  database: StudioDatabase,
  providerRouter: ConversationProviderRouter,
  input: GenerateReleasePlanInput | RegenerateReleasePlanInput,
  regenerate = false,
  options: ReleasePlanGenerationOptions = {}
): Promise<ReleasePlan> {
  if (!input || typeof input.releaseId !== "string" || !input.releaseId.trim()) throw new Error("A release is required.");
  options.signal?.throwIfAborted();
  const timeoutMs = options.timeoutMs ?? 300_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error("Invalid generation timeout.");
  const release = database.listReleases().find(item => item.id === input.releaseId);
  if (!release) throw new Error("Release not found");
  const assets = database.listAssets(release.id);
  const audio = assets.find(asset => asset.kind === "audio");
  const previous = regenerate ? database.getCurrentReleasePlan(release.id) : null;
  const context = buildReleasePlanGenerationContext({
    release, assets,
    brandProfile: database.getBrandProfileForRelease(release.id) ?? null,
    audioAnalysis: audio ? database.getAudioAnalysis(audio.id) : null,
    previousPlan: previous ? {
      title: previous.title, summary: previous.summary,
      items: previous.campaignItems.map(item => ({ title: item.title, purpose: item.purpose, contentType: item.contentType, targetPlatforms: item.targetPlatforms }))
    } : null
  });
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new DOMException("Release Plan generation timed out.", "TimeoutError")), timeoutMs);
  let onAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    let result;
    try {
      result = await Promise.race([generateAiReleasePlanDraft(context, { providerRouter, signal }), aborted]);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) throw error;
      throw new Error("Release Plan provider failed. No plan was saved.");
    }
    signal.throwIfAborted();
    if (!result) throw new Error("Release Plan generation failed or returned invalid data. No plan was saved.");
    // Persistence starts only after the entire response has passed validation.
    return regenerate
      ? database.regenerateReleasePlanFromDraft(release.id, result.draft, { actor: input.actor, reason: (input as RegenerateReleasePlanInput).reason })
      : database.generateReleasePlanFromDraft(release.id, result.draft, { actor: input.actor });
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
