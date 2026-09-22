import { useEffect, useMemo, useState } from "react";
import type { AiSettings, AssetKind, AssetSummary, AudioAnalysisSummary, ArtistAlias, BrandProfile, CampaignChannel, CampaignPackItem, CatalogMatchSuggestion, ContactChannel, ContactRelationshipStatus, ContactSummary, ContactType, DatabaseHealth, DraftStatus, DraftSummary, GeneratedCampaignDraft, KlingCliStatus, LocalServiceStatus, MediaAspectRatio, MediaBridgeStatus, MediaGenerationSettings, MediaGenerationSummary, MediaProvider, MetaConnection, MetaTestPublishResult, PublishingQueueItem, ReleaseReadiness, ReleaseStatus, ReleaseSummary, ScheduleEvent, SoundCloudCatalogStatus, SoundCloudConnection, SoundCloudContentType, SoundCloudTrackPerformance, SoundCloudTrackSummary, SpotifyConnection, SpotifyReleaseSummary, SystemStatus, TaskAssignee, TaskPriority, TaskStatus, TaskSummary, UpsertContactInput, YouTubeConnection, YouTubePrivacyStatus, YouTubeTestPublishResult, TikTokConnection, TikTokCreatorInfo, TikTokTestPublishResult, TikTokPublishMode, YouTubeChannelDataSnapshot, YouTubeAnalyticsRange, YouTubeAnalyticsSnapshot } from "../electron/shared/contracts";
import { artists } from "./data/artists";
import { AudioPlayer } from "./AudioPlayer";
import { HarnessPlanPreview } from "./HarnessPlanPreview";
import { ConversationWorkspace } from "./ConversationWorkspace";
import { ReleasePlanPanel } from "./features/release-plan";
import { ContentCalendar } from "./features/content-calendar/ContentCalendar";
import { PostPublishAnalytics } from "./features/post-publish-analytics";
import { Dashboard } from "./features/dashboard/Dashboard";
import { BottomPlayer } from "./features/dashboard/BottomPlayer";
import { SettingsPage } from "./features/settings";
import { PublishingPage } from "./features/publishing";
import { Button } from "./ui/Button";
import { Tabs } from "./ui/Tabs";
import { ReleaseFoundation } from "./features/releases/ReleaseFoundation";
import { useInterfacePreferences } from "./ui/useInterfacePreferences";
import { playInterfaceSound } from "./ui/interfaceSoundService";
import studioManagerLogo from "./assets/ai-studio-manager-logo.png";
import "./features/release-plan/release-plan.css";

type AppView = "overview" | "releases" | "ai-studio" | "calendar" | "analytics" | "publishing" | "contacts" | "settings";

const navigation: Array<{ id: AppView | "placeholder"; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "releases", label: "Releases", icon: "♫" },
  { id: "ai-studio", label: "AI Studio", icon: "✦" },
  { id: "calendar", label: "Content Calendar", icon: "□" },
  { id: "analytics", label: "Analytics", icon: "⌁" },
  { id: "publishing", label: "Publishing", icon: "↗" },
  { id: "contacts", label: "Contacts", icon: "◎" }
];

const emptyContact:UpsertContactInput={name:"",contactType:"artist",relationshipStatus:"new",artistId:null,releaseId:null,organization:"",email:"",phone:"",website:"",socialHandle:"",preferredChannel:"email",consent:false,notes:"",nextFollowUpAt:null,createFollowUpTask:false};

export function App() {
  useInterfacePreferences();
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [releaseWorkspaceTab, setReleaseWorkspaceTab] = useState("foundation");
  const [selectedArtist, setSelectedArtist] = useState<ArtistAlias>("the-arkadiusz");
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(true);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [database, setDatabase] = useState<DatabaseHealth | null>(null);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftDeleteMessage, setDraftDeleteMessage] = useState("");
  const [activeReleaseId, setActiveReleaseId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [assetMessage, setAssetMessage] = useState("");
  const [audioAnalyses, setAudioAnalyses] = useState<Record<string, AudioAnalysisSummary>>({});
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({});
  const [analyzingAssetId, setAnalyzingAssetId] = useState<string | null>(null);
  const [releaseReadiness, setReleaseReadiness] = useState<ReleaseReadiness | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [releaseSaveFailed, setReleaseSaveFailed] = useState(false);
  const [bridgeError, setBridgeError] = useState("");
  const [aiSettings, setAiSettings] = useState<AiSettings>({ model: null, language: "en", channel: "Instagram" });
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedCampaignDraft | null>(null);
  const [generationState, setGenerationState] = useState<"idle" | "generating" | "error">("idle");
  const [generationMessage, setGenerationMessage] = useState("");
  const [title, setTitle] = useState("Different Perspective");
  const [story, setStory] = useState("Seeing beyond ego reveals another perspective.");
  const [releaseDate, setReleaseDate] = useState("");
  const [primaryGenre, setPrimaryGenre] = useState("Full-On Psytrance");
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus>("draft");
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskAssignee, setTaskAssignee] = useState<TaskAssignee>("human");
  const [taskMessage, setTaskMessage] = useState("");
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [soundCloud, setSoundCloud] = useState<SoundCloudConnection | null>(null);
  const [soundCloudTracks, setSoundCloudTracks] = useState<SoundCloudTrackSummary[]>([]);
  const [soundCloudClientId, setSoundCloudClientId] = useState("");
  const [soundCloudClientSecret, setSoundCloudClientSecret] = useState("");
  const [soundCloudMessage, setSoundCloudMessage] = useState("");
  const [soundCloudBusy, setSoundCloudBusy] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<SoundCloudCatalogStatus | "all">("all");
  const [catalogArtistFilter, setCatalogArtistFilter] = useState<ArtistAlias | "all" | "unassigned">("all");
  const [catalogSort, setCatalogSort] = useState<"newest" | "plays" | "likes" | "engagement">("engagement");
  const [selectedPerformanceTrackId, setSelectedPerformanceTrackId] = useState<number | null>(null);
  const [trackPerformance, setTrackPerformance] = useState<SoundCloudTrackPerformance | null>(null);
  const [spotify, setSpotify] = useState<SpotifyConnection | null>(null);
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyArtistIds, setSpotifyArtistIds] = useState<Record<ArtistAlias, string>>({ "the-arkadiusz": "", arkadelic: "", "ar-tek": "", "echoes-of-arcadia": "" });
  const [spotifyReleases, setSpotifyReleases] = useState<SpotifyReleaseSummary[]>([]);
  const [spotifyMessage, setSpotifyMessage] = useState("");
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [catalogMatches, setCatalogMatches] = useState<CatalogMatchSuggestion[]>([]);
  const [campaignPackItems, setCampaignPackItems] = useState<CampaignPackItem[]>([]);
  const [campaignPackBusy, setCampaignPackBusy] = useState(false);
  const [campaignPackMessage, setCampaignPackMessage] = useState("");
  const [mediaSettings,setMediaSettings]=useState<MediaGenerationSettings>({openAiConfigured:false,klingConfigured:false,klingCliConfigured:false,klingCliVersion:null,comfyUiUrl:"http://127.0.0.1:8188",comfyUiAvailable:false,comfyUiCheckpoints:[],comfyUiCheckpoint:null,comfyUiError:null});
  const [klingCliStatus,setKlingCliStatus]=useState<KlingCliStatus|null>(null);
   const [openAiKey,setOpenAiKey]=useState("");
  const [comfyUiUrl,setComfyUiUrl]=useState("http://127.0.0.1:8188"); const [comfyUiCheckpoint,setComfyUiCheckpoint]=useState("");
  const [mediaGenerations,setMediaGenerations]=useState<MediaGenerationSummary[]>([]); const [mediaUrls,setMediaUrls]=useState<Record<string,string>>({});
  const [mediaBusy,setMediaBusy]=useState<string|null>(null); const [mediaMessage,setMediaMessage]=useState("");
  const [localServices,setLocalServices]=useState<LocalServiceStatus|null>(null); const [localServiceBusy,setLocalServiceBusy]=useState(false);
  const [publishingQueue,setPublishingQueue]=useState<PublishingQueueItem[]>([]);const [dashboardEvents,setDashboardEvents]=useState<ScheduleEvent[]>([]);const [publishingMessage,setPublishingMessage]=useState("");const [publishingEditId,setPublishingEditId]=useState<string|null>(null);const [publishingEditCaption,setPublishingEditCaption]=useState("");const [publishingEditDate,setPublishingEditDate]=useState("");const [publishingReviewReason,setPublishingReviewReason]=useState("");
  const [brandProfiles,setBrandProfiles]=useState<BrandProfile[]>([]);const [brandDraft,setBrandDraft]=useState<BrandProfile|null>(null);const [brandMessage,setBrandMessage]=useState("");const [imageAspect,setImageAspect]=useState<"default"|MediaAspectRatio>("default");
  const [analyticsArtist,setAnalyticsArtist]=useState<ArtistAlias|"all">("all");const [analyticsPeriod,setAnalyticsPeriod]=useState<7|30|90>(30);const [analyticsReadiness,setAnalyticsReadiness]=useState<Record<string,ReleaseReadiness>>({});const [analyticsPerformance,setAnalyticsPerformance]=useState<Record<number,SoundCloudTrackPerformance>>({});const [analyticsMessage,setAnalyticsMessage]=useState("");
  const [contacts,setContacts]=useState<ContactSummary[]>([]);const [contactDraft,setContactDraft]=useState<UpsertContactInput>(emptyContact);const [contactQuery,setContactQuery]=useState("");const [contactStatusFilter,setContactStatusFilter]=useState<ContactRelationshipStatus|"all">("all");const [contactMessage,setContactMessage]=useState("");const [interactionSummary,setInteractionSummary]=useState("");const [interactionChannel,setInteractionChannel]=useState<ContactChannel|"meeting">("email");const [interactionDirection,setInteractionDirection]=useState<"outbound"|"inbound"|"note">("note");
  const [meta,setMeta]=useState<MetaConnection|null>(null);const [metaAppId,setMetaAppId]=useState("");const [metaAppSecret,setMetaAppSecret]=useState("");const [metaConfigurationId,setMetaConfigurationId]=useState("");const [metaBusy,setMetaBusy]=useState(false);const [metaMessage,setMetaMessage]=useState("");const [metaDestinationByItem,setMetaDestinationByItem]=useState<Record<string,string>>({});const [metaQueueItemId,setMetaQueueItemId]=useState("");
  const [mediaBridge,setMediaBridge]=useState<MediaBridgeStatus|null>(null);const [r2AccountId,setR2AccountId]=useState("");const [r2Bucket,setR2Bucket]=useState("");const [r2AccessKeyId,setR2AccessKeyId]=useState("");const [r2SecretAccessKey,setR2SecretAccessKey]=useState("");const [bridgeBusy,setBridgeBusy]=useState(false);const [bridgeMessage,setBridgeMessage]=useState("");
  const [youTube,setYouTube]=useState<YouTubeConnection|null>(null);const [youTubeClientId,setYouTubeClientId]=useState("");const [youTubeClientSecret,setYouTubeClientSecret]=useState("");const [youTubeBusy,setYouTubeBusy]=useState(false);const [youTubeMessage,setYouTubeMessage]=useState("");
  const [youTubeChannelData,setYouTubeChannelData]=useState<YouTubeChannelDataSnapshot|null>(null);const [youTubeDataBusy,setYouTubeDataBusy]=useState(false);const [youTubeDataMessage,setYouTubeDataMessage]=useState("");const [youTubeAnalyticsRange,setYouTubeAnalyticsRange]=useState<YouTubeAnalyticsRange>("28d");const [youTubeAnalytics,setYouTubeAnalytics]=useState<YouTubeAnalyticsSnapshot|null>(null);const [youTubeAnalyticsBusy,setYouTubeAnalyticsBusy]=useState(false);const [youTubeAnalyticsMessage,setYouTubeAnalyticsMessage]=useState("");
  const [tikTok,setTikTok]=useState<TikTokConnection|null>(null);const [tikTokClientKey,setTikTokClientKey]=useState("");const [tikTokClientSecret,setTikTokClientSecret]=useState("");const [tikTokBusy,setTikTokBusy]=useState(false);const [tikTokMessage,setTikTokMessage]=useState("");
  const artist = useMemo(() => artists.find((item) => item.id === selectedArtist) ?? artists[0], [selectedArtist]);

  useEffect(() => {
    if (!window.studio) {
      setBridgeError("Desktop bridge unavailable — restart after updating the application.");
      return;
    }
    void (async () => {
      try {
        const [system, databaseHealth, savedReleases, savedDrafts, savedAiSettings, savedTasks] = await Promise.all([
          window.studio!.getSystemStatus(),
          window.studio!.getDatabaseHealth(),
          window.studio!.listReleases(),
          window.studio!.listDrafts(),
          window.studio!.getAiSettings(),
          window.studio!.listTasks()
        ]);
        setStatus(system);
        setDatabase(databaseHealth);
        setReleases(savedReleases);
        setDrafts(savedDrafts);
        setTasks(savedTasks);
        if (savedReleases[0]) {
          setActiveReleaseId(savedReleases[0].id);
          setSelectedArtist(savedReleases[0].artistId);
          setTitle(savedReleases[0].title);
          setStory(savedReleases[0].story);
          setReleaseDate(savedReleases[0].releaseDate ?? "");
          setPrimaryGenre(savedReleases[0].primaryGenre);
          setReleaseStatus(savedReleases[0].status);
          const [initialAssets, initialReadiness] = await Promise.all([
            window.studio!.listAssets(savedReleases[0].id),
            window.studio!.getReleaseReadiness(savedReleases[0].id)
          ]);
          setAssets(initialAssets);
          setReleaseReadiness(initialReadiness);
          const analyses = await Promise.all(initialAssets.filter((asset) => asset.kind === "audio").map(async (asset) => [asset.id, await window.studio!.getAudioAnalysis(asset.id)] as const));
          setAudioAnalyses(Object.fromEntries(analyses.filter((entry): entry is readonly [string, AudioAnalysisSummary] => entry[1] !== null)));
        }
        const savedModelStillExists = savedAiSettings.model === null || system.ollama.models.some((model) => model.name === savedAiSettings.model);
        const preferredModel = system.ollama.models.find((model) => /^deepseek-r1(?::|$)/i.test(model.name)) ?? system.ollama.models[0];
        const resolvedSettings = savedModelStillExists || system.ollama.models.length === 0
          ? savedAiSettings
          : await window.studio!.saveAiSettings({ ...savedAiSettings, model: preferredModel.name });
        setAiSettings(resolvedSettings);
      } catch (error) {
        setBridgeError(error instanceof Error ? error.message : "Desktop services could not be initialized.");
      }
    })();
  }, []);

  useEffect(() => { if ((activeView !== "overview" && activeView !== "analytics") || !window.studio) return; void window.studio.getYouTubeAnalytics(youTubeAnalyticsRange).then(setYouTubeAnalytics).catch(() => undefined); }, [activeView, youTubeAnalyticsRange]);

  useEffect(() => {
    if (activeView !== "overview" || !window.studio) return;
    const assetPromise = activeReleaseId ? window.studio.listAssets(activeReleaseId) : Promise.resolve([] as AssetSummary[]);
    void Promise.all([window.studio.listTasks(), window.studio.listPublishingQueue(), window.studio.listScheduleEvents(), window.studio.getMetaConnection(), window.studio.getSoundCloudConnection(), window.studio.getSpotifyConnection(), window.studio.getYouTubeConnection(), window.studio.getYouTubeChannelData(), window.studio.getYouTubeAnalytics(youTubeAnalyticsRange), assetPromise]).then(([savedTasks, queue, events, metaConnection, soundCloudConnection, spotifyConnection, youTubeConnection, youTubeData, analyticsSnapshot, releaseAssets]) => {
      setTasks(savedTasks); setPublishingQueue(queue); setMeta(metaConnection); setSoundCloud(soundCloudConnection); setSpotify(spotifyConnection); setYouTube(youTubeConnection); setYouTubeChannelData(youTubeData); setYouTubeAnalytics(analyticsSnapshot);
      setDashboardEvents(events);
      setAssets(releaseAssets);
    }).catch((error) => setBridgeError(error instanceof Error ? error.message : "Could not load dashboard operations."));
  }, [activeView, activeReleaseId]);
  useEffect(() => {
    if (activeView !== "calendar"||!window.studio)return;const extras=activeReleaseId?Promise.all([window.studio.listCampaignPackItems(activeReleaseId),window.studio.listMediaGenerations(activeReleaseId)]):Promise.resolve([[],[]] as [CampaignPackItem[],MediaGenerationSummary[]]);void Promise.all([window.studio.listTasks(),window.studio.listPublishingQueue(),extras,window.studio.getMetaConnection()]).then(([savedTasks,queue,[pack,media],metaConnection])=>{setTasks(savedTasks);setPublishingQueue(queue);setCampaignPackItems(pack);setMediaGenerations(media);setMeta(metaConnection);}).catch((error) => setTaskMessage(error instanceof Error ? error.message : "Could not load tasks and publishing queue"));
  }, [activeView,activeReleaseId]);
  useEffect(()=>{if(activeView!=="settings"||!window.studio)return;void window.studio.listBrandProfiles().then((profiles)=>{setBrandProfiles(profiles);setBrandDraft((current)=>profiles.find((profile)=>profile.artistId===current?.artistId)??profiles[0]??null);}).catch((error)=>setBrandMessage(error instanceof Error?error.message:"Could not load brand profiles"));},[activeView]);
  useEffect(()=>{if(activeView!=="analytics"||!window.studio)return;setAnalyticsMessage("Loading real catalog analytics...");void Promise.all([window.studio.listSoundCloudTracks(),window.studio.listSpotifyReleases(),window.studio.listPublishingQueue(),window.studio.listTasks()]).then(async([tracks,spotifyRows,queue,savedTasks])=>{setSoundCloudTracks(tracks);setSpotifyReleases(spotifyRows);setPublishingQueue(queue);setTasks(savedTasks);const [readiness,performance]=await Promise.all([Promise.all(releases.map(async(release)=>[release.id,await window.studio!.getReleaseReadiness(release.id)] as const)),Promise.all(tracks.map(async(track)=>[track.id,await window.studio!.getSoundCloudTrackPerformance(track.id)] as const))]);setAnalyticsReadiness(Object.fromEntries(readiness));setAnalyticsPerformance(Object.fromEntries(performance));setAnalyticsMessage("");}).catch((error)=>setAnalyticsMessage(error instanceof Error?error.message:"Could not load analytics"));},[activeView,releases]);
  useEffect(()=>{if(activeView!=="contacts"||!window.studio)return;void window.studio.listContacts().then(setContacts).catch((error)=>setContactMessage(error instanceof Error?error.message:"Could not load contacts"));},[activeView]);

  useEffect(() => { if (activeView === "releases" && activeReleaseId && window.studio) void Promise.all([window.studio.listCampaignPackItems(activeReleaseId),window.studio.listMediaGenerations(activeReleaseId),window.studio.getMediaGenerationSettings(),window.studio.getKlingCliStatus()]).then(([items,media,mediaSettingsResult,klingCli])=>{setCampaignPackItems(items);setMediaGenerations(media);setMediaSettings(mediaSettingsResult);setKlingCliStatus(klingCli);}).catch((error) => setCampaignPackMessage(error instanceof Error ? error.message : "Could not load campaign pack")); }, [activeView, activeReleaseId]);
  useEffect(()=>{if(!window.studio)return;void Promise.all(mediaGenerations.filter((item)=>["ready","approved","rejected"].includes(item.status)).map(async(item)=>[item.id,await window.studio!.getGeneratedMediaUrl(item.id)] as const)).then((entries)=>setMediaUrls(Object.fromEntries(entries))).catch(()=>undefined);},[mediaGenerations]);
  useEffect(()=>{if(!window.studio)return;const audioAssets=assets.filter((asset)=>asset.kind==="audio");void Promise.all(audioAssets.map(async(asset)=>[asset.id,await window.studio!.getAssetPlaybackUrl(asset.id)] as const)).then((entries)=>setPlaybackUrls(Object.fromEntries(entries))).catch((error)=>setAssetMessage(error instanceof Error?error.message:"Could not prepare audio preview"));},[assets]);
  const pendingMediaKey=mediaGenerations.filter((item)=>item.status==="generating"&&["comfyui","kling-cli"].includes(item.provider)).map((item)=>item.id).sort().join("|");
  useEffect(()=>{if(!window.studio||!pendingMediaKey)return;let cancelled=false,busy=false;const poll=async()=>{if(busy||cancelled)return;busy=true;try{const ids=pendingMediaKey.split("|");const updates=await Promise.all(ids.map((id)=>window.studio!.refreshMediaGeneration(id)));if(cancelled)return;setMediaGenerations((current)=>current.map((item)=>updates.find((updated)=>updated.id===item.id)??item));}catch(error){if(!cancelled)setMediaMessage(error instanceof Error?error.message:"Could not refresh generated media");}finally{busy=false;}};void poll();const timer=window.setInterval(()=>void poll(),5000);return()=>{cancelled=true;window.clearInterval(timer);};},[pendingMediaKey]);

  async function updateAiSettings(next: AiSettings) {
    setAiSettings(next);
    if (!window.studio) return;
    try { setAiSettings(await window.studio.saveAiSettings(next)); }
    catch (error) { setGenerationMessage(error instanceof Error ? error.message : "Could not save AI settings"); }
  }

  async function saveSoundCloudCredentials() {
    if (!window.studio) return;
    setSoundCloudBusy(true); setSoundCloudMessage("Saving encrypted credentials...");
    try {
      setSoundCloud(await window.studio.saveSoundCloudCredentials(soundCloudClientId, soundCloudClientSecret));
      setSoundCloudClientSecret(""); setSoundCloudMessage("Credentials saved securely on this computer.");
    } catch (error) { setSoundCloudMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not save credentials"); }
    finally { setSoundCloudBusy(false); }
  }

  async function connectSoundCloud() {
    if (!window.studio) return;
    setSoundCloudBusy(true); setSoundCloudMessage("Complete authorization in the browser. This screen will update automatically.");
    try {
      await window.studio.beginSoundCloudConnect();
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const connection = await window.studio.getSoundCloudConnection(); setSoundCloud(connection);
        if (connection.connected) { setSoundCloudMessage(`Connected as ${connection.username}. You can now import the catalog.`); return; }
        if (connection.error) throw new Error(connection.error);
      }
      throw new Error("Authorization timed out. Start the connection again.");
    } catch (error) { setSoundCloudMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "SoundCloud connection failed"); }
    finally { setSoundCloudBusy(false); }
  }

  async function syncSoundCloudCatalog() {
    if (!window.studio) return;
    setSoundCloudBusy(true); setSoundCloudMessage("Importing your SoundCloud catalog...");
    try { const tracks = await window.studio.syncSoundCloudCatalog(); setSoundCloudTracks(tracks); setSoundCloudMessage(`Catalog synchronized: ${tracks.length} tracks.`); }
    catch (error) { setSoundCloudMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Catalog import failed"); }
    finally { setSoundCloudBusy(false); }
  }

  async function disconnectSoundCloud() {
    if (!window.studio) return;
    setSoundCloudBusy(true);
    try { setSoundCloud(await window.studio.disconnectSoundCloud()); setSoundCloudMessage("SoundCloud disconnected. The imported catalog remains available locally."); }
    catch (error) { setSoundCloudMessage(error instanceof Error ? error.message : "Could not disconnect SoundCloud"); }
    finally { setSoundCloudBusy(false); }
  }

  async function classifySoundCloudTrack(track: SoundCloudTrackSummary, artistId: ArtistAlias | null, catalogStatus: SoundCloudCatalogStatus, contentType: SoundCloudContentType) {
    if (!window.studio) return;
    try {
      const updated = await window.studio.updateSoundCloudTrack({ id: track.id, artistId, catalogStatus, contentType });
      setSoundCloudTracks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) { setSoundCloudMessage(error instanceof Error ? error.message : "Could not classify track"); }
  }

  async function markVisibleTracksAsBootlegs() {
    if (!window.studio || visibleSoundCloudTracks.length === 0) return;
    if (!window.confirm(`Mark ${visibleSoundCloudTracks.length} currently visible tracks as uncleared bootlegs?`)) return;
    try {
      setSoundCloudTracks(await window.studio.setSoundCloudTracksContentType(visibleSoundCloudTracks.map((track) => track.id), "bootleg"));
      setSoundCloudMessage(`${visibleSoundCloudTracks.length} tracks marked as Bootleg · rights not cleared.`);
    } catch (error) { setSoundCloudMessage(error instanceof Error ? error.message : "Bulk classification failed"); }
  }

  async function linkSoundCloudTrack(track: SoundCloudTrackSummary, releaseId: string | null) {
    if (!window.studio) return;
    try {
      const updated = await window.studio.linkSoundCloudTrack(track.id, releaseId);
      setSoundCloudTracks((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSoundCloudMessage(releaseId ? `Linked “${track.title}” to ${updated.releaseTitle}. Saved automatically.` : `Unlinked “${track.title}”.`);
    } catch (error) { setSoundCloudMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not link release"); }
  }

  async function createLocalEntryFromSoundCloud(track: SoundCloudTrackSummary) {
    if (!window.studio || !track.artistId) { setSoundCloudMessage("Assign an artist alias before creating a local entry."); return; }
    try {
      const profile = artists.find((item) => item.id === track.artistId)!;
      const created = await window.studio.createReleaseDraft({ artistId: track.artistId, title: track.title, primaryGenre: track.genre || profile.genres[0], story: `Imported from SoundCloud: ${track.permalinkUrl}`, releaseDate: track.createdAt.slice(0, 10) });
      const linked = await window.studio.linkSoundCloudTrack(track.id, created.id);
      setReleases((current) => [created, ...current]);
      setSoundCloudTracks((current) => current.map((item) => item.id === linked.id ? linked : item));
      setSoundCloudMessage(track.contentType === "bootleg" ? "Local draft created for catalog tracking. Bootleg remains blocked from official release." : "Local release draft created and linked to SoundCloud.");
    } catch (error) { setSoundCloudMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not create local entry"); }
  }

  async function toggleTrackPerformance(trackId: number) {
    if (!window.studio) return;
    if (selectedPerformanceTrackId === trackId) { setSelectedPerformanceTrackId(null); setTrackPerformance(null); return; }
    try { setTrackPerformance(await window.studio.getSoundCloudTrackPerformance(trackId)); setSelectedPerformanceTrackId(trackId); }
    catch (error) { setSoundCloudMessage(error instanceof Error ? error.message : "Could not load performance history"); }
  }

  async function saveSpotifyConfiguration() {
    if (!window.studio) return; setSpotifyBusy(true);
    try { if (spotifyClientId.trim()) setSpotify(await window.studio.saveSpotifyClientId(spotifyClientId)); await window.studio.saveSpotifyArtistMappings(artists.flatMap((artist) => spotifyArtistIds[artist.id].trim() ? [{ artistId: artist.id, spotifyArtistId: spotifyArtistIds[artist.id] }] : [])); setSpotifyClientId(""); setSpotifyMessage("Spotify configuration saved locally."); }
    catch (error) { setSpotifyMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not save Spotify configuration"); } finally { setSpotifyBusy(false); }
  }
  async function connectSpotify() {
    if (!window.studio) return; setSpotifyBusy(true); setSpotifyMessage("Authorize in the browser...");
    try { await window.studio.beginSpotifyConnect(); for (let attempt = 0; attempt < 120; attempt++) { await new Promise((resolve) => window.setTimeout(resolve, 1000)); const connection = await window.studio.getSpotifyConnection(); setSpotify(connection); if (connection.connected) { setSpotifyMessage(`Connected as ${connection.displayName}.`); return; } if (connection.error) throw new Error(connection.error); } throw new Error("Spotify authorization timed out"); }
    catch (error) { setSpotifyMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Spotify connection failed"); } finally { setSpotifyBusy(false); }
  }
  async function syncSpotifyCatalog() { if (!window.studio) return; setSpotifyBusy(true); try { const mappings = await window.studio.saveSpotifyArtistMappings(artists.flatMap((artist) => spotifyArtistIds[artist.id].trim() ? [{ artistId: artist.id, spotifyArtistId: spotifyArtistIds[artist.id] }] : [])); setSpotifyArtistIds((current) => ({ ...current, ...Object.fromEntries(mappings.map((mapping) => [mapping.artistId, mapping.spotifyArtistId])) })); const items = await window.studio.syncSpotifyCatalog(); setSpotifyReleases(items); setCatalogMatches(await window.studio.getCatalogMatchSuggestions()); setSpotifyMessage(`Spotify catalog synchronized: ${items.length} releases.`); } catch (error) { setSpotifyMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Spotify sync failed"); } finally { setSpotifyBusy(false); } }
  async function linkSpotifyRelease(item: SpotifyReleaseSummary, releaseId: string | null) { if (!window.studio) return; try { const updated = await window.studio.linkSpotifyRelease(item.id, releaseId); setSpotifyReleases((current) => current.map((release) => release.id === updated.id ? updated : release)); setCatalogMatches(await window.studio.getCatalogMatchSuggestions()); setSpotifyMessage(releaseId ? `Spotify release linked to ${updated.releaseTitle}.` : "Spotify release unlinked."); } catch (error) { setSpotifyMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not link Spotify release"); } }
  async function acceptCatalogMatch(match: CatalogMatchSuggestion) { if (!window.studio) return; const source = soundCloudTracks.find((track) => track.id === match.soundCloudTrackId), target = spotifyReleases.find((release) => release.id === match.spotifyReleaseId); if (!source || !target || source.contentType === "bootleg") return; let created: ReleaseSummary | null = null; try { created = await window.studio.createReleaseDraft({ artistId: target.artistId, title: target.name, primaryGenre: source.genre || artists.find((artist) => artist.id === target.artistId)!.genres[0], story: `Unified catalog entry · SoundCloud: ${source.permalinkUrl} · Spotify: ${target.spotifyUrl}`, releaseDate: target.releaseDate }); const linkedSoundCloud = await window.studio.linkSoundCloudTrack(source.id, created.id); const linkedSpotify = await window.studio.linkSpotifyRelease(target.id, created.id); setReleases((current) => [created!, ...current]); setSoundCloudTracks((current) => current.map((track) => track.id === linkedSoundCloud.id ? linkedSoundCloud : track)); setSpotifyReleases((current) => current.map((release) => release.id === linkedSpotify.id ? linkedSpotify : release)); setCatalogMatches(await window.studio.getCatalogMatchSuggestions()); setSpotifyMessage(`Unified entry created: ${target.name}.`); } catch (error) { if (created) await window.studio.deleteRelease(created.id).catch(() => undefined); setSpotifyMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not accept match"); } }
  async function saveMetaCredentials(){if(!window.studio)return;setMetaBusy(true);try{const saved=await window.studio.saveMetaCredentials(metaAppId,metaAppSecret,metaConfigurationId);setMeta(saved);setMetaConfigurationId(saved.configurationId??"");setMetaAppSecret("");setMetaMessage("Meta credentials and Business Login configuration saved securely.");}catch(error){setMetaMessage(error instanceof Error?error.message:"Could not save Meta credentials");}finally{setMetaBusy(false);}}
  async function connectMeta(){if(!window.studio)return;setMetaBusy(true);setMetaMessage("Authorize Facebook Pages and Instagram accounts in the browser...");try{await window.studio.beginMetaConnect();for(let attempt=0;attempt<180;attempt++){await new Promise((resolve)=>window.setTimeout(resolve,1000));const connection=await window.studio.getMetaConnection();setMeta(connection);if(connection.connected){setMetaMessage(`Connected ${connection.destinations.length} Meta destinations.`);return;}if(connection.error)throw new Error(connection.error);}throw new Error("Meta authorization timed out");}catch(error){setMetaMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Meta connection failed");}finally{setMetaBusy(false);}}
  async function disconnectMeta(){if(!window.studio)return;setMeta(await window.studio.disconnectMeta());setMetaMessage("Meta disconnected locally.");}  async function saveMediaBridge(){if(!window.studio)return;setBridgeBusy(true);setBridgeMessage("Testing encrypted Cloudflare R2 connection...");try{const saved=await window.studio.saveMediaBridgeSettings(r2AccountId,r2Bucket,r2AccessKeyId,r2SecretAccessKey);setMediaBridge(saved);setR2SecretAccessKey("");setBridgeMessage("Secure Media Bridge connected. Temporary Instagram delivery is ready.");}catch(error){setBridgeMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not configure the Media Bridge");}finally{setBridgeBusy(false);}}
  async function saveYouTubeCredentials(){if(!window.studio)return;setYouTubeBusy(true);try{const saved=await window.studio.saveYouTubeCredentials(youTubeClientId,youTubeClientSecret);setYouTube(saved);setYouTubeClientSecret("");setYouTubeMessage("YouTube credentials saved securely.");}catch(error){setYouTubeMessage(error instanceof Error?error.message:"Could not save YouTube credentials");}finally{setYouTubeBusy(false);}}
  async function connectYouTube(){if(!window.studio)return;setYouTubeBusy(true);setYouTubeMessage("Authorize YouTube channel in the browser...");try{await window.studio.beginYouTubeConnect();for(let attempt=0;attempt<180;attempt++){await new Promise((resolve)=>window.setTimeout(resolve,1000));const connection=await window.studio.getYouTubeConnection();setYouTube(connection);if(connection.connected){setYouTubeMessage(`Connected channel: ${connection.channelTitle}`);return;}if(connection.error)throw new Error(connection.error);}throw new Error("YouTube authorization timed out");}catch(error){setYouTubeMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"YouTube connection failed");}finally{setYouTubeBusy(false);}}
  async function disconnectYouTube(){if(!window.studio)return;setYouTube(await window.studio.disconnectYouTube());setYouTubeMessage("YouTube disconnected locally.");}
  async function syncYouTubeChannelData(){
    if(!window.studio)return;
    setYouTubeDataBusy(true);
    setYouTubeDataMessage("Syncing channel data...");
    try {
      const result=await window.studio.syncYouTubeChannelData();
      if(!result.ok){setYouTubeDataMessage(result.sanitizedError??"Channel data sync failed. Previous data is still available.");return;}
      const snapshot=await window.studio.getYouTubeChannelData();
      setYouTubeChannelData(snapshot);
      setYouTubeDataMessage(`Channel data synced: ${result.videosFetched} videos from ${result.pagesFetched} playlist page${result.pagesFetched===1?"":"s"}.`);
    } catch(error) {
      setYouTubeDataMessage(error instanceof Error?error.message:"Channel data sync failed. Previous data is still available.");
    } finally {setYouTubeDataBusy(false);}
  }
  async function syncYouTubeAnalytics(){if(!window.studio)return;setYouTubeAnalyticsBusy(true);setYouTubeAnalyticsMessage("Syncing YouTube Analytics...");try{const result=await window.studio.syncYouTubeAnalytics(youTubeAnalyticsRange);if(result.ok){setYouTubeAnalytics(result.snapshot);setYouTubeAnalyticsMessage("Analytics synced.");}else setYouTubeAnalyticsMessage(result.sanitizedError??"Analytics sync failed. Previous data remains available.");}catch(error){setYouTubeAnalyticsMessage(error instanceof Error?error.message:"Analytics sync failed.");}finally{setYouTubeAnalyticsBusy(false);}}  async function saveTikTokCredentials(){if(!window.studio)return;setTikTokBusy(true);try{const saved=await window.studio.saveTikTokCredentials(tikTokClientKey,tikTokClientSecret);setTikTok(saved);setTikTokClientSecret("");setTikTokMessage("TikTok credentials saved securely.");}catch(error){setTikTokMessage(error instanceof Error?error.message:"Could not save TikTok credentials");}finally{setTikTokBusy(false);}}
  async function connectTikTok(){if(!window.studio)return;setTikTokBusy(true);setTikTokMessage("Authorize TikTok account in the browser...");try{await window.studio.beginTikTokConnect();for(let attempt=0;attempt<180;attempt++){await new Promise((resolve)=>window.setTimeout(resolve,1000));const connection=await window.studio.getTikTokConnection();setTikTok(connection);if(connection.connected){setTikTokMessage(`Connected TikTok open_id ${connection.openId}`);return;}if(connection.error)throw new Error(connection.error);}throw new Error("TikTok authorization timed out");}catch(error){setTikTokMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"TikTok connection failed");}finally{setTikTokBusy(false);}}
  async function disconnectTikTok(){if(!window.studio)return;setTikTok(await window.studio.disconnectTikTok());setTikTokMessage("TikTok disconnected locally.");}

  async function generateWithOllama() {
    if (!window.studio || !aiSettings.model) {
      setGenerationState("error");
      setGenerationMessage("Select a local Ollama model first.");
      return;
    }
    if (!activeReleaseId) {
      setGenerationState("error");
      setGenerationMessage("Create the release first. Unsaved releases are never added automatically.");
      return;
    }
    setGenerationState("generating");
    setGenerationMessage(`Generating with ${aiSettings.model}...`);
    try {
      const releaseId = activeReleaseId;
      const result = await window.studio.generateCampaignDraft({
        ...aiSettings,
        model: aiSettings.model,
        artistId: selectedArtist,
        artistName: artist.name,
        artistVoice: artist.voice,
        title,
        primaryGenre,
        story,
        releaseDate: releaseDate || null
      });
      const savedDraft = await window.studio.saveGeneratedDraft({
        releaseId,
        channel: result.channel,
        language: result.language,
        content: result.content,
        model: result.model
      });
      setGeneratedDraft(result);
      setDrafts((current) => [savedDraft, ...current]);
      setReleaseReadiness(await window.studio.getReleaseReadiness(releaseId));
      setGenerationState("idle");
      setGenerationMessage(`Generated locally with ${result.model} and saved as Draft`);
    } catch (error) {
      setGenerationState("error");
      const message = error instanceof Error ? error.message : "Ollama generation failed";
      setGenerationMessage(message.includes("TimeoutError")
        ? "The model did not respond within 5 minutes. Check whether it fits in GPU memory or select a smaller variant."
        : message.replace(/^Error invoking remote method '[^']+': Error: /, ""));
    }
  }
  async function generateCampaignPack() { if (!window.studio || !activeReleaseId || !aiSettings.model) { setCampaignPackMessage("Save a release and select an Ollama model first."); return; } setCampaignPackBusy(true); setCampaignPackMessage("Generating the complete local campaign pack..."); try { const items=await window.studio.generateCampaignPack({releaseId:activeReleaseId,...aiSettings,model:aiSettings.model,artistId:selectedArtist,artistName:artist.name,artistVoice:artist.voice,title,primaryGenre,story,releaseDate:releaseDate||null}); setCampaignPackItems(items); setCampaignPackMessage(`Campaign pack generated in ${aiSettings.language.toUpperCase()}. ${items.length} items saved as Draft.`); } catch(error){setCampaignPackMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Campaign pack generation failed");} finally{setCampaignPackBusy(false);} }
  async function changeCampaignPackStatus(itemId:string,next:DraftStatus){if(!window.studio)return;try{const updated=await window.studio.updateCampaignPackItemStatus(itemId,next);setCampaignPackItems((current)=>current.map((item)=>item.id===updated.id?updated:item));}catch(error){setCampaignPackMessage(error instanceof Error?error.message:"Could not update campaign item");}}
  async function saveMediaCredentials(){if(!window.studio)return;setMediaMessage("Saving encrypted API key...");try{setMediaSettings(await window.studio.saveMediaGenerationCredentials(openAiKey,""));setOpenAiKey("");setMediaMessage("API key saved with operating-system encryption.");}catch(error){setMediaMessage(error instanceof Error?error.message:"Could not save API key");}}
  async function testComfyUi(){if(!window.studio)return;setMediaMessage("Connecting to local ComfyUI...");try{const settings=await window.studio.testComfyUi(comfyUiUrl);setMediaSettings(settings);setComfyUiUrl(settings.comfyUiUrl);setComfyUiCheckpoint(settings.comfyUiCheckpoint??"");setMediaMessage(`ComfyUI connected. ${settings.comfyUiCheckpoints.length} checkpoint(s) found.`);}catch(error){setMediaMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"ComfyUI connection failed");}}
  async function saveComfyUi(){if(!window.studio||!comfyUiCheckpoint)return;setMediaMessage("Saving local image model...");try{const settings=await window.studio.saveComfyUiSettings(comfyUiUrl,comfyUiCheckpoint);setMediaSettings(settings);setMediaMessage(`ComfyUI ready with ${settings.comfyUiCheckpoint}.`);}catch(error){setMediaMessage(error instanceof Error?error.message:"Could not save ComfyUI settings");}}
  async function chooseComfyLauncher(){if(!window.studio)return;setLocalServiceBusy(true);try{setLocalServices(await window.studio.selectComfyUiLauncher());}finally{setLocalServiceBusy(false);}}
  async function toggleLocalService(service:"ollama"|"comfyui",running:boolean){if(!window.studio)return;setLocalServiceBusy(true);setMediaMessage(`${running?"Stopping":"Starting"} ${service}...`);try{const next=running?await window.studio.stopLocalService(service):await window.studio.startLocalService(service);setLocalServices(next);const runningNow=service==="ollama"?next.ollama.running:next.comfyUi.running;setMediaMessage(`${service} is ${runningNow?"running":"stopped"}.`);}catch(error){setMediaMessage(error instanceof Error?error.message:"Local service operation failed");}finally{setLocalServiceBusy(false);}}
  async function toggleServiceAutoStart(enabled:boolean){if(!window.studio)return;setLocalServices(await window.studio.setLocalServicesAutoStart(enabled));}
  async function generateMedia(item:CampaignPackItem,provider:MediaProvider,mediaType:"image"|"video"){if(!window.studio)return;setMediaBusy(item.id);setMediaMessage(provider==="comfyui"?"Starting ComfyUI on demand, then sending the image prompt...":provider==="kling-cli"?`Starting Kling CLI ${mediaType} generation...`:`Starting ${provider} ${mediaType} generation. This may use paid credits...`);try{const result=await window.studio.generateMedia({campaignPackItemId:item.id,provider,mediaType,...(imageAspect==="default"?{}:{aspectRatio:imageAspect})});setMediaGenerations((current)=>[result,...current.filter((row)=>row.id!==result.id)]);if(provider==="comfyui")setLocalServices(await window.studio.getLocalServiceStatus());setMediaMessage(result.status==="generating"?`${provider==="comfyui"?"ComfyUI":provider==="kling-cli"?"Kling CLI":provider} accepted the task. Use Refresh in the gallery after it finishes.`:"Generated media downloaded to the local gallery.");}catch(error){setMediaMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Media generation failed");}finally{setMediaBusy(null);}}
  async function refreshMedia(id:string){if(!window.studio)return;setMediaBusy(id);try{const updated=await window.studio.refreshMediaGeneration(id);setMediaGenerations((current)=>current.map((row)=>row.id===id?updated:row));if(updated.status==="generating")setMediaMessage("Still generating. Refresh again in a moment.");else if(updated.status==="ready")setMediaMessage("Generated image downloaded to the local gallery.");else if(updated.error)setMediaMessage(updated.error);}catch(error){setMediaMessage(error instanceof Error?error.message:"Could not refresh generation");}finally{setMediaBusy(null);}}
  async function reviewMedia(id:string,status:"approved"|"rejected"){if(!window.studio)return;const updated=await window.studio.updateMediaGenerationStatus(id,status);setMediaGenerations((current)=>current.map((row)=>row.id===id?updated:row));}
  async function reviewPublishingItem(id:string,action:"APPROVE"|"REJECT"|"RETURN_TO_DRAFT"|"SCHEDULE"){if(!window.studio)return;try{const updated=await window.studio.reviewPublishingQueueItem({id,action,reason:publishingReviewReason.trim()||undefined});setPublishingQueue((current)=>current.map((item)=>item.id===id?updated:item));setPublishingReviewReason("");setPublishingMessage(action==="REJECT"?"Queue item rejected.":action==="SCHEDULE"?"Queue item scheduled.":action==="APPROVE"?"Queue item approved.":"Queue item returned to Draft.");}catch(error){setPublishingMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not review publishing item");}}
  function beginPublishingEdit(item:PublishingQueueItem){setPublishingEditId(item.id);setPublishingEditCaption(item.caption);setPublishingEditDate(item.scheduledAt?new Date(item.scheduledAt).toISOString().slice(0,16):"");}
  async function savePublishingEdit(id:string){if(!window.studio)return;try{const updated=await window.studio.updatePublishingQueueContent({id,caption:publishingEditCaption,scheduledAt:publishingEditDate?new Date(publishingEditDate).toISOString():null});setPublishingQueue((current)=>current.map((item)=>item.id===id?updated:item));setPublishingEditId(null);setPublishingMessage("Draft updated.");}catch(error){setPublishingMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not update draft");}}
  async function exportPublishingPack(id:string){if(!window.studio)return;try{const directory=await window.studio.exportPublishingPack(id);if(directory){setPublishingMessage(`Publishing pack exported to ${directory}`);setPublishingQueue(await window.studio.listPublishingQueue());}}catch(error){setPublishingMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not export publishing pack");}}
  async function publishMetaItem(id:string){if(!window.studio)return;const destinationId=metaDestinationByItem[id];if(!destinationId){setPublishingMessage("Select a Meta destination first.");return;}setPublishingMessage("Publishing through Meta Graph API...");try{const updated=await window.studio.publishMetaQueueItem(id,destinationId);setPublishingQueue((current)=>current.map((item)=>item.id===id?updated:item));setPublishingMessage(`Published successfully · Meta post ${updated.remotePostId}`);}catch(error){setPublishingQueue(await window.studio.listPublishingQueue());setPublishingMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Meta publishing failed");}}
  async function saveBrandProfile(){if(!window.studio||!brandDraft)return;setBrandMessage("Saving brand profile...");try{const updated=await window.studio.updateBrandProfile(brandDraft);setBrandProfiles((current)=>current.map((profile)=>profile.artistId===updated.artistId?updated:profile));setBrandDraft(updated);setBrandMessage(`${updated.artistName} brand profile saved.`);}catch(error){setBrandMessage(error instanceof Error?error.message:"Could not save brand profile");}}
  async function saveContact(){if(!window.studio)return;setContactMessage("Saving contact...");try{const saved=await window.studio.saveContact(contactDraft);setContacts(await window.studio.listContacts());setContactDraft({...emptyContact,id:saved.id,name:saved.name,contactType:saved.contactType,relationshipStatus:saved.relationshipStatus,artistId:saved.artistId,releaseId:saved.releaseId,organization:saved.organization??"",email:saved.email??"",phone:saved.phone??"",website:saved.website??"",socialHandle:saved.socialHandle??"",preferredChannel:saved.preferredChannel,consent:saved.consent,notes:saved.notes,nextFollowUpAt:saved.nextFollowUpAt,createFollowUpTask:false});setContactMessage(`Saved ${saved.name}.`);setTasks(await window.studio.listTasks());}catch(error){setContactMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not save contact");}}
  function editContact(contact:ContactSummary){setContactDraft({id:contact.id,name:contact.name,contactType:contact.contactType,relationshipStatus:contact.relationshipStatus,artistId:contact.artistId,releaseId:contact.releaseId,organization:contact.organization??"",email:contact.email??"",phone:contact.phone??"",website:contact.website??"",socialHandle:contact.socialHandle??"",preferredChannel:contact.preferredChannel,consent:contact.consent,notes:contact.notes,nextFollowUpAt:contact.nextFollowUpAt,createFollowUpTask:false});setInteractionSummary("");}
  async function removeContact(id:string){if(!window.studio||!window.confirm("Delete this contact and its interaction history?"))return;await window.studio.deleteContact(id);setContacts(await window.studio.listContacts());if(contactDraft.id===id)setContactDraft(emptyContact);}
  async function addContactInteraction(){if(!window.studio||!contactDraft.id||!interactionSummary.trim())return;const updated=await window.studio.addContactInteraction({contactId:contactDraft.id,channel:interactionChannel,direction:interactionDirection,summary:interactionSummary,occurredAt:new Date().toISOString()});setContacts(await window.studio.listContacts());editContact(updated);setInteractionSummary("");setContactMessage("Interaction added to history.");}

  async function persistRelease(): Promise<ReleaseSummary> {
    if (!window.studio) throw new Error("Desktop bridge unavailable");
    if (activeReleaseId) {
      const updated = await window.studio.updateRelease({
        id: activeReleaseId, artistId: selectedArtist, title, primaryGenre, story,
        releaseDate: releaseDate || null, status: releaseStatus
      });
      setReleases((current) => current.map((release) => release.id === updated.id ? updated : release));
      setReleaseReadiness(await window.studio.getReleaseReadiness(updated.id));
      return updated;
    }
    const created = await window.studio.createReleaseDraft({
      artistId: selectedArtist,
      title,
      primaryGenre,
      story,
      releaseDate: releaseDate || null
    });
    setReleases((current) => [created, ...current]);
    setActiveReleaseId(created.id);
    setReleaseReadiness(await window.studio.getReleaseReadiness(created.id));
    return created;
  }

  async function saveRelease() {
    setReleaseSaveFailed(false);
    const editing = Boolean(activeReleaseId);
    setSaveMessage(editing ? "Saving changes..." : "Creating release...");
    try {
      await persistRelease();
      setSaveMessage(editing ? "Release changes saved locally" : "Release created locally");
      playInterfaceSound("success");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save release");
      setReleaseSaveFailed(true);
      playInterfaceSound("error");
    }
  }

  async function changeDraftStatus(draftId: string, status: DraftStatus) {
    if (!window.studio) return;
    try {
      const updated = await window.studio.updateDraftStatus(draftId, status);
      setDrafts((current) => current.map((draft) => draft.id === updated.id ? updated : draft));
      setReleaseReadiness(await window.studio.getReleaseReadiness(updated.releaseId));
    } catch (error) {
      setGenerationState("error");
      setGenerationMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not update draft");
    }
  }

  async function deleteDraft(draftId: string) {
    if (!window.studio) return;
    if (!window.confirm("Delete this campaign draft? This cannot be undone.")) return;
    try {
      const draft = drafts.find((item) => item.id === draftId);
      await window.studio.deleteDraft(draftId);
      setDrafts(await window.studio.listDrafts());
      if (draft) setReleaseReadiness(await window.studio.getReleaseReadiness(draft.releaseId));
      setDraftDeleteMessage("Draft deleted.");
      playInterfaceSound("success");
    } catch (error) {
      setDraftDeleteMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not delete draft");
      playInterfaceSound("error");
    }
  }

  async function deleteCampaignPackItem(itemId: string) {
    if (!window.studio) return;
    if (!window.confirm("Delete this promotion format? This cannot be undone.")) return;
    try {
      await window.studio.deleteCampaignPackItem(itemId);
      if (activeReleaseId) setCampaignPackItems(await window.studio.listCampaignPackItems(activeReleaseId));
      setCampaignPackMessage("Promotion format deleted.");
      playInterfaceSound("success");
    } catch (error) {
      setCampaignPackMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not delete promotion format");
      playInterfaceSound("error");
    }
  }

  async function selectRelease(release: ReleaseSummary) {
    setActiveReleaseId(release.id);
    setSelectedArtist(release.artistId);
    setTitle(release.title);
    setStory(release.story);
    setReleaseDate(release.releaseDate ?? "");
    setPrimaryGenre(release.primaryGenre);
    setReleaseStatus(release.status);
    const releaseAssets = window.studio ? await window.studio.listAssets(release.id) : [];
    setAssets(releaseAssets);
    if (window.studio) {
      setReleaseReadiness(await window.studio.getReleaseReadiness(release.id));
      const analyses = await Promise.all(releaseAssets.filter((asset) => asset.kind === "audio").map(async (asset) => [asset.id, await window.studio!.getAudioAnalysis(asset.id)] as const));
      setAudioAnalyses(Object.fromEntries(analyses.filter((entry): entry is readonly [string, AudioAnalysisSummary] => entry[1] !== null)));
    }
    setAssetMessage(`Active release: ${release.title}`);
  }

  async function attachAsset(kind: AssetKind) {
    if (!window.studio) return;
    if (!activeReleaseId) {
      setAssetMessage("Create the release first. Media cannot be attached to an unsaved release.");
      return;
    }
    setAssetMessage(kind === "audio" ? "Choose the source audio file..." : "Choose the cover artwork...");
    try {
      const release = releases.find((item) => item.id === activeReleaseId);
      if (!release) throw new Error("Saved release not found");
      const asset = await window.studio.selectAndAttachAsset(activeReleaseId, kind);
      if (!asset) {
        setAssetMessage("File selection cancelled");
        return;
      }
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id && item.kind !== kind)]);
      setReleaseReadiness(await window.studio.getReleaseReadiness(release.id));
      setAssetMessage(`${asset.fileName} attached to ${release.title}`);
      playInterfaceSound("success");
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not attach file");
    }
  }

  function formatBytes(value: number): string {
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function analyzeAsset(assetId: string) {
    if (!window.studio) return;
    setAnalyzingAssetId(assetId);
    setAssetMessage("Analyzing audio locally...");
    try {
      const analysis = await window.studio.analyzeAudio(assetId);
      setAudioAnalyses((current) => ({ ...current, [assetId]: analysis }));
      if (activeReleaseId) setReleaseReadiness(await window.studio.getReleaseReadiness(activeReleaseId));
      setAssetMessage(analysis.status === "complete" ? "Audio analysis completed" : "Basic WAV analysis completed");
      playInterfaceSound("completion");
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Audio analysis failed");
    } finally {
      setAnalyzingAssetId(null);
    }
  }

  async function detachAsset(assetId: string) {
    if (!window.studio || !activeReleaseId) return;
    setAssetMessage("Removing media reference...");
    try {
      await window.studio.detachAsset(assetId);
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
      setAudioAnalyses((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
      setReleaseReadiness(await window.studio.getReleaseReadiness(activeReleaseId));
      setAssetMessage("Media reference removed; the original file was not deleted");
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not remove media reference");
    }
  }

  async function deleteRelease(release: ReleaseSummary) {
    if (!window.studio) return;
    const confirmed = window.confirm(`Delete "${release.title}" and its saved drafts, analyses and media references? Original media files will remain on disk.`);
    if (!confirmed) return;
    try {
      await window.studio.deleteRelease(release.id);
      const remaining = releases.filter((item) => item.id !== release.id);
      setReleases(remaining);
      setDrafts((current) => current.filter((draft) => draft.releaseId !== release.id));
      setTasks((current) => current.filter((task) => task.releaseId !== release.id));
      if (remaining[0]) await selectRelease(remaining[0]);
      else startNewRelease();
      setSaveMessage("Release deleted. Original media files were not removed.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not delete release");
    }
  }

  async function createTask() {
    if (!window.studio || !activeReleaseId) {
      setTaskMessage("Select and save a release before creating a task.");
      return;
    }
    setTaskMessage("Saving task...");
    try {
      const task = await window.studio.createTask({ releaseId: activeReleaseId, title: taskTitle, priority: taskPriority, assignee: taskAssignee, dueAt: taskDueAt || null });
      setTasks((current) => [task, ...current]);
      setTaskTitle(""); setTaskDueAt("");
      setTaskMessage("Task saved");
    } catch (error) { setTaskMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not create task"); }
  }

  async function changeTaskStatus(taskId: string, status: TaskStatus) {
    if (!window.studio) return;
    try {
      const updated = await window.studio.updateTaskStatus(taskId, status);
      setTasks((current) => current.map((task) => task.id === updated.id ? updated : task));
    } catch (error) { setTaskMessage(error instanceof Error ? error.message : "Could not update task"); }
  }

  async function runTaskAgent(taskId: string) {
    if (!window.studio || !aiSettings.model) {
      setTaskMessage("Select a local Ollama model in AI Studio first.");
      return;
    }
    setRunningTaskId(taskId); setTaskMessage("Local agent is working...");
    try {
      const updated = await window.studio.runTaskAgent(taskId, aiSettings.model);
      setTasks((current) => current.map((task) => task.id === updated.id ? updated : task));
      setTaskMessage("Agent result saved for human review");
    } catch (error) { setTaskMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Agent task failed"); }
    finally { setRunningTaskId(null); }
  }

  function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${Math.round(seconds % 60).toString().padStart(2, "0")}`;
  }

  function nextDraftActions(status: DraftStatus): DraftStatus[] {
    if (status === "draft") return ["approved", "rejected"];
    if (status === "approved") return ["draft", "scheduled"];
    if (status === "scheduled") return ["approved", "published"];
    if (status === "rejected") return ["draft"];
    return [];
  }

  const fallbackDraft = `${artist.name} presents ${title}.\n\n${story}\n\nA ${primaryGenre} transmission shaped for listeners who want more than background music.`;
  const draft = generatedDraft?.content ?? fallbackDraft;
  const currentRelease = releases.find((release) => release.id === activeReleaseId) ?? releases[0];
  const [playerSource, setPlayerSource] = useState<string | undefined>(undefined);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const featuredAudioSource = (() => {
    if (!currentRelease) return undefined;
    const audioAsset = assets.find((a) => a.releaseId === currentRelease.id && a.kind === "audio");
    return audioAsset ? playbackUrls[audioAsset.id] : undefined;
  })();
  function playFeaturedRelease() {
    if (featuredAudioSource === playerSource && playerPlaying) {
      setPlayerPlaying(false);
    } else {
      setPlayerSource(featuredAudioSource);
      setPlayerPlaying(true);
    }
  }
  const persistedStatus = releases.find((release) => release.id === activeReleaseId)?.status ?? "draft";
  const allowedReleaseStatuses: Record<ReleaseStatus, ReleaseStatus[]> = {
    draft: ["draft", "planned"], planned: ["draft", "planned", "scheduled"],
    scheduled: ["planned", "scheduled", "published"], published: ["published", "archived"], archived: ["draft", "archived"]
  };
  const visibleSoundCloudTracks = soundCloudTracks.filter((track) => {
    const matchesQuery = !catalogQuery.trim() || `${track.title} ${track.genre ?? ""} ${track.tagList ?? ""}`.toLowerCase().includes(catalogQuery.trim().toLowerCase());
    const matchesStatus = catalogStatusFilter === "all" || track.catalogStatus === catalogStatusFilter;
    const matchesArtist = catalogArtistFilter === "all" || (catalogArtistFilter === "unassigned" ? !track.artistId : track.artistId === catalogArtistFilter);
    return matchesQuery && matchesStatus && matchesArtist;
  }).sort((a, b) => catalogSort === "plays" ? (b.playbackCount ?? 0) - (a.playbackCount ?? 0) : catalogSort === "likes" ? (b.likesCount ?? 0) - (a.likesCount ?? 0) : catalogSort === "engagement" ? b.engagementScore - a.engagementScore : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const soundCloudTotals = soundCloudTracks.reduce((totals, track) => ({ plays: totals.plays + (track.playbackCount ?? 0), likes: totals.likes + (track.likesCount ?? 0), comments: totals.comments + (track.commentCount ?? 0), reposts: totals.reposts + (track.repostsCount ?? 0), bootlegs: totals.bootlegs + (track.contentType === "bootleg" ? 1 : 0), gems: totals.gems + (track.catalogStatus === "gem" ? 1 : 0) }), { plays: 0, likes: 0, comments: 0, reposts: 0, bootlegs: 0, gems: 0 });
  const analyticsTracks=soundCloudTracks.filter((track)=>analyticsArtist==="all"||track.artistId===analyticsArtist);
  const analyticsReleases=releases.filter((release)=>analyticsArtist==="all"||release.artistId===analyticsArtist);
  const analyticsSpotify=spotifyReleases.filter((release)=>analyticsArtist==="all"||release.artistId===analyticsArtist);
  const analyticsQueue=publishingQueue.filter((item)=>analyticsArtist==="all"||analyticsReleases.some((release)=>release.id===item.releaseId));
  const analyticsTotals=analyticsTracks.reduce((total,track)=>{const window=analyticsPerformance[track.id]?.windows.find((item)=>item.days===analyticsPeriod);return{plays:total.plays+(track.playbackCount??0),likes:total.likes+(track.likesCount??0),comments:total.comments+(track.commentCount??0),reposts:total.reposts+(track.repostsCount??0),playsDelta:total.playsDelta+(window?.playsDelta??0),tracked:total.tracked+(window?.available?1:0)};},{plays:0,likes:0,comments:0,reposts:0,playsDelta:0,tracked:0});
  const analyticsRanked=[...analyticsTracks].sort((a,b)=>b.engagementScore-a.engagementScore||(b.playbackCount??0)-(a.playbackCount??0)).slice(0,10);
  const analyticsContentTypes=(["original","bootleg","official-remix","edit","dj-set"] as SoundCloudContentType[]).map((type)=>({type,count:analyticsTracks.filter((track)=>track.contentType===type).length}));
  const analyticsCatalogStatuses=(["unreviewed","release","gem","archive","exclude"] as SoundCloudCatalogStatus[]).map((status)=>({status,count:analyticsTracks.filter((track)=>track.catalogStatus===status).length}));
  const averageReadiness=analyticsReleases.length?Math.round(analyticsReleases.reduce((sum,release)=>sum+(analyticsReadiness[release.id]?.score??0),0)/analyticsReleases.length):0;
  const visibleContacts=contacts.filter((contact)=>(contactStatusFilter==="all"||contact.relationshipStatus===contactStatusFilter)&&(!contactQuery.trim()||`${contact.name} ${contact.organization??""} ${contact.email??""} ${contact.socialHandle??""}`.toLowerCase().includes(contactQuery.trim().toLowerCase())));
  const selectedContact=contacts.find((contact)=>contact.id===contactDraft.id);

  function openReleaseWorkspace(release?: ReleaseSummary) {
    if (release) void selectRelease(release);
    setActiveView("releases");
  }

  function startNewRelease() {
    setActiveReleaseId(null);
    setTitle("");
    setStory("");
    setReleaseDate("");
    setPrimaryGenre(artist.genres[0]);
    setReleaseStatus("draft");
    setAssets([]);
    setAudioAnalyses({});
    setReleaseReadiness(null);
    setSaveMessage("");
    setAssetMessage("");
    setActiveView("releases");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><img src={studioManagerLogo} alt="AI Studio Manager" /></div>
        <nav>{navigation.map((item, index) => <button className={item.id === activeView ? "active" : ""} key={`${item.label}-${index}`} onClick={() => item.id !== "placeholder" && setActiveView(item.id)}><span>{item.icon}</span>{item.label}{item.label === "AI Studio" && <b>AI</b>}</button>)}</nav>
        <div className="nav-divider" />
        <nav className="secondary-nav"><button className={activeView === "settings" ? "active" : ""} onClick={()=>setActiveView("settings")}><span>⚙</span>Settings</button></nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-health"><span className={`dot ${status?.ollama.available && database?.ready ? "online" : ""}`} /><span>{status?.ollama.available && database?.ready ? "Local systems ready" : "Connecting local systems"}</span></div>
        <div className="user-card"><span className="avatar">A</span><div><strong>Arkadiusz</strong><small>Independent artist</small></div><b>•••</b></div>
      </aside>

      <main className="app-main">
        <div className="topbar"><div className="search">⌕<span>Search releases, tracks, tasks...</span><kbd>⌘ K</kbd></div><div className="top-actions"><span><i className={`dot ${status?.ollama.available && database?.ready ? "online" : ""}`} />{status?.ollama.available && database?.ready ? "All systems synced" : "Systems starting"}</span><button className="icon-button">♧</button><button className="primary" onClick={startNewRelease}>+ New release</button></div></div>
        {bridgeError && <div className="bridge-error">{bridgeError}</div>}
        {activeView === "overview" && <Dashboard
          releases={releases}
          tasks={tasks}
          assets={assets}
          featuredRelease={currentRelease}
          releaseReadiness={releaseReadiness}
          queue={publishingQueue} events={dashboardEvents} meta={meta} soundCloud={soundCloud} spotify={spotify} youTube={youTube} youTubeData={youTubeChannelData} youTubeAnalytics={youTubeAnalytics} youTubeAnalyticsRange={youTubeAnalyticsRange} system={status} database={database}
          soundCloudTracks={soundCloudTracks}
          mediaGenerations={mediaGenerations}
          campaignPackItems={campaignPackItems}
          onCreateRelease={startNewRelease}
          onOpenRelease={() => openReleaseWorkspace(currentRelease)}
          onOpenTasks={() => setActiveView("calendar")}
          onOpenCalendar={() => setActiveView("calendar")}
          playerPlaying={playerPlaying}
          onPlayFeatured={playFeaturedRelease}
          featuredAudioSource={featuredAudioSource}
        />}

        {activeView === "ai-studio" && <ConversationWorkspace release={currentRelease} artistId={selectedArtist} artistName={artist.name} status={status} activeModel={aiSettings.model} onModelChange={(model) => void updateAiSettings({ ...aiSettings, model })} onOpenRelease={() => openReleaseWorkspace(currentRelease)} />}

        {activeView==="analytics"&&<div className="page-content analytics-page">
          <header><div><span className="eyebrow">Analytics Dashboard V1</span><h1>Catalog intelligence.</h1><p>Real SoundCloud snapshots, Spotify catalog data and local campaign progress. No estimated stream counts.</p></div><div className="analytics-filters"><label>Artist alias<select value={analyticsArtist} onChange={(event)=>setAnalyticsArtist(event.target.value as ArtistAlias|"all")}><option value="all">All aliases</option>{artists.map((profile)=><option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label><label>Trend window<select value={analyticsPeriod} onChange={(event)=>setAnalyticsPeriod(Number(event.target.value) as 7|30|90)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></div></header>
          {analyticsMessage&&<p className="analytics-note">{analyticsMessage}</p>}
          <div className="analytics-kpis"><article><span>SoundCloud plays</span><b>{analyticsTotals.plays.toLocaleString()}</b><em>{analyticsTotals.tracked?`${analyticsTotals.playsDelta>=0?"+":""}${analyticsTotals.playsDelta.toLocaleString()} in ${analyticsPeriod}d`:"collecting snapshots"}</em></article><article><span>Interactions</span><b>{(analyticsTotals.likes+analyticsTotals.comments+analyticsTotals.reposts).toLocaleString()}</b><small>{analyticsTotals.likes.toLocaleString()} likes</small></article><article><span>Imported tracks</span><b>{analyticsTracks.length}</b><small>{analyticsTracks.filter((track)=>track.artistId).length} assigned</small></article><article><span>Spotify releases</span><b>{analyticsSpotify.length}</b><small>catalog entries only</small></article><article><span>Release readiness</span><b>{averageReadiness}%</b><small>{analyticsReleases.length} local releases</small></article><article><span>Campaign posts</span><b>{analyticsQueue.length}</b><small>{analyticsQueue.filter((item)=>item.status==="scheduled").length} scheduled · {analyticsQueue.filter((item)=>item.status==="published").length} published</small></article></div>
          <div className="analytics-grid">
            <section className="panel analytics-panel"><span className="eyebrow">Performance ranking</span><h2>Tracks worth your attention</h2>{analyticsRanked.length?<div className="analytics-ranking">{analyticsRanked.map((track,index)=>{const window=analyticsPerformance[track.id]?.windows.find((item)=>item.days===analyticsPeriod);return <article key={track.id}><span>{index+1}</span><div><strong>{track.title}</strong><small>{artists.find((profile)=>profile.id===track.artistId)?.name??"Unassigned"} · {track.contentType} · {track.catalogStatus}</small></div><b>{(track.playbackCount??0).toLocaleString()}<small>plays</small></b><b>{track.engagementRate===null?"—":`${track.engagementRate}%`}<small>engagement</small></b><b>{window?.available?`${(window.playsDelta??0)>=0?"+":""}${window.playsDelta}`:"—"}<small>{analyticsPeriod}d plays</small></b></article>})}</div>:<div className="analytics-empty">No SoundCloud tracks match this alias.</div>}</section>
            <section className="panel analytics-panel"><span className="eyebrow">Catalog structure</span><h2>Rights and classification</h2><div className="analytics-bars">{analyticsContentTypes.map((item)=><div key={item.type}><div className="analytics-bar-head"><span>{item.type.replace("official-remix","official remix")}</span><b>{item.count}</b></div><div className="analytics-bar-track"><i style={{width:`${analyticsTracks.length?item.count/analyticsTracks.length*100:0}%`}}/></div></div>)}</div><h2>Editorial status</h2><div className="analytics-bars">{analyticsCatalogStatuses.map((item)=><div key={item.status}><div className="analytics-bar-head"><span>{item.status}</span><b>{item.count}</b></div><div className="analytics-bar-track"><i style={{width:`${analyticsTracks.length?item.count/analyticsTracks.length*100:0}%`}}/></div></div>)}</div></section>
            <section className="panel analytics-panel analytics-readiness"><span className="eyebrow">Release operations</span><h2>Readiness and next blockers</h2>{analyticsReleases.length?<div className="analytics-readiness-list">{analyticsReleases.map((release)=>{const readiness=analyticsReadiness[release.id];const score=readiness?.score??0;return <article key={release.id} onClick={()=>openReleaseWorkspace(release)}><div><strong>{release.title}</strong><span>{score}%</span></div><p>{release.artistName} · {release.status} · {readiness?.missing[0]??"Ready for campaign"}</p><div className="analytics-progress"><i style={{width:`${score}%`}}/></div></article>})}</div>:<div className="analytics-empty">No local releases for this alias.</div>}</section>
          </div>
          <div className="analytics-post-publish-spacer"><PostPublishAnalytics publishingQueue={publishingQueue} /></div>
        </div>}

        {activeView==="publishing"&&<div className="page-content"><PublishingPage onNavigate={(v)=>setActiveView(v as AppView)} /></div>}

        {activeView==="contacts"&&<div className="page-content crm-page"><header><div><span className="eyebrow">Contacts & CRM V1</span><h1>Relationships move releases forward.</h1><p>Local contact database for collaborators, labels, promoters, press and playlist curators.</p></div></header><div className="crm-toolbar"><input placeholder="Search name, organization, email or handle..." value={contactQuery} onChange={(event)=>setContactQuery(event.target.value)}/><select value={contactStatusFilter} onChange={(event)=>setContactStatusFilter(event.target.value as ContactRelationshipStatus|"all")}><option value="all">All relationship statuses</option>{(["new","to-contact","contacted","conversation","collaboration","declined","inactive"] as ContactRelationshipStatus[]).map((status)=><option key={status}>{status}</option>)}</select><button className="primary" onClick={()=>{setContactDraft(emptyContact);setInteractionSummary("");setContactMessage("");}}>+ New contact</button></div><div className="crm-layout"><section className="panel crm-list">{visibleContacts.map((contact)=><article className={contactDraft.id===contact.id?"selected":""} key={contact.id} onClick={()=>editContact(contact)}><div><strong>{contact.name}</strong><span>{contact.relationshipStatus}</span></div><p>{contact.organization||contact.contactType} · {contact.artistName??"All aliases"}</p><small>{contact.email||contact.socialHandle||contact.phone||"No contact channel entered"}</small>{contact.nextFollowUpAt&&<em>FOLLOW UP · {new Date(contact.nextFollowUpAt).toLocaleString()}</em>}</article>)}{visibleContacts.length===0&&<div className="analytics-empty">No contacts match this filter.</div>}</section><section className="panel crm-editor"><div className="crm-editor-heading"><div><span className="eyebrow">{contactDraft.id?"Edit relationship":"New relationship"}</span><h2>{contactDraft.name||"Contact details"}</h2></div>{contactDraft.id&&<button className="danger-button" onClick={()=>void removeContact(contactDraft.id!)}>Delete</button>}</div><div className="crm-form-grid"><label>Name<input value={contactDraft.name} onChange={(event)=>setContactDraft({...contactDraft,name:event.target.value})}/></label><label>Organization<input value={contactDraft.organization} onChange={(event)=>setContactDraft({...contactDraft,organization:event.target.value})}/></label><label>Contact type<select value={contactDraft.contactType} onChange={(event)=>setContactDraft({...contactDraft,contactType:event.target.value as ContactType})}>{(["artist","vocalist","producer","label","promoter","playlist-curator","press","other"] as ContactType[]).map((type)=><option key={type}>{type}</option>)}</select></label><label>Relationship status<select value={contactDraft.relationshipStatus} onChange={(event)=>setContactDraft({...contactDraft,relationshipStatus:event.target.value as ContactRelationshipStatus})}>{(["new","to-contact","contacted","conversation","collaboration","declined","inactive"] as ContactRelationshipStatus[]).map((status)=><option key={status}>{status}</option>)}</select></label><label>Artist alias<select value={contactDraft.artistId??""} onChange={(event)=>setContactDraft({...contactDraft,artistId:(event.target.value||null) as ArtistAlias|null,releaseId:null})}><option value="">All / unassigned</option>{artists.map((profile)=><option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label><label>Related release<select value={contactDraft.releaseId??""} onChange={(event)=>setContactDraft({...contactDraft,releaseId:event.target.value||null})}><option value="">No release</option>{releases.filter((release)=>!contactDraft.artistId||release.artistId===contactDraft.artistId).map((release)=><option value={release.id} key={release.id}>{release.title} · {release.artistName}</option>)}</select></label><label>Email<input type="email" value={contactDraft.email} onChange={(event)=>setContactDraft({...contactDraft,email:event.target.value})}/></label><label>Phone<input value={contactDraft.phone} onChange={(event)=>setContactDraft({...contactDraft,phone:event.target.value})}/></label><label>Website<input value={contactDraft.website} onChange={(event)=>setContactDraft({...contactDraft,website:event.target.value})}/></label><label>Social handle<input value={contactDraft.socialHandle} onChange={(event)=>setContactDraft({...contactDraft,socialHandle:event.target.value})}/></label><label>Preferred channel<select value={contactDraft.preferredChannel} onChange={(event)=>setContactDraft({...contactDraft,preferredChannel:event.target.value as ContactChannel})}>{(["email","instagram","tiktok","soundcloud","phone","other"] as ContactChannel[]).map((channel)=><option key={channel}>{channel}</option>)}</select></label><label>Next follow-up<input type="datetime-local" value={contactDraft.nextFollowUpAt?.slice(0,16)??""} onChange={(event)=>setContactDraft({...contactDraft,nextFollowUpAt:event.target.value||null,createFollowUpTask:event.target.value?contactDraft.createFollowUpTask:false})}/></label><label className="crm-consent"><input type="checkbox" checked={contactDraft.consent} onChange={(event)=>setContactDraft({...contactDraft,consent:event.target.checked})}/> Consent to continued contact recorded</label><label className="crm-consent"><input type="checkbox" disabled={!contactDraft.nextFollowUpAt||!contactDraft.releaseId} checked={Boolean(contactDraft.createFollowUpTask)} onChange={(event)=>setContactDraft({...contactDraft,createFollowUpTask:event.target.checked})}/> Create task for this follow-up</label><label className="wide">Notes<textarea rows={4} value={contactDraft.notes} onChange={(event)=>setContactDraft({...contactDraft,notes:event.target.value})}/></label></div><div className="crm-actions"><p>{contactMessage||"Information stays in the local SQLite database."}</p><button className="primary" disabled={!contactDraft.name.trim()} onClick={()=>void saveContact()}>Save contact</button></div>{contactDraft.id&&<><div className="interaction-editor"><select value={interactionDirection} onChange={(event)=>setInteractionDirection(event.target.value as typeof interactionDirection)}><option value="note">Internal note</option><option value="outbound">Outgoing</option><option value="inbound">Incoming</option></select><select value={interactionChannel} onChange={(event)=>setInteractionChannel(event.target.value as typeof interactionChannel)}>{(["email","instagram","tiktok","soundcloud","phone","meeting","other"] as const).map((channel)=><option key={channel}>{channel}</option>)}</select><input placeholder="What happened?" value={interactionSummary} onChange={(event)=>setInteractionSummary(event.target.value)}/><button disabled={!interactionSummary.trim()} onClick={()=>void addContactInteraction()}>Add history</button></div><div className="interaction-history">{selectedContact?.interactions.map((interaction)=><article key={interaction.id}><div><strong>{interaction.direction.toUpperCase()} · {interaction.channel}</strong><small>{new Date(interaction.occurredAt).toLocaleString()}</small></div><p>{interaction.summary}</p></article>)}{selectedContact?.interactions.length===0&&<div className="analytics-empty">No interaction history yet.</div>}</div></>}</section></div></div>}

        {activeView === "calendar" && <div className="page-content tasks-page"><ContentCalendar /><section className="panel meta-publish-control"><div><span className="eyebrow">Meta Publishing V1</span><h3>Publish an approved queue item.</h3><p>Facebook supports text and local images. Instagram images use the temporary Secure Media Bridge.</p></div><select value={metaQueueItemId} onChange={(event)=>{setMetaQueueItemId(event.target.value);setMetaDestinationByItem((current)=>({...current,[event.target.value]:""}));}}><option value="">Select Facebook or Instagram queue item</option>{publishingQueue.filter((item)=>["Facebook","Instagram"].includes(item.platform)&&["approved","scheduled","failed"].includes(item.status)).map((item)=><option value={item.id} key={item.id}>{item.platform} · {item.releaseTitle} · {item.status}</option>)}</select><select disabled={!metaQueueItemId} value={metaDestinationByItem[metaQueueItemId]??""} onChange={(event)=>setMetaDestinationByItem((current)=>({...current,[metaQueueItemId]:event.target.value}))}><option value="">Select destination</option>{meta?.destinations.filter((destination)=>destination.platform===publishingQueue.find((item)=>item.id===metaQueueItemId)?.platform).map((destination)=><option value={destination.id} key={destination.id}>{destination.username?`@${destination.username}`:destination.name}</option>)}</select><button className="primary" disabled={!meta?.connected||!metaQueueItemId||!metaDestinationByItem[metaQueueItemId]} onClick={()=>void publishMetaItem(metaQueueItemId)}>Publish now</button></section>
          <header><div><span className="eyebrow">Tasks, Calendar & Agents</span><h1>Plan the release work.</h1><p>Human decisions, local AI assistance and automatic readiness checks in one queue.</p></div></header>
          <section className="task-creator panel"><input placeholder="New task title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /><select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select><select value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value as TaskAssignee)}><option value="human">Human</option><option value="ai">AI Agent</option><option value="automatic">Automatic</option></select><input type="date" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /><button className="primary" disabled={!taskTitle.trim() || !activeReleaseId} onClick={() => void createTask()}>Add task</button></section>
          {taskMessage && <p className="task-message">{taskMessage}</p>}
          <div className="task-board">
            {(["doing","todo","done"] as TaskStatus[]).map((column) => <section className="task-column" key={column}><div className="task-column-title"><strong>{column === "doing" ? "In progress" : column === "todo" ? "To do" : "Done"}</strong><span>{tasks.filter((task) => task.status === column).length}</span></div>{tasks.filter((task) => task.status === column).map((task) => <article className={`managed-task priority-${task.priority}`} key={task.id}><div className="managed-task-meta"><span>{task.assignee === "ai" ? "✦ AI AGENT" : task.assignee === "automatic" ? "⚙ AUTOMATIC" : "● HUMAN"}</span><b>{task.priority}</b></div><h3>{task.title}</h3><p>{task.releaseTitle ?? "No release"}{task.dueAt ? ` · due ${task.dueAt}` : ""}</p>{task.agentOutput && <div className="agent-output"><strong>Agent result · {task.model}</strong><p>{task.agentOutput}</p><small>Human review required</small></div>}<div className="managed-task-actions">{column !== "doing" && column !== "done" && <button onClick={() => void changeTaskStatus(task.id, "doing")}>Start</button>}{column !== "done" && <button onClick={() => void changeTaskStatus(task.id, "done")}>Done</button>}{column === "done" && <button onClick={() => void changeTaskStatus(task.id, "todo")}>Reopen</button>}{task.assignee === "ai" && column !== "done" && <button className="agent-button" disabled={runningTaskId === task.id} onClick={() => void runTaskAgent(task.id)}>{runningTaskId === task.id ? "Working..." : "Run agent"}</button>}</div></article>)}</section>)}
          </div>
          <section className="publishing-section panel"><div className="publishing-heading"><div><span className="eyebrow">Publishing Queue V1</span><h2>Build and schedule campaign posts.</h2><p>Only approved captions and media can enter the queue. Export creates a ready-to-post local folder.</p></div><div className="publishing-metrics"><span><b>{publishingQueue.filter((item)=>item.status==="publishing").length}</b> publishing</span><span><b>{publishingQueue.filter((item)=>item.status==="scheduled").length}</b> scheduled</span><span><b>{publishingQueue.filter((item)=>item.status==="published").length}</b> published</span></div></div><div className="publishing-canonical-notice"><strong>New queue drafts start in Content Calendar.</strong><span>Set approved promo content to READY, then send that ScheduleEvent to the Publishing Queue.</span></div>{publishingMessage&&<p className="task-message">{publishingMessage}</p>}<label className="publishing-review-reason">Review reason (optional)<input value={publishingReviewReason} onChange={(event)=>setPublishingReviewReason(event.target.value)} placeholder="Context for approval or rejection"/></label><div className="campaign-calendar">{publishingQueue.map((item)=><article className={`publishing-${item.status}`} key={item.id}><div className="publishing-date"><b>{item.scheduledAt?new Date(item.scheduledAt).toLocaleDateString(undefined,{day:"2-digit",month:"short"}):"NO DATE"}</b><span>{item.scheduledAt?new Date(item.scheduledAt).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}):"Draft"}</span></div><div className="publishing-content"><div><strong>{item.platform} · {item.releaseTitle}</strong><b className={`status-${item.status}`}>{item.status==="failed"?"rejected":item.status}</b></div><p>{item.caption}</p><small>{item.mediaType?`${item.mediaProvider} ${item.mediaType}`:"Text only"}{item.sourceScheduleEventId?` · ScheduleEvent ${item.sourceScheduleEventId.slice(0,8)}`:" · no ScheduleEvent source"}{item.exportedAt?` · exported ${new Date(item.exportedAt).toLocaleDateString()}`:""}</small>{item.mediaGenerationId&&mediaUrls[item.mediaGenerationId]&&item.mediaType==="image"&&<img className="publishing-media-preview" src={mediaUrls[item.mediaGenerationId]} alt="Queue media preview"/>}{item.reviewedAt&&<small>Review: {item.reviewedBy??"local-user"} · {new Date(item.reviewedAt).toLocaleString()}{item.reviewReason?` · ${item.reviewReason}`:""}</small>}{item.rightsBlocked&&<em>BOOTLEG RIGHTS NOT CLEARED · SOUNDCLOUD/YOUTUBE BLOCKED</em>}</div><div className="publishing-actions">{item.status==="draft"&&<><button onClick={()=>beginPublishingEdit(item)}>Edit</button><button onClick={()=>void reviewPublishingItem(item.id,"APPROVE")}>Approve</button><button className="danger-button" onClick={()=>void reviewPublishingItem(item.id,"REJECT")}>Reject</button></>}{item.status==="approved"&&<><button onClick={()=>void reviewPublishingItem(item.id,"RETURN_TO_DRAFT")}>Return to Draft</button><button disabled={!item.scheduledAt} onClick={()=>void reviewPublishingItem(item.id,"SCHEDULE")}>Schedule</button></>}{item.status==="failed"&&<button onClick={()=>void reviewPublishingItem(item.id,"RETURN_TO_DRAFT")}>Return to Draft</button>}{["approved","scheduled","published"].includes(item.status)&&<button className="export-button" onClick={()=>void exportPublishingPack(item.id)}>Export Pack</button>}</div>{publishingEditId===item.id&&<div className="publishing-edit"><label>Caption<textarea value={publishingEditCaption} onChange={(event)=>setPublishingEditCaption(event.target.value)}/></label><label>Scheduled time<input type="datetime-local" value={publishingEditDate} onChange={(event)=>setPublishingEditDate(event.target.value)}/></label><button className="primary" onClick={()=>void savePublishingEdit(item.id)}>Save Draft</button><button onClick={()=>setPublishingEditId(null)}>Cancel</button></div>}</article>)}{publishingQueue.length===0&&<div className="publishing-empty">No campaign posts queued yet. Approve a caption in AI Studio, then create the first publishing draft.</div>}</div></section>
        </div>}

        {activeView==="settings"&&<SettingsPage status={status} onNavigate={(v)=>setActiveView(v as AppView)} />}


        {activeView === "releases" && <div className={`page-content release-page release-page-v3 ${releaseWorkspaceTab === "foundation" ? "release-page-v31" : ""}`}>
        <header>
          <div><span className="eyebrow">Release Manager</span><h1>Build the next release.</h1></div>
          <div className="header-actions">{activeReleaseId && currentRelease && <Button variant="ghost" className="release-delete-action" onClick={() => void deleteRelease(currentRelease)}>Delete release</Button>}<Button onClick={saveRelease}>{activeReleaseId ? "Save changes" : "Create release"}</Button></div>
        </header>
        <section className="artist-strip">
          {artists.map((profile) => (
            <button className={profile.id === selectedArtist ? "selected" : ""} key={profile.id} onClick={() => { setSelectedArtist(profile.id); setPrimaryGenre(profile.genres[0]); }}>
              <strong>{profile.name}</strong><span>{profile.genres.slice(0, 2).join(" · ")}</span>
            </button>
          ))}
        </section>
        <Tabs className="release-workspace-tabs" ariaLabel="Release workspace sections" activeTab={releaseWorkspaceTab} onChange={setReleaseWorkspaceTab} tabs={[{ id: "foundation", label: "Release Foundation" }, { id: "campaign-drafts", label: "Campaign Drafts" }, { id: "release-plan", label: "Release Plan" }, { id: "promotion-formats", label: "Promotion Formats" }]} />
        <div className={`release-workspace-view release-workspace-${releaseWorkspaceTab}`}>
        <div className="workspace">
          {releaseWorkspaceTab === "foundation" && <ReleaseFoundation key={activeReleaseId ?? "new"} releaseId={activeReleaseId} title={title} artist={artist.name} genre={primaryGenre} date={releaseDate} story={story} status={releaseStatus}
            allowedStatuses={activeReleaseId ? allowedReleaseStatuses[persistedStatus] : ["draft"]} assets={assets} readiness={releaseReadiness}
            saveMessage={saveMessage} saveError={releaseSaveFailed} assetMessage={assetMessage} analyzing={Boolean(analyzingAssetId)}
            onTitle={setTitle} onGenre={setPrimaryGenre} onDate={setReleaseDate} onStory={setStory} onStatus={setReleaseStatus}
            onSave={() => void saveRelease()} onAttach={(kind) => void attachAsset(kind)} onNavigate={setReleaseWorkspaceTab}
            renderAsset={(asset) => {
              const analysis = audioAnalyses[asset.id];
              return <article key={asset.id}><b>{asset.kind}</b><div><div className="asset-title"><strong>{asset.fileName}</strong><button onClick={() => void detachAsset(asset.id)}>Detach</button></div><span>{formatBytes(asset.sizeBytes)} · {asset.mimeType ?? "unknown type"}{asset.width && asset.height ? ` · ${asset.width} × ${asset.height}px` : ""}</span><small title={asset.filePath}>{asset.filePath}</small>
                {asset.kind === "cover" && asset.width && asset.height && (asset.width !== asset.height || asset.width < 3000) && <small className="asset-warning">Cover recommendation: square artwork, at least 3000 × 3000 px.</small>}
                {asset.kind === "audio" && playbackUrls[asset.id] && <AudioPlayer source={playbackUrls[asset.id]} title={asset.fileName} />}
                {asset.kind === "audio" && <div className="analysis-row">{analysis ? <><span><b>{formatDuration(analysis.durationSeconds)}</b> duration</span><span><b>{(analysis.sampleRate / 1000).toFixed(1)} kHz</b> sample rate</span><span><b>{analysis.bitDepth ?? "—"} bit</b> depth</span><span><b>{analysis.integratedLufs ?? "—"} LUFS</b> loudness</span><span><b>{analysis.truePeakDbtp ?? "—"} dBTP</b> peak</span>{analysis.loudnessRangeLu !== null && <span><b>{analysis.loudnessRangeLu} LU</b> range</span>}<span className="musical-result"><b>{analysis.bpm ?? "—"} BPM</b>{analysis.bpmConfidence !== null ? `${analysis.bpmConfidence}% confidence` : "tempo unavailable"}{analysis.alternateBpm !== null && <small>alt. {analysis.alternateBpm}</small>}</span><span className="musical-result"><b>{analysis.musicalKey ?? "—"}</b>{analysis.keyConfidence !== null ? `${analysis.keyConfidence}% confidence` : "key unavailable"}{analysis.alternateKey && <small>alt. {analysis.alternateKey}</small>}</span></> : <span>No analysis saved</span>}<button disabled={analyzingAssetId === asset.id} onClick={() => void analyzeAsset(asset.id)}>{analyzingAssetId === asset.id ? "Analyzing..." : analysis ? "Analyze again" : "Analyze audio"}</button></div>}
                {analysis?.note && <small className="analysis-note">{analysis.note}</small>}
              </div></article>;
            }} />}

          <section className="panel output-panel">
            <div className="panel-heading"><span className="eyebrow">02 / Draft</span><h2>Campaign preview</h2></div>
            <div className="ai-controls">
              <label>Local model<select value={aiSettings.model ?? ""} onChange={(event) => void updateAiSettings({ ...aiSettings, model: event.target.value || null })}>
                {status?.ollama.models.length ? status.ollama.models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>) : <option value="">No models available</option>}
              </select></label>
              <label>Language<select value={aiSettings.language} onChange={(event) => void updateAiSettings({ ...aiSettings, language: event.target.value as AiSettings["language"] })}>
                <option value="en">English</option><option value="de">Deutsch</option><option value="pl">Polski</option>
              </select></label>
              <label>Channel<select value={aiSettings.channel} onChange={(event) => void updateAiSettings({ ...aiSettings, channel: event.target.value as AiSettings["channel"] })}>
                <option>Instagram</option><option>Facebook</option><option>TikTok</option><option>SoundCloud</option><option>YouTube</option>
              </select></label>
              <button className="generate-button" disabled={generationState === "generating" || !aiSettings.model} onClick={() => void generateWithOllama()}>{generationState === "generating" ? "Generating..." : "Generate with Ollama"}</button>
            </div>
            {generationMessage && <p className={`generation-message ${generationState === "error" ? "error" : ""}`}>{generationMessage}</p>}
            {generationState === "generating" && <p className="generation-hint">DeepSeek R1 14B may need extra time on its first run while the model loads into VRAM.</p>}
            <div className="draft"><span>{aiSettings.channel} · {aiSettings.language.toUpperCase()} {generatedDraft ? "· AI generated" : "· template preview"}</span><pre>{draft}</pre></div>
            <div className="release-list">
              <strong>Saved releases</strong>
              {releases.length === 0 ? <p>No releases saved yet.</p> : releases.slice(0, 6).map((release) => (
                <article className={activeReleaseId === release.id ? "active-release" : ""} key={release.id} onClick={() => void selectRelease(release)}><div><strong>{release.title}</strong><span>{release.artistName} · {release.primaryGenre}</span></div><div className="release-item-actions"><b>{activeReleaseId === release.id ? "ACTIVE" : release.status}</b><button title="Delete release" onClick={(event) => { event.stopPropagation(); void deleteRelease(release); }}>Delete</button></div></article>
              ))}
            </div>
            <div className="draft-workflow">
              <strong>Campaign drafts</strong>
              {draftDeleteMessage && <p className="task-message" role="status">{draftDeleteMessage}</p>}
              {drafts.length === 0 ? <p>No AI drafts saved yet.</p> : drafts.slice(0, 8).map((item) => (
                <article key={item.id}>
                  <div className="draft-summary"><strong>{item.channel} · {item.language.toUpperCase()}</strong><span>{item.releaseTitle} · {item.model}</span><p>{item.content}</p></div>
                  <div className="draft-actions"><b className={`status-${item.status}`}>{item.status}</b>{nextDraftActions(item.status).map((next) => <button key={next} onClick={() => void changeDraftStatus(item.id, next)}>{next}</button>)}<button className="danger-button" title="Delete" onClick={() => void deleteDraft(item.id)}>Delete</button></div>
                </article>
              ))}
            </div>
          </section>
        </div>
        {activeView === "releases" && currentRelease && <section className="panel release-plan-panel"><ReleasePlanPanel release={currentRelease} /></section>}
        {activeView === "releases" && <section className="panel campaign-pack-panel"><div className="campaign-pack-heading"><div><span className="eyebrow">Campaign Pack Generator V1</span><h2>One release. Every promotional format.</h2><p>Approve a media prompt first. ComfyUI starts automatically on demand; Kling CLI runs locally with no API credits.</p></div><button className="primary" disabled={campaignPackBusy||!activeReleaseId||!aiSettings.model} onClick={()=>void generateCampaignPack()}>{campaignPackBusy?"Generating pack...":`Generate ${aiSettings.language.toUpperCase()} pack`}</button></div>{(campaignPackMessage||mediaMessage)&&<p className="integration-message">{mediaMessage||campaignPackMessage}</p>}<div className="campaign-pack-grid">{campaignPackItems.map((item)=><article key={item.id}><div className="pack-item-head"><div><span>{item.kind.replaceAll("-"," ").toUpperCase()}</span><strong>{item.channel??"MEDIA GENERATION"} · {item.language.toUpperCase()}</strong></div><b className={`status-${item.status}`}>{item.status}</b></div><p>{item.content}</p><div className="pack-item-actions">{nextDraftActions(item.status).map((next)=><button key={next} onClick={()=>void changeCampaignPackStatus(item.id,next)}>{next}</button>)}<button className="danger-button" title="Delete" onClick={()=>void deleteCampaignPackItem(item.id)}>Delete</button>{item.status==="approved"&&item.kind==="image-prompt"&&<><button className="local-generate" disabled={mediaBusy===item.id||!mediaSettings.comfyUiCheckpoint} onClick={()=>void generateMedia(item,"comfyui","image")}>Generate locally · ComfyUI</button><button disabled={mediaBusy===item.id||!mediaSettings.openAiConfigured} onClick={()=>void generateMedia(item,"openai","image")}>OpenAI</button><button disabled={mediaBusy===item.id||!klingCliStatus?.available} onClick={()=>void generateMedia(item,"kling-cli","image")}>Kling CLI</button></>}{item.status==="approved"&&["visualizer-prompt","video-script"].includes(item.kind)&&<><button disabled={mediaBusy===item.id||!klingCliStatus?.available} onClick={()=>void generateMedia(item,"kling-cli","video")}>Generate video · Kling CLI</button></>}</div></article>)}</div>{mediaGenerations.length>0&&<div className="media-gallery"><div className="campaign-pack-heading"><div><span className="eyebrow">Results gallery</span><h2>Generated media.</h2></div></div><div className="media-gallery-grid">{mediaGenerations.map((media)=><article key={media.id}>{mediaUrls[media.id]?(media.mediaType==="image"?<img src={mediaUrls[media.id]} alt={media.prompt}/>:<video src={mediaUrls[media.id]} controls preload="metadata"/>):<div className="media-pending">{media.status==="failed"?"Generation failed":"Generation in progress"}</div>}<div><strong>{media.provider.toUpperCase()} · {media.mediaType}</strong><b className={`status-${media.status}`}>{media.status}</b><p>{media.error??media.prompt}</p><div className="pack-item-actions">{media.status==="generating"&&<button disabled={mediaBusy===media.id} onClick={()=>void refreshMedia(media.id)}>Refresh {media.provider==="comfyui"?"ComfyUI":"Kling"} task</button>}{["ready","approved","rejected"].includes(media.status)&&<><button onClick={()=>void reviewMedia(media.id,"approved")}>Approve</button><button onClick={()=>void reviewMedia(media.id,"rejected")}>Reject</button></>}</div></div></article>)}</div></div>}</section>}
        </div></div>}
      </main>
      <BottomPlayer source={playerSource} playing={playerPlaying} onTogglePlay={() => setPlayerPlaying((p) => !p)} />
    </div>
  );
}
