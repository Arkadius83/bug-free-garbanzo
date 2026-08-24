export type ArtistAlias = "the-arkadiusz" | "arkadelic" | "ar-tek" | "echoes-of-arcadia";

export interface ArtistProfile {
  id: ArtistAlias;
  name: string;
  genres: string[];
  voice: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modifiedAt: string;
}

export type ContentLanguage = "pl" | "de" | "en";
export type CampaignChannel = "Instagram" | "Facebook" | "TikTok" | "SoundCloud" | "YouTube";

export interface AiSettings {
  model: string | null;
  language: ContentLanguage;
  channel: CampaignChannel;
}

export interface GenerateCampaignDraftInput {
  model: string;
  language: ContentLanguage;
  channel: CampaignChannel;
  artistId: ArtistAlias;
  artistName: string;
  artistVoice: string;
  title: string;
  primaryGenre: string;
  story: string;
  releaseDate?: string | null;
}

export interface GeneratedCampaignDraft {
  content: string;
  model: string;
  language: ContentLanguage;
  channel: CampaignChannel;
  generatedAt: string;
}

export type DraftStatus = "draft" | "approved" | "scheduled" | "published" | "rejected";

export interface DraftSummary {
  id: string;
  releaseId: string;
  campaignId: string;
  releaseTitle: string;
  channel: CampaignChannel;
  language: ContentLanguage;
  content: string;
  status: DraftStatus;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveGeneratedDraftInput {
  releaseId: string;
  channel: CampaignChannel;
  language: ContentLanguage;
  content: string;
  model: string;
}

export type AssetKind = "audio" | "cover";

export interface AssetSummary {
  id: string;
  releaseId: string;
  trackId: string | null;
  kind: AssetKind;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  modifiedAt: string | null;
  createdAt: string;
}

export interface AudioAnalysisSummary {
  id: string;
  assetId: string;
  status: "complete" | "limited";
  analyzer: "ffmpeg-ebur128" | "ffmpeg-ebur128-v2" | "wav-native";
  format: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  bitDepth: number | null;
  integratedLufs: number | null;
  loudnessRangeLu: number | null;
  truePeakDbtp: number | null;
  bpm: number | null;
  bpmConfidence: number | null;
  alternateBpm: number | null;
  musicalKey: string | null;
  keyConfidence: number | null;
  alternateKey: string | null;
  analyzedAt: string;
  note: string | null;
}

export interface AttachAssetInput {
  releaseId: string;
  kind: AssetKind;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  modifiedAt: string | null;
}

export interface SystemStatus {
  appVersion: string;
  platform: string;
  ollama: {
    available: boolean;
    models: OllamaModel[];
    error?: string;
  };
}

export interface DatabaseHealth {
  ready: boolean;
  schemaVersion: number;
  path: string;
}

export type ReleaseStatus = "draft" | "planned" | "scheduled" | "published" | "archived";

export interface ReleaseSummary {
  id: string;
  title: string;
  artistId: ArtistAlias;
  artistName: string;
  primaryGenre: string;
  story: string;
  status: ReleaseStatus;
  releaseDate: string | null;
  createdAt: string;
}

export interface ReadinessCheck {
  id: "audio" | "analysis" | "cover" | "date" | "metadata" | "campaign";
  label: string;
  complete: boolean;
  weight: number;
  detail: string;
}

export interface ReleaseReadiness {
  releaseId: string;
  score: number;
  checks: ReadinessCheck[];
  missing: string[];
}

export interface CreateReleaseDraftInput {
  artistId: ArtistAlias;
  title: string;
  primaryGenre: string;
  story: string;
  releaseDate?: string | null;
}

export interface StudioApi {
  getSystemStatus(): Promise<SystemStatus>;
  getDatabaseHealth(): Promise<DatabaseHealth>;
  listReleases(): Promise<ReleaseSummary[]>;
  createReleaseDraft(input: CreateReleaseDraftInput): Promise<ReleaseSummary>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(settings: AiSettings): Promise<AiSettings>;
  generateCampaignDraft(input: GenerateCampaignDraftInput): Promise<GeneratedCampaignDraft>;
  listDrafts(releaseId?: string | null): Promise<DraftSummary[]>;
  saveGeneratedDraft(input: SaveGeneratedDraftInput): Promise<DraftSummary>;
  updateDraftStatus(draftId: string, status: DraftStatus): Promise<DraftSummary>;
  listAssets(releaseId: string): Promise<AssetSummary[]>;
  selectAndAttachAsset(releaseId: string, kind: AssetKind): Promise<AssetSummary | null>;
  getAudioAnalysis(assetId: string): Promise<AudioAnalysisSummary | null>;
  analyzeAudio(assetId: string): Promise<AudioAnalysisSummary>;
  getReleaseReadiness(releaseId: string): Promise<ReleaseReadiness>;
}
