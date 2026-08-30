import { useState } from "react";
import type { AiSettings, CampaignPackItem, DraftSummary, GeneratedCampaignDraft, MediaGenerationSummary } from "../../../electron/shared/contracts";

export function useAiStudio() {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings>({ model: null, language: "en", channel: "Instagram" });
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedCampaignDraft | null>(null);
  const [generationState, setGenerationState] = useState<"idle" | "generating" | "error">("idle");
  const [generationMessage, setGenerationMessage] = useState("");
  const [campaignPackItems, setCampaignPackItems] = useState<CampaignPackItem[]>([]);
  const [campaignPackBusy, setCampaignPackBusy] = useState(false);
  const [campaignPackMessage, setCampaignPackMessage] = useState("");
  const [mediaGenerations, setMediaGenerations] = useState<MediaGenerationSummary[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mediaBusy, setMediaBusy] = useState<string | null>(null);
  const [mediaMessage, setMediaMessage] = useState("");

  return { drafts, setDrafts, aiSettings, setAiSettings, generatedDraft, setGeneratedDraft, generationState, setGenerationState, generationMessage, setGenerationMessage, campaignPackItems, setCampaignPackItems, campaignPackBusy, setCampaignPackBusy, campaignPackMessage, setCampaignPackMessage, mediaGenerations, setMediaGenerations, mediaUrls, setMediaUrls, mediaBusy, setMediaBusy, mediaMessage, setMediaMessage };
}
