import type { AssetSummary, BrandProfile, CampaignItemContentType, CampaignChannel, ReleaseSummary } from "../shared/contracts.js";

export type GeneratedReleasePlanItem = {
  title: string;
  purpose: string;
  contentType: CampaignItemContentType;
  targetPlatforms: CampaignChannel[];
  plannedDate: string | null;
  plannedTime: string | null;
  cta: string;
  notes: string;
  assetRequirements: string[];
  copyRequirements: string[];
};

export type GeneratedReleasePlanDraft = {
  title: string;
  summary: string;
  items: GeneratedReleasePlanItem[];
};

export function buildReleasePlanDraft(input: { release: ReleaseSummary; assets: AssetSummary[]; brandProfile?: BrandProfile | null }): GeneratedReleasePlanDraft {
  const hasCover = input.assets.some((asset) => asset.kind === "cover");
  const hasAudio = input.assets.some((asset) => asset.kind === "audio");
  const releaseDate = input.release.releaseDate;
  const visualDirection = input.brandProfile?.visualDirection ?? "artist-aligned visual direction";
  const title = `${input.release.title} Release Plan`;
  const summary = [
    `${input.release.artistName} promotion plan for ${input.release.title}.`,
    `Primary genre: ${input.release.primaryGenre}.`,
    releaseDate ? `Release date: ${releaseDate}.` : "Release date is not set yet.",
    `Visual direction: ${visualDirection}.`,
    hasAudio ? "Audio asset is attached." : "Audio asset still needs to be attached.",
    hasCover ? "Cover artwork is attached." : "Cover artwork still needs to be attached."
  ].join(" ");

  return {
    title,
    summary,
    items: [
      {
        title: "Release announcement caption",
        purpose: "Introduce the track and establish the story for the campaign.",
        contentType: "caption",
        targetPlatforms: ["Instagram", "Facebook"],
        plannedDate: releaseDate,
        plannedTime: "10:00",
        cta: "Listen and save the release",
        notes: input.release.story,
        assetRequirements: hasCover ? ["cover artwork"] : ["cover artwork required"],
        copyRequirements: ["artist voice", "short story hook", input.release.primaryGenre]
      },
      {
        title: "Short-form teaser script",
        purpose: "Create a fast teaser for Reels, Shorts and TikTok.",
        contentType: "video-script",
        targetPlatforms: ["TikTok", "Instagram", "YouTube"],
        plannedDate: releaseDate,
        plannedTime: "16:00",
        cta: "Follow for the full release",
        notes: "Use the strongest drop or most recognizable motif.",
        assetRequirements: hasAudio ? ["audio excerpt"] : ["audio excerpt required"],
        copyRequirements: ["one hook", "one visual cue", "clear ending CTA"]
      },
      {
        title: "Visualizer prompt",
        purpose: "Prepare a visual direction for generated promo media.",
        contentType: "visualizer-prompt",
        targetPlatforms: ["Instagram", "YouTube"],
        plannedDate: releaseDate,
        plannedTime: "18:00",
        cta: "Watch the teaser",
        notes: visualDirection,
        assetRequirements: hasCover ? ["cover artwork reference"] : ["cover artwork reference required"],
        copyRequirements: ["no rendered text", "match brand palette", "leave safe crop area"]
      }
    ]
  };
}
