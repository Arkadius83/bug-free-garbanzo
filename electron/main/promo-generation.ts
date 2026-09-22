import type { CampaignItem, CampaignItemContentType, CampaignChannel, ContentLanguage, GeneratePromoContentInput, PromoGeneration, PromoGenerationResult, ReleasePlan, ReleaseSummary } from "../shared/contracts.js";
import type { StudioDatabase } from "./database/database.js";
import { generateCampaignDraft } from "./ollama.js";

const GENERABLE_CONTENT_TYPES = new Set<CampaignItemContentType>(["caption", "video-hook", "video-script", "image-prompt", "visualizer-prompt"]);

const CANONICAL_ARTIST_NAMES = new Set(["The Arkadiusz", "Arkadelic", "AR-TEK", "Echoes of Arcadia"]);

function buildCanonicalProtectionForPromo(artistName: string, releaseTitle: string): string {
  const parts: string[] = [];
  if (CANONICAL_ARTIST_NAMES.has(artistName)) {
    parts.push(`Artist name "${artistName}" is a canonical proper noun. Use it exactly as written. Do not translate, respell, transliterate, abbreviate, normalize or stylize it.`);
  }
  if (releaseTitle) {
    parts.push(`Release title "${releaseTitle}" is a canonical proper noun. Use it exactly as written.`);
  }
  if (parts.length === 0) return "";
  return "CRITICAL CANONICAL NAME PROTECTION:\n" + parts.join("\n") + "\n";
}

function correctCanonicalVariantsInPromo(output: string, artistName: string, releaseTitle: string): string {
  let corrected = output;
  const artistVariants = new Map<string, string>([
    ["Arkadelik", "Arkadelic"],
    ["Arkadelick", "Arkadelic"],
    ["Arkadellic", "Arkadelic"],
    ["ARKADELIC", "Arkadelic"],
    ["arkadelic", "Arkadelic"],
    ["The Arkadius", "The Arkadiusz"],
    ["The Arkadius", "The Arkadiusz"],
    ["Arkadius", "The Arkadiusz"],
    ["AR-Tek", "AR-TEK"],
    ["Ar-Tek", "AR-TEK"],
    ["Artek", "AR-TEK"],
    ["Echoes Of Arcadia", "Echoes of Arcadia"],
    ["Echoes of Arcadias", "Echoes of Arcadia"],
  ]);
  for (const [wrong, correct] of artistVariants) {
    if (wrong !== correct) {
      const regex = new RegExp(`\\b${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
      corrected = corrected.replace(regex, correct);
    }
  }
  return corrected;
}

interface PromoGenerationDeps {
  database: StudioDatabase;
  getReleaseSummary: (releaseId: string) => ReleaseSummary | undefined;
}

export async function generatePromoContent(
  input: GeneratePromoContentInput,
  deps: PromoGenerationDeps
): Promise<PromoGenerationResult> {
  const { database, getReleaseSummary } = deps;

  const plan = database.getReleasePlan(input.releasePlanId);
  if (!plan) throw new Error("Release plan not found");
  if (plan.status !== "APPROVED") throw new Error("Only an APPROVED Release Plan can generate promo content");

  const release = getReleaseSummary(plan.releaseId);
  if (!release) throw new Error("Release not found");

  const items = plan.campaignItems;
  const results: PromoGenerationResult["items"] = [];
  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    const existing = database.getPromoGenerationByCampaignItem(item.id);
    if (existing) {
      results.push({
        campaignItemId: item.id,
        title: item.title,
        contentType: item.contentType,
        status: existing.status,
        error: existing.error,
        promoGenerationId: existing.id
      });
      if (existing.status === "SUCCESS") generated++;
      else if (existing.status === "FAILED") failed++;
      else skipped++;
      continue;
    }

    if (!GENERABLE_CONTENT_TYPES.has(item.contentType)) {
      const record = database.insertPromoGeneration({
        releaseId: plan.releaseId,
        releasePlanId: plan.id,
        campaignItemId: item.id,
        contentType: item.contentType,
        generatedContent: "",
        status: "SKIPPED",
        error: `Content type "${item.contentType}" is not supported for auto-generation`,
        model: input.model
      });
      results.push({
        campaignItemId: item.id,
        title: item.title,
        contentType: item.contentType,
        status: "SKIPPED",
        error: record.error,
        promoGenerationId: record.id
      });
      skipped++;
      continue;
    }

    try {
      const channel = item.targetPlatforms[0] ?? "Instagram";
      const content = await generateSingleItem(item, channel, input, release);

      const packItem = database.saveCampaignPackItems(plan.releaseId, input.language, input.model, [{
        kind: item.contentType as "caption" | "video-hook" | "video-script" | "image-prompt" | "visualizer-prompt",
        channel: channel,
        content
      }]);

      const record = database.insertPromoGeneration({
        releaseId: plan.releaseId,
        releasePlanId: plan.id,
        campaignItemId: item.id,
        contentType: item.contentType,
        generatedContent: content,
        campaignPackItemId: packItem[0]?.id ?? null,
        status: "SUCCESS",
        model: input.model
      });

      results.push({
        campaignItemId: item.id,
        title: item.title,
        contentType: item.contentType,
        status: "SUCCESS",
        error: null,
        promoGenerationId: record.id
      });
      generated++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Generation failed";
      const record = database.insertPromoGeneration({
        releaseId: plan.releaseId,
        releasePlanId: plan.id,
        campaignItemId: item.id,
        contentType: item.contentType,
        generatedContent: "",
        status: "FAILED",
        error: errorMsg,
        model: input.model
      });
      results.push({
        campaignItemId: item.id,
        title: item.title,
        contentType: item.contentType,
        status: "FAILED",
        error: errorMsg,
        promoGenerationId: record.id
      });
      failed++;
    }
  }

  return {
    runId: plan.id,
    totalItems: items.length,
    generated,
    failed,
    skipped,
    items: results
  };
}

async function generateSingleItem(
  item: CampaignItem,
  channel: CampaignChannel,
  input: GeneratePromoContentInput,
  release: ReleaseSummary
): Promise<string> {
  const draftInput = {
    model: input.model,
    language: input.language,
    channel,
    artistId: release.artistId,
    artistName: release.artistName,
    primaryGenre: release.primaryGenre,
    story: release.story,
    releaseDate: release.releaseDate,
    title: release.title,
    artistVoice: ""
  };

  const enhancedPrompt = buildEnhancedPrompt(item, channel);
  const result = await generateCampaignDraft({ ...draftInput, channel });
  let content = result.content || enhancedPrompt;
  content = correctCanonicalVariantsInPromo(content, release.artistName, release.title);
  return content;
}

function buildEnhancedPrompt(item: CampaignItem, channel: CampaignChannel): string {
  const parts: string[] = [];
  parts.push(`Create a ${item.contentType} for ${channel}.`);
  if (item.purpose) parts.push(`Purpose: ${item.purpose}`);
  if (item.cta) parts.push(`Call to action: ${item.cta}`);
  if (item.copyRequirements.length > 0) parts.push(`Requirements: ${item.copyRequirements.join(", ")}`);
  if (item.assetRequirements.length > 0) parts.push(`Asset needs: ${item.assetRequirements.join(", ")}`);
  if (item.notes) parts.push(`Notes: ${item.notes}`);
  return parts.join(" ");
}
