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
}
