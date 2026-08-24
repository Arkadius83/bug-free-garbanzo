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
}
