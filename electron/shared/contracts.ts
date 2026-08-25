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
  width: number | null;
  height: number | null;
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
  width: number | null;
  height: number | null;
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

export type TaskStatus = "todo" | "doing" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";
export type TaskAssignee = "human" | "ai" | "automatic";

export interface TaskSummary {
  id: string;
  releaseId: string | null;
  releaseTitle: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: TaskAssignee;
  dueAt: string | null;
  sourceKey: string | null;
  agentOutput: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  releaseId: string | null;
  title: string;
  priority: TaskPriority;
  assignee: TaskAssignee;
  dueAt: string | null;
}

export interface SoundCloudConnection {
  configured: boolean;
  connected: boolean;
  userId: number | null;
  username: string | null;
  permalinkUrl: string | null;
  tokenExpiresAt: string | null;
  callbackUrl: string;
  error: string | null;
}

export interface SoundCloudTrackSummary {
  id: number;
  title: string;
  permalinkUrl: string;
  artworkUrl: string | null;
  createdAt: string;
  durationMs: number;
  sharing: string;
  streamable: boolean;
  playbackCount: number | null;
  likesCount: number | null;
  commentCount: number | null;
  repostsCount: number | null;
  genre: string | null;
  tagList: string | null;
  importedAt: string;
  artistId: ArtistAlias | null;
  catalogStatus: SoundCloudCatalogStatus;
  contentType: SoundCloudContentType;
  engagementRate: number | null;
  engagementScore: number;
  releaseId: string | null;
  releaseTitle: string | null;
  trend: "baseline" | "growing" | "stable" | "declining";
  playsDelta: number | null;
  snapshotCount: number;
}

export interface SoundCloudPerformancePoint { capturedAt: string; playbackCount: number | null; likesCount: number | null; commentCount: number | null; repostsCount: number | null; }
export interface SoundCloudPerformanceWindow { days: 7 | 30 | 90; available: boolean; playsDelta: number | null; likesDelta: number | null; commentsDelta: number | null; repostsDelta: number | null; }
export interface SoundCloudTrackPerformance { trackId: number; points: SoundCloudPerformancePoint[]; windows: SoundCloudPerformanceWindow[]; }

export interface SpotifyConnection { configured: boolean; connected: boolean; accountId: string | null; displayName: string | null; callbackUrl: string; error: string | null; }
export interface SpotifyArtistMapping { artistId: ArtistAlias; spotifyArtistId: string; }
export interface SpotifyReleaseSummary { id: string; name: string; albumType: string; releaseDate: string; totalTracks: number; imageUrl: string | null; spotifyUrl: string; spotifyArtistId: string; artistId: ArtistAlias; importedAt: string; releaseId: string | null; releaseTitle: string | null; }
export interface CatalogMatchSuggestion { soundCloudTrackId: number; soundCloudTitle: string; spotifyReleaseId: string; spotifyTitle: string; artistId: ArtistAlias; score: number; reason: string; }
export type CampaignPackKind = "caption" | "video-hook" | "video-script" | "image-prompt" | "visualizer-prompt";
export interface CampaignPackItem { id: string; releaseId: string; releaseTitle: string; kind: CampaignPackKind; channel: CampaignChannel | null; language: ContentLanguage; content: string; status: DraftStatus; model: string; createdAt: string; updatedAt: string; }
export interface GenerateCampaignPackInput extends GenerateCampaignDraftInput { releaseId: string; }
export type MediaProvider = "openai" | "kling" | "comfyui";
export type GeneratedMediaType = "image" | "video";
export type MediaGenerationStatus = "queued" | "generating" | "ready" | "failed" | "approved" | "rejected";
export interface MediaGenerationSettings { openAiConfigured: boolean; klingConfigured: boolean; comfyUiUrl:string; comfyUiAvailable:boolean; comfyUiCheckpoints:string[]; comfyUiCheckpoint:string|null; comfyUiError:string|null; }
export interface LocalServiceStatus { ollama:{running:boolean;managed:boolean;error:string|null}; comfyUi:{running:boolean;managed:boolean;batchPath:string|null;error:string|null}; autoStart:boolean; }
export interface MediaGenerationSummary { id:string; releaseId:string; campaignPackItemId:string; provider:MediaProvider; mediaType:GeneratedMediaType; prompt:string; status:MediaGenerationStatus; providerTaskId:string|null; mimeType:string|null; error:string|null; metadata:Record<string,unknown>; createdAt:string; updatedAt:string; }
export type MediaAspectRatio="1:1"|"4:5"|"9:16"|"16:9";
export interface BrandProfile { artistId:ArtistAlias; artistName:string; visualDirection:string; palette:string; typography:string; requiredElements:string; forbiddenElements:string; negativePrompt:string; defaultAspectRatio:MediaAspectRatio; updatedAt:string; }
export interface UpdateBrandProfileInput extends Omit<BrandProfile,"artistName"|"updatedAt"> {}
export type ContactType="artist"|"vocalist"|"producer"|"label"|"promoter"|"playlist-curator"|"press"|"other";
export type ContactRelationshipStatus="new"|"to-contact"|"contacted"|"conversation"|"collaboration"|"declined"|"inactive";
export type ContactChannel="email"|"instagram"|"tiktok"|"soundcloud"|"phone"|"other";
export interface ContactInteraction { id:string; contactId:string; channel:ContactChannel|"meeting"; direction:"outbound"|"inbound"|"note"; summary:string; occurredAt:string; createdAt:string; }
export interface ContactSummary { id:string; name:string; contactType:ContactType; relationshipStatus:ContactRelationshipStatus; artistId:ArtistAlias|null; artistName:string|null; releaseId:string|null; releaseTitle:string|null; organization:string|null; email:string|null; phone:string|null; website:string|null; socialHandle:string|null; preferredChannel:ContactChannel; consent:boolean; notes:string; nextFollowUpAt:string|null; lastContactAt:string|null; interactions:ContactInteraction[]; createdAt:string; updatedAt:string; }
export interface UpsertContactInput { id?:string; name:string; contactType:ContactType; relationshipStatus:ContactRelationshipStatus; artistId:ArtistAlias|null; releaseId:string|null; organization:string; email:string; phone:string; website:string; socialHandle:string; preferredChannel:ContactChannel; consent:boolean; notes:string; nextFollowUpAt:string|null; createFollowUpTask?:boolean; }
export interface AddContactInteractionInput { contactId:string; channel:ContactChannel|"meeting"; direction:"outbound"|"inbound"|"note"; summary:string; occurredAt:string; }
export interface GenerateMediaInput { campaignPackItemId:string; provider:MediaProvider; mediaType:GeneratedMediaType; aspectRatio?:MediaAspectRatio; }
export type PublishingStatus="draft"|"approved"|"scheduled"|"published"|"failed";
export interface PublishingQueueItem { id:string; releaseId:string; releaseTitle:string; platform:CampaignChannel; campaignPackItemId:string; mediaGenerationId:string|null; caption:string; scheduledAt:string|null; status:PublishingStatus; error:string|null; exportedAt:string|null; mediaType:GeneratedMediaType|null; mediaProvider:MediaProvider|null; rightsBlocked:boolean; createdAt:string; updatedAt:string; }
export interface CreatePublishingQueueInput { releaseId:string; campaignPackItemId:string; mediaGenerationId:string|null; platform:CampaignChannel; scheduledAt:string|null; }

export type SoundCloudCatalogStatus = "unreviewed" | "release" | "gem" | "archive" | "exclude";
export type SoundCloudContentType = "original" | "bootleg" | "official-remix" | "edit" | "dj-set";
export interface UpdateSoundCloudTrackInput { id: number; artistId: ArtistAlias | null; catalogStatus: SoundCloudCatalogStatus; contentType: SoundCloudContentType; }

export interface CreateReleaseDraftInput {
  artistId: ArtistAlias;
  title: string;
  primaryGenre: string;
  story: string;
  releaseDate?: string | null;
}

export interface UpdateReleaseInput extends CreateReleaseDraftInput {
  id: string;
  status: ReleaseStatus;
}

export interface StudioApi {
  getSystemStatus(): Promise<SystemStatus>;
  getDatabaseHealth(): Promise<DatabaseHealth>;
  listReleases(): Promise<ReleaseSummary[]>;
  createReleaseDraft(input: CreateReleaseDraftInput): Promise<ReleaseSummary>;
  updateRelease(input: UpdateReleaseInput): Promise<ReleaseSummary>;
  deleteRelease(releaseId: string): Promise<void>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(settings: AiSettings): Promise<AiSettings>;
  generateCampaignDraft(input: GenerateCampaignDraftInput): Promise<GeneratedCampaignDraft>;
  listDrafts(releaseId?: string | null): Promise<DraftSummary[]>;
  saveGeneratedDraft(input: SaveGeneratedDraftInput): Promise<DraftSummary>;
  updateDraftStatus(draftId: string, status: DraftStatus): Promise<DraftSummary>;
  listAssets(releaseId: string): Promise<AssetSummary[]>;
  selectAndAttachAsset(releaseId: string, kind: AssetKind): Promise<AssetSummary | null>;
  detachAsset(assetId: string): Promise<void>;
  getAudioAnalysis(assetId: string): Promise<AudioAnalysisSummary | null>;
  analyzeAudio(assetId: string): Promise<AudioAnalysisSummary>;
  getAssetPlaybackUrl(assetId: string): Promise<string>;
  getReleaseReadiness(releaseId: string): Promise<ReleaseReadiness>;
  listTasks(releaseId?: string | null): Promise<TaskSummary[]>;
  createTask(input: CreateTaskInput): Promise<TaskSummary>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<TaskSummary>;
  runTaskAgent(taskId: string, model: string): Promise<TaskSummary>;
  getSoundCloudConnection(): Promise<SoundCloudConnection>;
  saveSoundCloudCredentials(clientId: string, clientSecret: string): Promise<SoundCloudConnection>;
  beginSoundCloudConnect(): Promise<void>;
  disconnectSoundCloud(): Promise<SoundCloudConnection>;
  syncSoundCloudCatalog(): Promise<SoundCloudTrackSummary[]>;
  listSoundCloudTracks(): Promise<SoundCloudTrackSummary[]>;
  updateSoundCloudTrack(input: UpdateSoundCloudTrackInput): Promise<SoundCloudTrackSummary>;
  setSoundCloudTracksContentType(ids: number[], contentType: SoundCloudContentType): Promise<SoundCloudTrackSummary[]>;
  linkSoundCloudTrack(trackId: number, releaseId: string | null): Promise<SoundCloudTrackSummary>;
  getSoundCloudTrackPerformance(trackId: number): Promise<SoundCloudTrackPerformance>;
  getSpotifyConnection(): Promise<SpotifyConnection>;
  saveSpotifyClientId(clientId: string): Promise<SpotifyConnection>;
  beginSpotifyConnect(): Promise<void>;
  disconnectSpotify(): Promise<SpotifyConnection>;
  getSpotifyArtistMappings(): Promise<SpotifyArtistMapping[]>;
  saveSpotifyArtistMappings(mappings: SpotifyArtistMapping[]): Promise<SpotifyArtistMapping[]>;
  syncSpotifyCatalog(): Promise<SpotifyReleaseSummary[]>;
  listSpotifyReleases(): Promise<SpotifyReleaseSummary[]>;
  linkSpotifyRelease(spotifyReleaseId: string, releaseId: string | null): Promise<SpotifyReleaseSummary>;
  getCatalogMatchSuggestions(): Promise<CatalogMatchSuggestion[]>;
  generateCampaignPack(input: GenerateCampaignPackInput): Promise<CampaignPackItem[]>;
  listCampaignPackItems(releaseId: string): Promise<CampaignPackItem[]>;
  updateCampaignPackItemStatus(itemId: string, status: DraftStatus): Promise<CampaignPackItem>;
  getMediaGenerationSettings(): Promise<MediaGenerationSettings>;
  saveMediaGenerationCredentials(openAiApiKey: string, klingApiKey: string): Promise<MediaGenerationSettings>;
  testComfyUi(comfyUiUrl:string):Promise<MediaGenerationSettings>;
  saveComfyUiSettings(comfyUiUrl:string,checkpoint:string):Promise<MediaGenerationSettings>;
  getLocalServiceStatus():Promise<LocalServiceStatus>;
  selectComfyUiLauncher():Promise<LocalServiceStatus>;
  setLocalServicesAutoStart(enabled:boolean):Promise<LocalServiceStatus>;
  startLocalService(service:"ollama"|"comfyui"):Promise<LocalServiceStatus>;
  stopLocalService(service:"ollama"|"comfyui"):Promise<LocalServiceStatus>;
  generateMedia(input: GenerateMediaInput): Promise<MediaGenerationSummary>;
  refreshMediaGeneration(generationId: string): Promise<MediaGenerationSummary>;
  listMediaGenerations(releaseId: string): Promise<MediaGenerationSummary[]>;
  updateMediaGenerationStatus(generationId: string, status: "approved" | "rejected"): Promise<MediaGenerationSummary>;
  getGeneratedMediaUrl(generationId: string): Promise<string>;
  listPublishingQueue():Promise<PublishingQueueItem[]>;
  createPublishingQueueItem(input:CreatePublishingQueueInput):Promise<PublishingQueueItem>;
  updatePublishingQueueStatus(itemId:string,status:PublishingStatus):Promise<PublishingQueueItem>;
  exportPublishingPack(itemId:string):Promise<string|null>;
  listBrandProfiles():Promise<BrandProfile[]>;
  updateBrandProfile(input:UpdateBrandProfileInput):Promise<BrandProfile>;
  listContacts():Promise<ContactSummary[]>;
  saveContact(input:UpsertContactInput):Promise<ContactSummary>;
  deleteContact(contactId:string):Promise<void>;
  addContactInteraction(input:AddContactInteractionInput):Promise<ContactSummary>;
}
