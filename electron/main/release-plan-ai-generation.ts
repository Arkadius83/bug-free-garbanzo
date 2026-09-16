import type { AssetSummary, AudioAnalysisSummary, BrandProfile, CampaignChannel, CampaignItemContentType, ReleaseAnalyticsSummary, ReleaseSummary } from "../shared/contracts.js";
import type { ConversationProviderRouter } from "./conversation-runtime.js";
import type { GeneratedReleasePlanDraft, GeneratedReleasePlanItem } from "./release-plan-generation.js";

const VALID_CAMPAIGN_CHANNELS = new Set<CampaignChannel>(["Instagram", "Facebook", "TikTok", "SoundCloud", "YouTube"]);
const VALID_CONTENT_TYPES = new Set<CampaignItemContentType>(["caption", "video-hook", "video-script", "image-prompt", "visualizer-prompt", "story", "email", "other"]);

export type ReleasePlanGenerationContext = {
  release: ReleaseSummary;
  assets: AssetSummary[];
  brandProfile: BrandProfile | null;
  audioAnalysis: AudioAnalysisSummary | null;
  previousPlan: { title: string; summary: string; items: Array<{ title: string; purpose: string; contentType: string; targetPlatforms: string[] }> } | null;
  analyticsSummary: ReleaseAnalyticsSummary | null;
};

export type AiGenerationResult = {
  draft: GeneratedReleasePlanDraft;
  provider: string;
  model: string;
  durationMs: number;
  fallbackUsed: boolean;
};

type RawGeneratedItem = {
  title?: unknown;
  purpose?: unknown;
  contentType?: unknown;
  targetPlatforms?: unknown;
  plannedDate?: unknown;
  plannedTime?: unknown;
  cta?: unknown;
  notes?: unknown;
  assetRequirements?: unknown;
  copyRequirements?: unknown;
};

type RawGeneratedDraft = {
  title?: unknown;
  summary?: unknown;
  items?: unknown;
};

export function buildReleasePlanGenerationContext(input: {
  release: ReleaseSummary;
  assets: AssetSummary[];
  brandProfile: BrandProfile | null;
  audioAnalysis: AudioAnalysisSummary | null;
  previousPlan: { title: string; summary: string; items: Array<{ title: string; purpose: string; contentType: string; targetPlatforms: string[] }> } | null;
  analyticsSummary: ReleaseAnalyticsSummary | null;
}): ReleasePlanGenerationContext {
  return {
    release: input.release,
    assets: input.assets,
    brandProfile: input.brandProfile,
    audioAnalysis: input.audioAnalysis,
    previousPlan: input.previousPlan,
    analyticsSummary: input.analyticsSummary
  };
}

export function buildReleasePlanSystemPrompt(): string {
  return [
    "You are a music release promotion campaign planner.",
    "Generate a practical, structured Release Plan for an independent music artist.",
    "Return ONLY valid JSON matching the exact schema described below. No prose, no markdown fences, no explanations.",
    "",
    "Output schema:",
    "{",
    '  "title": "string — concise plan title including the track name",',
    '  "summary": "string — 2-4 sentence overview of the promotion strategy",',
    '  "campaignItems": [',
    "    {",
    '      "title": "string — short descriptive title for this campaign item",',
    '      "purpose": "string — what this item achieves in the campaign",',
    '      "contentType": "caption | video-hook | video-script | image-prompt | visualizer-prompt | story | email | other",',
    '      "targetPlatforms": ["Instagram" | "Facebook" | "TikTok" | "SoundCloud" | "YouTube"],',
    '      "plannedDate": "YYYY-MM-DD or null",',
    '      "plannedTime": "HH:MM or null",',
    '      "cta": "string — call to action",',
    '      "notes": "string — internal notes for the artist",',
    '      "assetRequirements": ["string"],',
    '      "copyRequirements": ["string"]',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Generate 5-12 campaign items that form a realistic promotion arc.",
    "- If a release date is provided, schedule items relative to it (e.g. T-21, T-14, T-7, Release Day, T+7).",
    "- If no release date is provided, leave plannedDate as null.",
    "- Only use valid contentType values from the list above.",
    "- Only use valid platform names from the list above.",
    "- Each item must have a non-empty title.",
    "- Do not invent links, quotes, achievements, or collaborators.",
    "- Keep the plan suitable for an independent electronic music artist."
  ].join("\n");
}

export function buildReleasePlanUserPrompt(context: ReleasePlanGenerationContext): string {
  const { release, assets, brandProfile, audioAnalysis, previousPlan, analyticsSummary } = context;
  const hasCover = assets.some((a) => a.kind === "cover");
  const hasAudio = assets.some((a) => a.kind === "audio");

  const lines = [
    `Artist: ${release.artistName}`,
    `Track: ${release.title}`,
    `Genre: ${release.primaryGenre}`,
    release.story ? `Story: ${release.story}` : null,
    release.releaseDate ? `Release date: ${release.releaseDate}` : "Release date: not set",
    `Release status: ${release.status}`,
    "",
    "Assets:",
    hasAudio ? "- Audio master: attached" : "- Audio master: not yet attached",
    hasCover ? "- Cover artwork: attached" : "- Cover artwork: not yet attached"
  ];

  if (brandProfile) {
    lines.push("", "Brand direction:");
    lines.push(`- Visual direction: ${brandProfile.visualDirection}`);
    lines.push(`- Palette: ${brandProfile.palette}`);
    lines.push(`- Typography: ${brandProfile.typography}`);
    lines.push(`- Required elements: ${brandProfile.requiredElements}`);
    lines.push(`- Forbidden elements: ${brandProfile.forbiddenElements}`);
  }

  if (audioAnalysis) {
    lines.push("", "Audio analysis:");
    if (audioAnalysis.bpm) lines.push(`- BPM: ${audioAnalysis.bpm}`);
    if (audioAnalysis.musicalKey) lines.push(`- Key: ${audioAnalysis.musicalKey}`);
    if (audioAnalysis.integratedLufs) lines.push(`- Loudness: ${audioAnalysis.integratedLufs} LUFS`);
    if (audioAnalysis.durationSeconds) lines.push(`- Duration: ${Math.round(audioAnalysis.durationSeconds)}s`);
  }

  if (analyticsSummary && analyticsSummary.totalSnapshots > 0) {
    lines.push("", "Historical post-publish analytics (use as context, do not repeat past campaigns):");
    lines.push(`- Total past posts with analytics: ${analyticsSummary.totalSnapshots}`);
    if (analyticsSummary.recentSnapshotAt) lines.push(`- Most recent snapshot: ${analyticsSummary.recentSnapshotAt.slice(0, 10)}`);
    for (const platform of analyticsSummary.platforms) {
      const parts = [`${platform.postCount} posts`];
      if (platform.avgReach !== null) parts.push(`avg reach ${platform.avgReach.toLocaleString()}`);
      if (platform.avgImpressions !== null) parts.push(`avg impressions ${platform.avgImpressions.toLocaleString()}`);
      if (platform.avgLikes !== null) parts.push(`avg likes ${platform.avgLikes.toLocaleString()}`);
      if (platform.avgComments !== null) parts.push(`avg comments ${platform.avgComments.toLocaleString()}`);
      if (platform.avgShares !== null) parts.push(`avg shares ${platform.avgShares.toLocaleString()}`);
      lines.push(`- ${platform.platform}: ${parts.join(", ")}`);
    }
    lines.push("Use this data to inform platform emphasis, content mix, and CTA style. Avoid repeating successful patterns verbatim — adapt and innovate.");
  }

  if (previousPlan) {
    lines.push("", "Previous plan revision (for context, generate a NEW different plan):");
    lines.push(`- Title: ${previousPlan.title}`);
    lines.push(`- Summary: ${previousPlan.summary}`);
    lines.push(`- Items: ${previousPlan.items.map((i) => i.title).join(", ")}`);
  }

  return lines.filter((line) => line !== null).join("\n");
}

function normalizePlatformName(raw: string): CampaignChannel | null {
  const normalized = raw.trim();
  const canonicalMap: Record<string, CampaignChannel> = {
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    soundcloud: "SoundCloud",
    youtube: "YouTube"
  };
  if (VALID_CAMPAIGN_CHANNELS.has(normalized as CampaignChannel)) return normalized as CampaignChannel;
  const lower = normalized.toLowerCase();
  if (canonicalMap[lower]) return canonicalMap[lower];
  return null;
}

function normalizeContentType(raw: string): CampaignItemContentType | null {
  const normalized = raw.trim().toLowerCase().replace(/[_ ]+/g, "-");
  if (VALID_CONTENT_TYPES.has(normalized as CampaignItemContentType)) return normalized as CampaignItemContentType;
  return null;
}

function normalizeDateString(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateRegex.test(trimmed)) {
    const parsed = new Date(trimmed + "T00:00:00Z");
    if (!Number.isNaN(parsed.getTime())) return trimmed;
  }
  return null;
}

function normalizeTimeString(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const timeRegex = /^\d{1,2}:\d{2}$/;
  if (timeRegex.test(trimmed)) {
    const [hours, minutes] = trimmed.split(":").map(Number);
    if (hours !== undefined && minutes !== undefined && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((s) => s.trim());
}

function validateAndNormalizeItem(raw: unknown): GeneratedReleasePlanItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as RawGeneratedItem;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (typeof item.purpose !== "string") return null;
  const contentType = typeof item.contentType === "string" ? normalizeContentType(item.contentType) : null;
  if (!contentType) return null;
  const platforms = Array.isArray(item.targetPlatforms)
    ? item.targetPlatforms.map((p) => (typeof p === "string" ? normalizePlatformName(p) : null)).filter((p): p is CampaignChannel => p !== null)
    : [];
  if (platforms.length === 0) return null;
  return {
    title: item.title.trim(),
    purpose: item.purpose.trim(),
    contentType,
    targetPlatforms: [...new Set(platforms)],
    plannedDate: typeof item.plannedDate === "string" ? normalizeDateString(item.plannedDate) : null,
    plannedTime: typeof item.plannedTime === "string" ? normalizeTimeString(item.plannedTime) : null,
    cta: typeof item.cta === "string" ? item.cta.trim() : "",
    notes: typeof item.notes === "string" ? item.notes.trim() : "",
    assetRequirements: toStringArray(item.assetRequirements),
    copyRequirements: toStringArray(item.copyRequirements)
  };
}

export function validateAndNormalizeDraft(raw: unknown): GeneratedReleasePlanDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const draft = raw as RawGeneratedDraft;
  if (typeof draft.title !== "string" || !draft.title.trim()) return null;
  if (typeof draft.summary !== "string") return null;
  if (!Array.isArray(draft.items)) return null;
  const items = draft.items.map(validateAndNormalizeItem).filter((item): item is GeneratedReleasePlanItem => item !== null);
  if (items.length === 0) return null;
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    items
  };
}

function parseJsonFromAiResponse(output: string): unknown {
  let cleaned = output.trim();
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
  cleaned = cleaned.replace(/^```json\s*|\s*```$/g, "").trim();
  cleaned = cleaned.replace(/^`\s*|\s*`$/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function generateAiReleasePlanDraft(
  context: ReleasePlanGenerationContext,
  options: { providerRouter: ConversationProviderRouter; signal?: AbortSignal }
): Promise<AiGenerationResult | null> {
  const systemPrompt = buildReleasePlanSystemPrompt();
  const userPrompt = buildReleasePlanUserPrompt(context);
  const fullPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;

  const startMs = Date.now();
  const result = await options.providerRouter(fullPrompt, { signal: options.signal });
  const durationMs = Date.now() - startMs;

  if (!result.ok || !result.output?.trim()) {
    console.log(`[release-plan-ai] Provider returned no output after ${durationMs}ms. provider=${result.provider ?? "none"} model=${result.model ?? "none"}`);
    return null;
  }

  const parsed = parseJsonFromAiResponse(result.output);
  const draft = validateAndNormalizeDraft(parsed);
  if (!draft) {
    console.log(`[release-plan-ai] AI output failed validation after ${durationMs}ms. provider=${result.provider ?? "none"} model=${result.model ?? "none"}`);
    return null;
  }

  const fallbackUsed = result.trace?.fallbackUsed ?? false;
  console.log(`[release-plan-ai] AI generation succeeded after ${durationMs}ms. provider=${result.provider ?? "none"} model=${result.model ?? "none"} items=${draft.items.length} fallbackUsed=${fallbackUsed}`);

  return {
    draft,
    provider: result.provider ?? "unknown",
    model: result.model ?? "unknown",
    durationMs,
    fallbackUsed
  };
}
