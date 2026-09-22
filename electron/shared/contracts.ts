import type { HarnessAuditEntry, HarnessExecutionApproval, HarnessExecutionApprovalRequest, HarnessExecutionContext, HarnessExecutionRequest, HarnessExecutionResponse, HarnessExecutionReview } from "./harness-execution.js";
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


export type ConversationRole = "user" | "assistant" | "system";
export type ConversationRuntimeState = "Ready" | "Thinking" | "Responding" | "Error";

export interface ConversationMessage {
  id: string;
  role: Exclude<ConversationRole, "system">;
  content: string;
  createdAt: string;
}

export interface ConversationWorkspaceContext {
  projectName: string;
  artistId: ArtistAlias;
  artistName: string;
  releaseId?: string | null;
  releaseTitle?: string | null;
  primaryGenre?: string | null;
  releaseStatus?: string | null;
}

export interface ConversationRequest {
  requestId: string;
  model: string | null;
  message: string;
  history: ConversationMessage[];
  workspace: ConversationWorkspaceContext;
  stream?: boolean;
}

export interface ConversationChunk {
  requestId: string;
  content: string;
  done: boolean;
  trace?: ProviderExecutionTrace;
}

export type ProviderExecutionFinalStatus = "success" | "cancelled" | "timeout" | "crash" | "invalid_result";

export interface ProviderExecutionDiagnostic {
  model?: string;
  providerId: string;
  providerName: string;
  startTimestamp: string;
  endTimestamp: string;
  durationMs: number;
  finalStatus: ProviderExecutionFinalStatus;
  exitCode: number | null;
  exitSignal: string | null;
  validResultReceived: boolean;
  fallbackUsed: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderExecutionTrace {
  selectedProvider?: string;
  selectedModel?: string;
  routingMode?: "auto";
  startTimestamp: string;
  endTimestamp: string;
  durationMs: number;
  finalStatus: ProviderExecutionFinalStatus;
  fallbackUsed: boolean;
  diagnostics: ProviderExecutionDiagnostic[];
}

export interface ConversationResponse {
  requestId: string;
  provider: string;
  model: string;
  content: string;
  streamed: boolean;
  interrupted: boolean;
  trace?: ProviderExecutionTrace;
  error?: string;
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
export type MediaProvider = "openai" | "kling" | "kling-cli" | "comfyui";
export type GeneratedMediaType = "image" | "video";
export type MediaGenerationStatus = "queued" | "generating" | "ready" | "failed" | "approved" | "rejected";
export interface MediaGenerationSettings { openAiConfigured: boolean; klingConfigured: boolean; klingCliConfigured: boolean; klingCliVersion: string|null; comfyUiUrl:string; comfyUiAvailable:boolean; comfyUiCheckpoints:string[]; comfyUiCheckpoint:string|null; comfyUiError:string|null; }
export interface KlingCliAccount { userId: number; membershipType: string; availableRemainCredits: number; }
export interface KlingCliStatus { available: boolean; version: string | null; account: KlingCliAccount | null; error: string | null; }
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
export type PublishingStatus="draft"|"approved"|"scheduled"|"publishing"|"published"|"failed";
export interface PublishingQueueItem { id:string; releaseId:string; releaseTitle:string; platform:CampaignChannel; campaignPackItemId:string; mediaGenerationId:string|null; caption:string; scheduledAt:string|null; status:PublishingStatus; error:string|null; exportedAt:string|null; remotePostId:string|null; publishedAt:string|null; destinationId:string|null; mediaType:GeneratedMediaType|null; mediaProvider:MediaProvider|null; rightsBlocked:boolean; sourceScheduleEventId:string|null; sourceCampaignItemTitle:string|null; reviewedBy:string|null; reviewedAt:string|null; reviewReason:string|null; createdAt:string; updatedAt:string; }
export interface CreatePublishingQueueInput { releaseId:string; campaignPackItemId:string; mediaGenerationId:string|null; platform:CampaignChannel; scheduledAt:string|null; }
export interface ReviewPublishingQueueItemInput { id:string; action:"APPROVE"|"REJECT"|"RETURN_TO_DRAFT"|"SCHEDULE"; actor?:string; reason?:string; }
export interface UpdatePublishingQueueContentInput { id:string; caption:string; scheduledAt:string|null; }
export interface MetaDestination { id:string; platform:"Facebook"|"Instagram";pageId:string;name:string;username:string|null; }
export interface MetaConnection { configured:boolean;connected:boolean;callbackUrl:string;graphVersion:string;configurationId:string|null;destinations:MetaDestination[];error:string|null; }
export interface MetaTestPublishInput { destinationId:string; text:string; }
export interface MetaTestPublishResult { ok:boolean; destinationId:string; destinationName:string; endpoint:string; startedAt:string; finishedAt:string; postId:string|null; error:string|null; }
export interface MediaBridgeStatus { configured:boolean;provider:"cloudflare-r2";accountId:string|null;bucket:string|null;error:string|null; }

export type PublisherPlatform = "YouTube" | "TikTok";
export interface PublisherTestResult {
  platform: PublisherPlatform;
  ok: boolean;
  destinationName: string;
  remoteId: string | null;
  startedAt: string;
  finishedAt: string;
  status: string;
  endpoint: string;
  sanitizedError: string | null;
}
export interface YouTubeConnection {
  configured: boolean;
  connected: boolean;
  channelId: string | null;
  channelTitle: string | null;
  callbackUrl: string;
  scopes: string[];
  error: string | null;
}
export type YouTubePrivacyStatus = "private" | "unlisted" | "public";
export interface YouTubeTestPublishInput {
  title: string;
  description: string;
  tags: string[];
  privacyStatus: YouTubePrivacyStatus;
  videoPath: string;
  thumbnailPath?: string | null;
}
export interface YouTubeTestPublishResult extends PublisherTestResult {
  platform: "YouTube";
  videoId: string | null;
  privacyStatus: YouTubePrivacyStatus;
}
export interface TikTokConnection {
  configured: boolean;
  connected: boolean;
  openId: string | null;
  displayName: string | null;
  callbackUrl: string;
  scopes: string[];
  error: string | null;
}
export interface TikTokCreatorInfo {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}
export type TikTokPublishMode = "draft" | "direct";
export interface TikTokTestPublishInput {
  mode: TikTokPublishMode;
  caption: string;
  videoPath: string;
  privacyLevel?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}
export interface TikTokTestPublishResult extends PublisherTestResult {
  platform: "TikTok";
  publishId: string | null;
  mode: TikTokPublishMode;
  creatorInfo?: TikTokCreatorInfo | null;
}

export interface YouTubeThumbnail { url: string; width?: number | null; height?: number | null; }
export interface YouTubeChannelSnapshot {
  channelId: string;
  title: string;
  description: string | null;
  customUrl: string | null;
  publishedAt: string | null;
  country: string | null;
  thumbnails: Record<string, YouTubeThumbnail> | null;
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean | null;
  viewCount: number | null;
  videoCount: number | null;
  uploadsPlaylistId: string | null;
  brandingSettings?: Record<string, unknown> | null;
}
export interface YouTubeVideoSnapshot {
  videoId: string;
  channelId: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  tags: string[] | null;
  categoryId: string | null;
  thumbnails: Record<string, YouTubeThumbnail> | null;
  duration: string | null;
  definition: string | null;
  caption: string | null;
  licensedContent: boolean | null;
  privacyStatus: string | null;
  uploadStatus: string | null;
  embeddable: boolean | null;
  madeForKids: boolean | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}
export interface YouTubeChannelDataSnapshot {
  schemaVersion: number;
  channelId: string;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  channel: YouTubeChannelSnapshot | null;
  videos: YouTubeVideoSnapshot[];
}
export interface YouTubeChannelDataSyncResult {
  channel: YouTubeChannelSnapshot | null;
  videos: YouTubeVideoSnapshot[];
  syncedAt: string;
  videosFetched: number;
  pagesFetched: number;
  ok: boolean;
  sanitizedError: string | null;
}

export interface PostPublishSnapshot {
  id: string;
  publishingQueueItemId: string;
  releaseId: string;
  externalPostId: string;
  platform: CampaignChannel;
  verified: boolean;
  verifiedAt: string | null;
  verificationError: string | null;
  views: number | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  capturedAt: string;
  createdAt: string;
}

export interface AnalyticsPlatformSummary {
  platform: CampaignChannel;
  postCount: number;
  avgReach: number | null;
  avgImpressions: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  avgShares: number | null;
  totalReach: number;
  totalImpressions: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
}

export interface ReleaseAnalyticsSummary {
  releaseId: string;
  totalSnapshots: number;
  platforms: AnalyticsPlatformSummary[];
  recentSnapshotAt: string | null;
}

export type PromoGenerationStatus = "SUCCESS" | "FAILED" | "SKIPPED";

export type PromoReviewStatus = "GENERATED" | "REVIEW_REQUIRED" | "EDITED" | "APPROVED" | "REJECTED";

export interface PromoGeneration {
  id: string;
  releaseId: string;
  releasePlanId: string;
  campaignItemId: string;
  contentType: CampaignItemContentType;
  generatedContent: string;
  campaignPackItemId: string | null;
  status: PromoGenerationStatus;
  error: string | null;
  model: string;
  reviewStatus: PromoReviewStatus;
  originalContent: string | null;
  editedContent: string | null;
  reviewActor: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface GeneratePromoContentInput {
  releasePlanId: string;
  model: string;
  language: ContentLanguage;
}

export interface PromoGenerationResult {
  runId: string;
  totalItems: number;
  generated: number;
  failed: number;
  skipped: number;
  items: PromoGenerationItemResult[];
}

export interface PromoGenerationItemResult {
  campaignItemId: string;
  title: string;
  contentType: CampaignItemContentType;
  status: PromoGenerationStatus;
  error: string | null;
  promoGenerationId: string | null;
}

export interface UpdatePromoReviewInput {
  promoGenerationId: string;
  reviewStatus: "GENERATED" | "REVIEW_REQUIRED" | "EDITED" | "APPROVED" | "REJECTED";
  reviewActor?: string;
  reviewReason?: string;
}

export interface EditPromoContentInput {
  promoGenerationId: string;
  editedContent: string;
}

export interface RetryPromoGenerationInput {
  promoGenerationId: string;
  model: string;
  language: ContentLanguage;
}

export type ScheduleEventStatus = "DRAFT" | "SCHEDULED" | "CANCELLED" | "READY";

export interface ScheduleEvent {
  id: string;
  releaseId: string;
  releaseTitle: string;
  releasePlanId: string;
  campaignItemId: string;
  campaignItemTitle: string;
  promoGenerationId: string;
  platform: CampaignChannel;
  scheduledAt: string;
  timezone: string;
  status: ScheduleEventStatus;
  publishingQueueId: string | null;
  queuedAt: string | null;
  queuedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleEventInput {
  promoGenerationId: string;
  platform: CampaignChannel;
  scheduledAt: string;
  timezone: string;
}

export interface UpdateScheduleEventInput {
  id: string;
  platform?: CampaignChannel;
  scheduledAt?: string;
  timezone?: string;
  status?: ScheduleEventStatus;
}

export interface QueueScheduleEventResult {
  scheduleEvent: ScheduleEvent;
  publishingQueueItem: PublishingQueueItem;
}

export type SoundCloudCatalogStatus = "unreviewed" | "release" | "gem" | "archive" | "exclude";
export type SoundCloudContentType = "original" | "bootleg" | "official-remix" | "edit" | "dj-set";
export interface UpdateSoundCloudTrackInput { id: number; artistId: ArtistAlias | null; catalogStatus: SoundCloudCatalogStatus; contentType: SoundCloudContentType; }


export type AiHarnessPreferredExecutionMode = "AUTO" | "LOCAL_ONLY" | "CLOUD_ONLY";
export type AiHarnessOverallStatus = "COMPLETED" | "PARTIAL" | "PLANNING_ONLY" | "FAILED";
export type AiHarnessTaskStatus = "EXECUTABLE" | "READY" | "PLANNING_ONLY" | "UNSUPPORTED_CAPABILITY" | "NO_EXECUTOR" | "BLOCKED_BY_DEPENDENCY" | "EXECUTION_FAILED" | "EXECUTED";

export interface AiHarnessRequest {
  requestId: string;
  goal: {
    id: string;
    instruction: string;
    constraints?: Record<string, unknown>;
    preferredExecutionMode?: AiHarnessPreferredExecutionMode;
  };
  project?: {
    id?: string;
    name?: string;
    workspaceRoot?: string;
    stateFile?: string;
  };
  execution?: {
    planOnly?: boolean;
  };
  capabilities?: {
    availableExecutors?: string[];
  };
}

export interface AiHarnessError {
  code: string;
  message: string;
  taskId?: string;
  executorId?: string;
  cause?: string;
}

export interface AiHarnessTaskSummary {
  id: string;
  description?: string;
  capability?: string;
  dependsOn: string[];
  expectedOutputs?: unknown;
}

export interface AiHarnessTaskResult {
  taskId: string;
  capability?: string;
  executorId: string | null;
  status: AiHarnessTaskStatus;
  planningOnly: boolean;
  blockedBy: string[];
  dependencyResults: string[];
  output?: unknown;
  errors: AiHarnessError[];
}

export interface AiHarnessResponse {
  requestId: string;
  status: AiHarnessOverallStatus;
  planOnly: boolean;
  plan: {
    valid: boolean;
    originalTaskOrder: string[];
    resolvedTaskOrder: string[];
    tasks: AiHarnessTaskSummary[];
  };
  results: AiHarnessTaskResult[];
  errors: AiHarnessError[];
}
export type ReleasePlanStatus = "DRAFT" | "REVIEWED" | "APPROVED" | "EXECUTING" | "COMPLETED" | "CANCELLED" | "FAILED";
export type CampaignItemStatus = "DRAFT" | "READY" | "APPROVED" | "CANCELLED";
export type CampaignItemContentType = "caption" | "video-hook" | "video-script" | "image-prompt" | "visualizer-prompt" | "story" | "email" | "other";
export type ApprovalAction = "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
export type ApprovalMode = "manual" | "auto";

export interface ArtistPromotionProfile {
  artistId: ArtistAlias;
  artistName: string;
  toneOfVoice: string;
  languages: ContentLanguage[];
  postingFrequency: string;
  preferredContentTypes: CampaignItemContentType[];
  avoidedContentTypes: CampaignItemContentType[];
  hashtagRules: string;
  emojiRules: string;
  callToActionRules: string;
  platformPreferences: Record<string, unknown>;
  defaultApprovalMode: ApprovalMode;
  updatedAt: string;
}

export interface UpdateArtistPromotionProfileInput {
  artistId: ArtistAlias;
  toneOfVoice?: string;
  languages?: ContentLanguage[];
  postingFrequency?: string;
  preferredContentTypes?: CampaignItemContentType[];
  avoidedContentTypes?: CampaignItemContentType[];
  hashtagRules?: string;
  emojiRules?: string;
  callToActionRules?: string;
  platformPreferences?: Record<string, unknown>;
  defaultApprovalMode?: ApprovalMode;
}
export type ApprovalEntityType = "release_plan";

export interface CampaignItem {
  id: string;
  releasePlanId: string;
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
  status: CampaignItemStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReleasePlan {
  id: string;
  releaseId: string;
  status: ReleasePlanStatus;
  version: number;
  revisionNumber: number;
  previousPlanId: string | null;
  title: string;
  summary: string;
  createdBy: string;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  campaignItems: CampaignItem[];
}

export interface CreateReleasePlanInput {
  releaseId: string;
  title: string;
  summary?: string;
  createdBy?: string;
}

export interface UpdateReleasePlanInput {
  id: string;
  title?: string;
  summary?: string;
}

export interface ChangeReleasePlanStatusInput {
  id: string;
  status: ReleasePlanStatus;
  actor?: string;
  reason?: string;
}

export interface GenerateReleasePlanInput {
  releaseId: string;
  actor?: string;
}

export interface RegenerateReleasePlanInput {
  releaseId: string;
  actor?: string;
  reason?: string;
}

export interface ApproveReleasePlanInput {
  id: string;
  actor?: string;
  reason?: string;
}

export interface CreateCampaignItemInput {
  releasePlanId: string;
  title: string;
  purpose: string;
  contentType: CampaignItemContentType;
  targetPlatforms: CampaignChannel[];
  plannedDate?: string | null;
  plannedTime?: string | null;
  cta?: string;
  notes?: string;
  assetRequirements?: string[];
  copyRequirements?: string[];
  status?: CampaignItemStatus;
  sortOrder?: number;
}

export interface UpdateCampaignItemInput extends Partial<Omit<CreateCampaignItemInput, "releasePlanId">> {
  id: string;
}

export interface ReorderCampaignItemsInput {
  releasePlanId: string;
  itemIds: string[];
}

export interface ApprovalRecord {
  id: string;
  entityType: ApprovalEntityType;
  entityId: string;
  action: ApprovalAction;
  actor: string;
  reason: string;
  previousStatus: string | null;
  newStatus: string | null;
  createdAt: string;
}

export interface RecordApprovalActionInput {
  entityType: ApprovalEntityType;
  entityId: string;
  action: ApprovalAction;
  actor?: string;
  reason?: string;
  previousStatus?: string | null;
  newStatus?: string | null;
}
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

export type YouTubeAnalyticsRange = "7d" | "28d" | "90d";
export interface YouTubeAnalyticsTimeSeriesPoint { day: string; views: number | null; estimatedMinutesWatched: number | null; averageViewDuration: number | null; likes: number | null; comments: number | null; }
export type YouTubeAnalyticsMetricSource = "analytics-period" | "data-api-lifetime";
export interface YouTubeAnalyticsVideoPerformance { videoId: string; title: string | null; thumbnailUrl: string | null; views: number | null; estimatedMinutesWatched: number | null; averageViewDuration: number | null; likes: number | null; likesSource: YouTubeAnalyticsMetricSource | null; comments: number | null; commentsSource: YouTubeAnalyticsMetricSource | null; }
export interface YouTubeAnalyticsTrafficSource { source: string; views: number | null; estimatedMinutesWatched: number | null; }
export interface YouTubeAnalyticsCountry { country: string; views: number | null; estimatedMinutesWatched: number | null; }
export interface YouTubeAnalyticsDevice { device: string; views: number | null; estimatedMinutesWatched: number | null; }
export interface YouTubeAnalyticsSnapshot { schemaVersion: number; channelId: string; range: YouTubeAnalyticsRange; lastSuccessfulSyncAt: string | null; lastAttemptAt: string | null; timeSeries: YouTubeAnalyticsTimeSeriesPoint[]; videos: YouTubeAnalyticsVideoPerformance[]; trafficSources: YouTubeAnalyticsTrafficSource[]; countries: YouTubeAnalyticsCountry[]; devices: YouTubeAnalyticsDevice[]; }
export interface YouTubeAnalyticsSyncResult { ok: boolean; snapshot: YouTubeAnalyticsSnapshot | null; sanitizedError: string | null; }
export interface StudioApi {
  getInterfacePreferences(): Promise<import("./interface-preferences.js").InterfacePreferences>;
  saveInterfacePreferences(value: import("./interface-preferences.js").InterfacePreferences): Promise<import("./interface-preferences.js").InterfacePreferences>;
  sendConversationMessage(input: ConversationRequest, onChunk?: (chunk: ConversationChunk) => void): Promise<ConversationResponse>;
  cancelConversation(requestId: string): Promise<void>;
  runAiHarnessPlan(input: AiHarnessRequest): Promise<AiHarnessResponse>;
  getHarnessExecutionContext(): Promise<HarnessExecutionContext>;
  reviewHarnessExecution(input: HarnessExecutionApprovalRequest): Promise<HarnessExecutionReview>;
  createHarnessExecutionApproval(input: HarnessExecutionApprovalRequest): Promise<HarnessExecutionApproval>;
  executeHarnessTasks(input: HarnessExecutionRequest): Promise<HarnessExecutionResponse>;
  listHarnessExecutionAudit(): Promise<HarnessAuditEntry[]>;
  getSystemStatus(): Promise<SystemStatus>;
  getDatabaseHealth(): Promise<DatabaseHealth>;
  listReleases(): Promise<ReleaseSummary[]>;
  createReleaseDraft(input: CreateReleaseDraftInput): Promise<ReleaseSummary>;
  updateRelease(input: UpdateReleaseInput): Promise<ReleaseSummary>;
  deleteRelease(releaseId: string): Promise<void>;
  generateReleasePlan(input: GenerateReleasePlanInput): Promise<ReleasePlan>;
  regenerateReleasePlan(input: RegenerateReleasePlanInput): Promise<ReleasePlan>;
  getCurrentReleasePlan(releaseId: string): Promise<ReleasePlan | null>;
  approveReleasePlan(input: ApproveReleasePlanInput): Promise<ReleasePlan>;
  createReleasePlan(input: CreateReleasePlanInput): Promise<ReleasePlan>;
  getReleasePlan(id: string): Promise<ReleasePlan | null>;
  listReleasePlans(releaseId: string): Promise<ReleasePlan[]>;
  updateReleasePlan(input: UpdateReleasePlanInput): Promise<ReleasePlan>;
  changeReleasePlanStatus(input: ChangeReleasePlanStatusInput): Promise<ReleasePlan>;
  createCampaignItem(input: CreateCampaignItemInput): Promise<CampaignItem>;
  updateCampaignItem(input: UpdateCampaignItemInput): Promise<CampaignItem>;
  deleteCampaignItem(id: string): Promise<void>;
  reorderCampaignItems(input: ReorderCampaignItemsInput): Promise<CampaignItem[]>;
  recordApprovalAction(input: RecordApprovalActionInput): Promise<ApprovalRecord>;
  listApprovalRecords(entityType: ApprovalEntityType, entityId: string): Promise<ApprovalRecord[]>;
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
  getKlingCliStatus():Promise<KlingCliStatus>;
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
  updatePublishingQueueStatus(itemId:string,status:PublishingStatus):Promise<PublishingQueueItem>;
  reviewPublishingQueueItem(input: ReviewPublishingQueueItemInput): Promise<PublishingQueueItem>;
  updatePublishingQueueContent(input: UpdatePublishingQueueContentInput): Promise<PublishingQueueItem>;
  exportPublishingPack(itemId:string):Promise<string|null>;
  listBrandProfiles():Promise<BrandProfile[]>;
  updateBrandProfile(input:UpdateBrandProfileInput):Promise<BrandProfile>;
  listContacts():Promise<ContactSummary[]>;
  saveContact(input:UpsertContactInput):Promise<ContactSummary>;
  deleteContact(contactId:string):Promise<void>;
  addContactInteraction(input:AddContactInteractionInput):Promise<ContactSummary>;
  getMetaConnection():Promise<MetaConnection>;
  saveMetaCredentials(appId:string,appSecret:string,configurationId:string):Promise<MetaConnection>;
  beginMetaConnect():Promise<void>;
  disconnectMeta():Promise<MetaConnection>;
  publishMetaQueueItem(itemId:string,destinationId:string):Promise<PublishingQueueItem>;
  publishMetaTestPost(input:MetaTestPublishInput):Promise<MetaTestPublishResult>;
  getMediaBridgeStatus():Promise<MediaBridgeStatus>;
  saveMediaBridgeSettings(accountId:string,bucket:string,accessKeyId:string,secretAccessKey:string):Promise<MediaBridgeStatus>;
  generatePromoContent(input: GeneratePromoContentInput): Promise<PromoGenerationResult>;
  listPromoGenerations(releasePlanId: string): Promise<PromoGeneration[]>;
  retryPromoGeneration(input: RetryPromoGenerationInput): Promise<PromoGeneration>;
  updatePromoReview(input: UpdatePromoReviewInput): Promise<PromoGeneration>;
  editPromoContent(input: EditPromoContentInput): Promise<PromoGeneration>;
  createScheduleEvent(input: CreateScheduleEventInput): Promise<ScheduleEvent>;
  updateScheduleEvent(input: UpdateScheduleEventInput): Promise<ScheduleEvent>;
  cancelScheduleEvent(id: string): Promise<ScheduleEvent>;
  listScheduleEvents(input?: { releaseId?: string | null; from?: string | null; to?: string | null }): Promise<ScheduleEvent[]>;
  sendScheduleEventToPublishingQueue(id: string): Promise<QueueScheduleEventResult>;
  listArtistPromotionProfiles(): Promise<ArtistPromotionProfile[]>;
  getArtistPromotionProfile(artistId: ArtistAlias): Promise<ArtistPromotionProfile | null>;
  updateArtistPromotionProfile(input: UpdateArtistPromotionProfileInput): Promise<ArtistPromotionProfile>;
  beginPublishing(itemId: string): Promise<PublishingQueueItem>;
  verifyPublishedPost(itemId: string): Promise<PostPublishSnapshot>;
  fetchAndStorePostAnalytics(itemId: string): Promise<PostPublishSnapshot>;
  getAnalyticsSnapshots(itemId: string): Promise<PostPublishSnapshot[]>;
  getReleaseAnalyticsSummary(releaseId: string): Promise<ReleaseAnalyticsSummary>;
  getYouTubeConnection(): Promise<YouTubeConnection>;
  saveYouTubeCredentials(clientId: string, clientSecret: string): Promise<YouTubeConnection>;
  beginYouTubeConnect(): Promise<void>;
  disconnectYouTube(): Promise<YouTubeConnection>;
  publishYouTubeTest(input: YouTubeTestPublishInput): Promise<YouTubeTestPublishResult>;
  selectYouTubeTestVideo(): Promise<string | null>;
  selectYouTubeTestThumbnail(): Promise<string | null>;
  getTikTokConnection(): Promise<TikTokConnection>;
  saveTikTokCredentials(clientKey: string, clientSecret: string): Promise<TikTokConnection>;
  beginTikTokConnect(): Promise<void>;
  disconnectTikTok(): Promise<TikTokConnection>;
  getTikTokCreatorInfo(): Promise<TikTokCreatorInfo>;
  publishTikTokTest(input: TikTokTestPublishInput): Promise<TikTokTestPublishResult>;
  selectTikTokTestVideo(): Promise<string | null>;
  getYouTubeChannelData(): Promise<YouTubeChannelDataSnapshot | null>;
  syncYouTubeChannelData(): Promise<YouTubeChannelDataSyncResult>;
  getYouTubeAnalytics(range: YouTubeAnalyticsRange): Promise<YouTubeAnalyticsSnapshot | null>;
  syncYouTubeAnalytics(range: YouTubeAnalyticsRange): Promise<YouTubeAnalyticsSyncResult>;
}
