import { useState } from "react";
import type { AssetSummary, AudioAnalysisSummary, ReleaseReadiness, ReleaseStatus, ReleaseSummary } from "../../../electron/shared/contracts";

export function useReleaseManager() {
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [activeReleaseId, setActiveReleaseId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [assetMessage, setAssetMessage] = useState("");
  const [audioAnalyses, setAudioAnalyses] = useState<Record<string, AudioAnalysisSummary>>({});
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({});
  const [analyzingAssetId, setAnalyzingAssetId] = useState<string | null>(null);
  const [releaseReadiness, setReleaseReadiness] = useState<ReleaseReadiness | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [title, setTitle] = useState("Different Perspective");
  const [story, setStory] = useState("Seeing beyond ego reveals another perspective.");
  const [releaseDate, setReleaseDate] = useState("");
  const [primaryGenre, setPrimaryGenre] = useState("Full-On Psytrance");
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus>("draft");

  return { releases, setReleases, activeReleaseId, setActiveReleaseId, assets, setAssets, assetMessage, setAssetMessage, audioAnalyses, setAudioAnalyses, playbackUrls, setPlaybackUrls, analyzingAssetId, setAnalyzingAssetId, releaseReadiness, setReleaseReadiness, saveMessage, setSaveMessage, title, setTitle, story, setStory, releaseDate, setReleaseDate, primaryGenre, setPrimaryGenre, releaseStatus, setReleaseStatus };
}
