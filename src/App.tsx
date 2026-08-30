import { useEffect, useMemo, useState } from "react";
import type { AiSettings, AssetKind, AssetSummary, AudioAnalysisSummary, ArtistAlias, BrandProfile, CampaignChannel, CampaignPackItem, CatalogMatchSuggestion, DatabaseHealth, DraftStatus, DraftSummary, GeneratedCampaignDraft, LocalServiceStatus, MediaAspectRatio, MediaBridgeStatus, MediaGenerationSettings, MediaGenerationSummary, MediaProvider, MetaConnection, PublishingQueueItem, PublishingStatus, ReleaseReadiness, ReleaseStatus, ReleaseSummary, SoundCloudCatalogStatus, SoundCloudConnection, SoundCloudContentType, SoundCloudTrackPerformance, SoundCloudTrackSummary, SpotifyConnection, SpotifyReleaseSummary, SystemStatus, TaskAssignee, TaskPriority, TaskStatus, TaskSummary } from "../electron/shared/contracts";
import { artists } from "./data/artists";
import { AudioPlayer } from "./AudioPlayer";
import { ContactsPage } from "./features/contacts/ContactsPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";

type AppView = "overview" | "releases" | "ai-studio" | "calendar" | "analytics" | "contacts" | "integrations" | "settings";

const navigation: Array<{ id: AppView | "placeholder"; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "releases", label: "Releases", icon: "♫" },
  { id: "ai-studio", label: "AI Studio", icon: "✦" },
  { id: "calendar", label: "Tasks & Calendar", icon: "□" },
  { id: "analytics", label: "Analytics", icon: "⌁" },
  { id: "contacts", label: "Contacts", icon: "◎" }
];


export function App() {
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [selectedArtist, setSelectedArtist] = useState<ArtistAlias>("the-arkadiusz");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [database, setDatabase] = useState<DatabaseHealth | null>(null);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [activeReleaseId, setActiveReleaseId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [assetMessage, setAssetMessage] = useState("");
  const [audioAnalyses, setAudioAnalyses] = useState<Record<string, AudioAnalysisSummary>>({});
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({});
  const [analyzingAssetId, setAnalyzingAssetId] = useState<string | null>(null);
  const [releaseReadiness, setReleaseReadiness] = useState<ReleaseReadiness | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
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
  const [mediaSettings,setMediaSettings]=useState<MediaGenerationSettings>({openAiConfigured:false,klingConfigured:false,comfyUiUrl:"http://127.0.0.1:8188",comfyUiAvailable:false,comfyUiCheckpoints:[],comfyUiCheckpoint:null,comfyUiError:null});
  const [openAiKey,setOpenAiKey]=useState(""); const [klingKey,setKlingKey]=useState("");
  const [comfyUiUrl,setComfyUiUrl]=useState("http://127.0.0.1:8188"); const [comfyUiCheckpoint,setComfyUiCheckpoint]=useState("");
  const [mediaGenerations,setMediaGenerations]=useState<MediaGenerationSummary[]>([]); const [mediaUrls,setMediaUrls]=useState<Record<string,string>>({});
  const [mediaBusy,setMediaBusy]=useState<string|null>(null); const [mediaMessage,setMediaMessage]=useState("");
  const [localServices,setLocalServices]=useState<LocalServiceStatus|null>(null); const [localServiceBusy,setLocalServiceBusy]=useState(false);
  const [publishingQueue,setPublishingQueue]=useState<PublishingQueueItem[]>([]);const [publishingPlatform,setPublishingPlatform]=useState<CampaignChannel>("Instagram");const [publishingCaptionId,setPublishingCaptionId]=useState("");const [publishingMediaId,setPublishingMediaId]=useState("");const [publishingDate,setPublishingDate]=useState("");const [publishingMessage,setPublishingMessage]=useState("");
  const [brandProfiles,setBrandProfiles]=useState<BrandProfile[]>([]);const [brandDraft,setBrandDraft]=useState<BrandProfile|null>(null);const [brandMessage,setBrandMessage]=useState("");const [imageAspect,setImageAspect]=useState<"default"|MediaAspectRatio>("default");
  const [meta,setMeta]=useState<MetaConnection|null>(null);const [metaAppId,setMetaAppId]=useState("");const [metaAppSecret,setMetaAppSecret]=useState("");const [metaConfigurationId,setMetaConfigurationId]=useState("");const [metaBusy,setMetaBusy]=useState(false);const [metaMessage,setMetaMessage]=useState("");const [metaDestinationByItem,setMetaDestinationByItem]=useState<Record<string,string>>({});const [metaQueueItemId,setMetaQueueItemId]=useState("");
  const [mediaBridge,setMediaBridge]=useState<MediaBridgeStatus|null>(null);const [r2AccountId,setR2AccountId]=useState("");const [r2Bucket,setR2Bucket]=useState("");const [r2AccessKeyId,setR2AccessKeyId]=useState("");const [r2SecretAccessKey,setR2SecretAccessKey]=useState("");const [bridgeBusy,setBridgeBusy]=useState(false);const [bridgeMessage,setBridgeMessage]=useState("");
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
        const savedModelStillExists = system.ollama.models.some((model) => model.name === savedAiSettings.model);
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

  useEffect(() => {
    if (activeView !== "calendar"||!window.studio)return;const extras=activeReleaseId?Promise.all([window.studio.listCampaignPackItems(activeReleaseId),window.studio.listMediaGenerations(activeReleaseId)]):Promise.resolve([[],[]] as [CampaignPackItem[],MediaGenerationSummary[]]);void Promise.all([window.studio.listTasks(),window.studio.listPublishingQueue(),extras,window.studio.getMetaConnection()]).then(([savedTasks,queue,[pack,media],metaConnection])=>{setTasks(savedTasks);setPublishingQueue(queue);setCampaignPackItems(pack);setMediaGenerations(media);setMeta(metaConnection);}).catch((error) => setTaskMessage(error instanceof Error ? error.message : "Could not load tasks and publishing queue"));
  }, [activeView,activeReleaseId]);
  useEffect(()=>{if(activeView!=="settings"||!window.studio)return;void window.studio.listBrandProfiles().then((profiles)=>{setBrandProfiles(profiles);setBrandDraft((current)=>profiles.find((profile)=>profile.artistId===current?.artistId)??profiles[0]??null);}).catch((error)=>setBrandMessage(error instanceof Error?error.message:"Could not load brand profiles"));},[activeView]);

  useEffect(() => { if (activeView === "ai-studio" && activeReleaseId && window.studio) void Promise.all([window.studio.listCampaignPackItems(activeReleaseId),window.studio.listMediaGenerations(activeReleaseId)]).then(([items,media])=>{setCampaignPackItems(items);setMediaGenerations(media);}).catch((error) => setCampaignPackMessage(error instanceof Error ? error.message : "Could not load campaign pack")); }, [activeView, activeReleaseId]);
  useEffect(()=>{if(!window.studio)return;void Promise.all(mediaGenerations.filter((item)=>["ready","approved","rejected"].includes(item.status)).map(async(item)=>[item.id,await window.studio!.getGeneratedMediaUrl(item.id)] as const)).then((entries)=>setMediaUrls(Object.fromEntries(entries))).catch(()=>undefined);},[mediaGenerations]);
  useEffect(()=>{if(!window.studio)return;const audioAssets=assets.filter((asset)=>asset.kind==="audio");void Promise.all(audioAssets.map(async(asset)=>[asset.id,await window.studio!.getAssetPlaybackUrl(asset.id)] as const)).then((entries)=>setPlaybackUrls(Object.fromEntries(entries))).catch((error)=>setAssetMessage(error instanceof Error?error.message:"Could not prepare audio preview"));},[assets]);
  const pendingMediaKey=mediaGenerations.filter((item)=>item.status==="generating"&&["comfyui","kling"].includes(item.provider)).map((item)=>item.id).sort().join("|");
  useEffect(()=>{if(!window.studio||!pendingMediaKey)return;let cancelled=false,busy=false;const poll=async()=>{if(busy||cancelled)return;busy=true;try{const ids=pendingMediaKey.split("|");const updates=await Promise.all(ids.map((id)=>window.studio!.refreshMediaGeneration(id)));if(cancelled)return;setMediaGenerations((current)=>current.map((item)=>updates.find((updated)=>updated.id===item.id)??item));}catch(error){if(!cancelled)setMediaMessage(error instanceof Error?error.message:"Could not refresh generated media");}finally{busy=false;}};void poll();const timer=window.setInterval(()=>void poll(),5000);return()=>{cancelled=true;window.clearInterval(timer);};},[pendingMediaKey]);

  useEffect(() => {
    if (activeView !== "integrations" || !window.studio) return;
    void Promise.all([window.studio.getSoundCloudConnection(), window.studio.listSoundCloudTracks(), window.studio.getSpotifyConnection(), window.studio.getSpotifyArtistMappings(), window.studio.listSpotifyReleases(), window.studio.getCatalogMatchSuggestions(),window.studio.getMediaGenerationSettings(),window.studio.getLocalServiceStatus(),window.studio.getMetaConnection(),window.studio.getMediaBridgeStatus()]).then(([connection, tracks, spotifyConnection, mappings, savedSpotifyReleases, matches,media,services,metaConnection,bridge]) => { setSoundCloud(connection); setSoundCloudTracks(tracks); setSpotify(spotifyConnection); setSpotifyArtistIds((current) => ({ ...current, ...Object.fromEntries(mappings.map((mapping) => [mapping.artistId, mapping.spotifyArtistId])) })); setSpotifyReleases(savedSpotifyReleases); setCatalogMatches(matches);setMediaSettings(media);setComfyUiUrl(media.comfyUiUrl);setComfyUiCheckpoint(media.comfyUiCheckpoint??"");setLocalServices(services);setMeta(metaConnection);setMetaConfigurationId(metaConnection.configurationId??"");setMediaBridge(bridge);setR2AccountId(bridge.accountId??"");setR2Bucket(bridge.bucket??""); }).catch((error) => setSoundCloudMessage(error instanceof Error ? error.message : "Could not load integrations"));
  }, [activeView]);

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
  async function disconnectMeta(){if(!window.studio)return;setMeta(await window.studio.disconnectMeta());setMetaMessage("Meta disconnected locally.");}
  async function saveMediaBridge(){if(!window.studio)return;setBridgeBusy(true);setBridgeMessage("Testing encrypted Cloudflare R2 connection...");try{const saved=await window.studio.saveMediaBridgeSettings(r2AccountId,r2Bucket,r2AccessKeyId,r2SecretAccessKey);setMediaBridge(saved);setR2SecretAccessKey("");setBridgeMessage("Secure Media Bridge connected. Temporary Instagram delivery is ready.");}catch(error){setBridgeMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not configure the Media Bridge");}finally{setBridgeBusy(false);}}

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
  async function saveMediaCredentials(){if(!window.studio)return;setMediaMessage("Saving encrypted API keys...");try{setMediaSettings(await window.studio.saveMediaGenerationCredentials(openAiKey,klingKey));setOpenAiKey("");setKlingKey("");setMediaMessage("API keys saved with operating-system encryption.");}catch(error){setMediaMessage(error instanceof Error?error.message:"Could not save API keys");}}
  async function testComfyUi(){if(!window.studio)return;setMediaMessage("Connecting to local ComfyUI...");try{const settings=await window.studio.testComfyUi(comfyUiUrl);setMediaSettings(settings);setComfyUiUrl(settings.comfyUiUrl);setComfyUiCheckpoint(settings.comfyUiCheckpoint??"");setMediaMessage(`ComfyUI connected. ${settings.comfyUiCheckpoints.length} checkpoint(s) found.`);}catch(error){setMediaMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"ComfyUI connection failed");}}
  async function saveComfyUi(){if(!window.studio||!comfyUiCheckpoint)return;setMediaMessage("Saving local image model...");try{const settings=await window.studio.saveComfyUiSettings(comfyUiUrl,comfyUiCheckpoint);setMediaSettings(settings);setMediaMessage(`ComfyUI ready with ${settings.comfyUiCheckpoint}.`);}catch(error){setMediaMessage(error instanceof Error?error.message:"Could not save ComfyUI settings");}}
  async function chooseComfyLauncher(){if(!window.studio)return;setLocalServiceBusy(true);try{setLocalServices(await window.studio.selectComfyUiLauncher());}finally{setLocalServiceBusy(false);}}
  async function toggleLocalService(service:"ollama"|"comfyui",running:boolean){if(!window.studio)return;setLocalServiceBusy(true);setMediaMessage(`${running?"Stopping":"Starting"} ${service}...`);try{const next=running?await window.studio.stopLocalService(service):await window.studio.startLocalService(service);setLocalServices(next);const runningNow=service==="ollama"?next.ollama.running:next.comfyUi.running;setMediaMessage(`${service} is ${runningNow?"running":"stopped"}.`);}catch(error){setMediaMessage(error instanceof Error?error.message:"Local service operation failed");}finally{setLocalServiceBusy(false);}}
  async function toggleServiceAutoStart(enabled:boolean){if(!window.studio)return;setLocalServices(await window.studio.setLocalServicesAutoStart(enabled));}
  async function generateMedia(item:CampaignPackItem,provider:MediaProvider,mediaType:"image"|"video"){if(!window.studio)return;setMediaBusy(item.id);setMediaMessage(provider==="comfyui"?"Starting ComfyUI on demand, then sending the image prompt...":`Starting ${provider} ${mediaType} generation. This may use paid credits...`);try{const result=await window.studio.generateMedia({campaignPackItemId:item.id,provider,mediaType,...(imageAspect==="default"?{}:{aspectRatio:imageAspect})});setMediaGenerations((current)=>[result,...current.filter((row)=>row.id!==result.id)]);if(provider==="comfyui")setLocalServices(await window.studio.getLocalServiceStatus());setMediaMessage(result.status==="generating"?`${provider==="comfyui"?"ComfyUI":"Kling"} accepted the task. Use Refresh in the gallery after it finishes.`:"Generated media downloaded to the local gallery.");}catch(error){setMediaMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Media generation failed");}finally{setMediaBusy(null);}}
  async function refreshMedia(id:string){if(!window.studio)return;setMediaBusy(id);try{const updated=await window.studio.refreshMediaGeneration(id);setMediaGenerations((current)=>current.map((row)=>row.id===id?updated:row));if(updated.status==="generating")setMediaMessage("Still generating. Refresh again in a moment.");else if(updated.status==="ready")setMediaMessage("Generated image downloaded to the local gallery.");else if(updated.error)setMediaMessage(updated.error);}catch(error){setMediaMessage(error instanceof Error?error.message:"Could not refresh generation");}finally{setMediaBusy(null);}}
  async function reviewMedia(id:string,status:"approved"|"rejected"){if(!window.studio)return;const updated=await window.studio.updateMediaGenerationStatus(id,status);setMediaGenerations((current)=>current.map((row)=>row.id===id?updated:row));}
  async function addPublishingItem(){if(!window.studio||!activeReleaseId||!publishingCaptionId)return;setPublishingMessage("Adding post to publishing queue...");try{const item=await window.studio.createPublishingQueueItem({releaseId:activeReleaseId,campaignPackItemId:publishingCaptionId,mediaGenerationId:publishingMediaId||null,platform:publishingPlatform,scheduledAt:publishingDate?new Date(publishingDate).toISOString():null});setPublishingQueue((current)=>[...current,item].sort((a,b)=>(a.scheduledAt??"9999").localeCompare(b.scheduledAt??"9999")));setPublishingMessage("Post added as Draft. Review and approve it before scheduling.");}catch(error){setPublishingMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not create publishing item");}}
  async function changePublishingStatus(id:string,status:PublishingStatus){if(!window.studio)return;try{const updated=await window.studio.updatePublishingQueueStatus(id,status);setPublishingQueue((current)=>current.map((item)=>item.id===id?updated:item));}catch(error){setPublishingMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not update publishing status");}}
  async function exportPublishingPack(id:string){if(!window.studio)return;try{const directory=await window.studio.exportPublishingPack(id);if(directory){setPublishingMessage(`Publishing pack exported to ${directory}`);setPublishingQueue(await window.studio.listPublishingQueue());}}catch(error){setPublishingMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Could not export publishing pack");}}
  async function publishMetaItem(id:string){if(!window.studio)return;const destinationId=metaDestinationByItem[id];if(!destinationId){setPublishingMessage("Select a Meta destination first.");return;}setPublishingMessage("Publishing through Meta Graph API...");try{const updated=await window.studio.publishMetaQueueItem(id,destinationId);setPublishingQueue((current)=>current.map((item)=>item.id===id?updated:item));setPublishingMessage(`Published successfully · Meta post ${updated.remotePostId}`);}catch(error){setPublishingQueue(await window.studio.listPublishingQueue());setPublishingMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,""):"Meta publishing failed");}}
  async function saveBrandProfile(){if(!window.studio||!brandDraft)return;setBrandMessage("Saving brand profile...");try{const updated=await window.studio.updateBrandProfile(brandDraft);setBrandProfiles((current)=>current.map((profile)=>profile.artistId===updated.artistId?updated:profile));setBrandDraft(updated);setBrandMessage(`${updated.artistName} brand profile saved.`);}catch(error){setBrandMessage(error instanceof Error?error.message:"Could not save brand profile");}}

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
    const editing = Boolean(activeReleaseId);
    setSaveMessage(editing ? "Saving changes..." : "Creating release...");
    try {
      await persistRelease();
      setSaveMessage(editing ? "Release changes saved locally" : "Release created locally");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save release");
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
  const readinessScore = releaseReadiness?.score ?? 0;
  const readinessCheck = (id: ReleaseReadiness["checks"][number]["id"]) => releaseReadiness?.checks.find((check) => check.id === id);
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
        <div className="brand"><span className="brand-mark">▥</span><div><strong>AI MUSIC</strong><small>MANAGER</small></div></div>
        <nav>{navigation.map((item, index) => <button className={item.id === activeView ? "active" : ""} key={`${item.label}-${index}`} onClick={() => item.id !== "placeholder" && setActiveView(item.id)}><span>{item.icon}</span>{item.label}{item.label === "AI Studio" && <b>AI</b>}</button>)}</nav>
        <div className="nav-divider" />
        <nav className="secondary-nav"><button className={activeView === "integrations" ? "active" : ""} onClick={() => setActiveView("integrations")}><span>⌘</span>Integrations<i className={`status-light ${soundCloud?.connected ? "connected" : ""}`} /></button><button className={activeView === "settings" ? "active" : ""} onClick={()=>setActiveView("settings")}><span>⚙</span>Settings</button></nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-health"><span className={`dot ${status?.ollama.available && database?.ready ? "online" : ""}`} /><span>{status?.ollama.available && database?.ready ? "Local systems ready" : "Connecting local systems"}</span></div>
        <div className="user-card"><span className="avatar">A</span><div><strong>Arkadiusz</strong><small>Independent artist</small></div><b>•••</b></div>
      </aside>

      <main className="app-main">
        <div className="topbar"><div className="search">⌕<span>Search releases, tracks, tasks...</span><kbd>⌘ K</kbd></div><div className="top-actions"><span><i className={`dot ${status?.ollama.available && database?.ready ? "online" : ""}`} />{status?.ollama.available && database?.ready ? "All systems synced" : "Systems starting"}</span><button className="icon-button">♧</button><button className="primary" onClick={startNewRelease}>+ New release</button></div></div>
        {bridgeError && <div className="bridge-error">{bridgeError}</div>}
        {activeView === "overview" && <div className="overview page-content">
          <div className="overview-heading"><div><span className="date-label">MONDAY, AUG 24</span><h1>Your music. <em>Ready for the world.</em></h1><p>Everything that needs your attention, in one place.</p></div><button className="daily-brief"><span>✦</span><small>RELEASE CHECK</small><strong>{releaseReadiness?.missing.length ?? 0} actions →<br />remaining</strong></button></div>
          <section className="release-hero">
            <div className="cover-art"><div className="orbit"><i /><i /></div><span>DIFFERENT<br />PERSPECTIVE</span><small>THE ARKADIUSZ</small></div>
            <div className="release-info"><span className="eyebrow">NEXT RELEASE · {releaseDate ? "scheduled" : "date pending"}</span><h2>{currentRelease?.title ?? title}</h2><p>{currentRelease?.artistName ?? artist.name} · Single · {currentRelease?.primaryGenre ?? artist.genres[0]}</p><div className="platforms"><span>↗ Spotify</span><span>◖ SoundCloud</span><span>♪ TikTok</span><span>+12</span></div></div>
            <div className="readiness" style={{ "--progress": `${readinessScore * 3.6}deg` } as React.CSSProperties}><div><strong>{readinessScore}%</strong><span>READY</span></div><small>Release readiness</small></div>
            <div className="release-steps">{releaseReadiness?.checks.slice(0, 5).map((check, index) => <div className={check.complete ? "done" : index === releaseReadiness.checks.findIndex((item) => !item.complete) ? "current" : ""} key={check.id}><b>{check.complete ? "✓" : index + 1}</b><span>{check.label.toUpperCase()}<small>{check.detail}</small></span></div>)}</div>
          </section>
          <div className="dashboard-grid">
            <section className="dashboard-card focus-card"><div className="card-header"><div><span>YOUR FOCUS</span><h3>Move the release forward</h3></div><div className="tabs"><b>Tasks</b><span>{readinessScore}%</span></div></div>{releaseReadiness?.checks.map((check) => <div className={`task ${check.complete ? "done" : ""}`} key={check.id}><b>{check.complete ? "✓" : ""}</b><i>{check.id.slice(0, 3).toUpperCase()}</i><div><strong>{check.label}</strong><small>{check.detail} · {check.weight}%</small></div>{check.id === "campaign" && !check.complete ? <button onClick={() => setActiveView("ai-studio")}>Review →</button> : <span>{check.complete ? "✓" : "→"}</span>}</div>)}</section>
            <section className="dashboard-card intelligence-card"><div className="card-header"><div><span>RELEASE INTELLIGENCE</span><h3>Worth your attention</h3></div><b className="live">● LIVE</b></div><article><i>◷</i><div><small>NEXT ACTION</small><strong>{releaseReadiness?.missing[0] ?? "Release foundation complete"}</strong><p>{releaseReadiness?.missing.length ? `${releaseReadiness.missing.length} readiness items remain.` : "All required release elements are ready."}</p><button onClick={() => openReleaseWorkspace()}>Open release →</button></div></article><article><i>↗</i><div><small>AUDIO</small><strong>{readinessCheck("analysis")?.complete ? "Master analyzed" : "Analysis required"}</strong><p>{readinessCheck("analysis")?.detail ?? "Select a release to calculate readiness."}</p></div></article></section>
          </div>
        </div>}

        {activeView==="analytics"&&<AnalyticsPage releases={releases} onOpenRelease={openReleaseWorkspace} />}

        {activeView==="contacts"&&<ContactsPage releases={releases} onTasksChanged={setTasks} />}

        {activeView === "calendar" && <div className="page-content tasks-page"><section className="panel meta-publish-control"><div><span className="eyebrow">Meta Publishing V1</span><h3>Publish an approved queue item.</h3><p>Facebook supports text and local images. Instagram images use the temporary Secure Media Bridge.</p></div><select value={metaQueueItemId} onChange={(event)=>{setMetaQueueItemId(event.target.value);setMetaDestinationByItem((current)=>({...current,[event.target.value]:""}));}}><option value="">Select Facebook or Instagram queue item</option>{publishingQueue.filter((item)=>["Facebook","Instagram"].includes(item.platform)&&["approved","scheduled","failed"].includes(item.status)).map((item)=><option value={item.id} key={item.id}>{item.platform} · {item.releaseTitle} · {item.status}</option>)}</select><select disabled={!metaQueueItemId} value={metaDestinationByItem[metaQueueItemId]??""} onChange={(event)=>setMetaDestinationByItem((current)=>({...current,[metaQueueItemId]:event.target.value}))}><option value="">Select destination</option>{meta?.destinations.filter((destination)=>destination.platform===publishingQueue.find((item)=>item.id===metaQueueItemId)?.platform).map((destination)=><option value={destination.id} key={destination.id}>{destination.username?`@${destination.username}`:destination.name}</option>)}</select><button className="primary" disabled={!meta?.connected||!metaQueueItemId||!metaDestinationByItem[metaQueueItemId]} onClick={()=>void publishMetaItem(metaQueueItemId)}>Publish now</button></section>
          <header><div><span className="eyebrow">Tasks, Calendar & Agents</span><h1>Plan the release work.</h1><p>Human decisions, local AI assistance and automatic readiness checks in one queue.</p></div></header>
          <section className="task-creator panel"><input placeholder="New task title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /><select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select><select value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value as TaskAssignee)}><option value="human">Human</option><option value="ai">AI Agent</option><option value="automatic">Automatic</option></select><input type="date" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /><button className="primary" disabled={!taskTitle.trim() || !activeReleaseId} onClick={() => void createTask()}>Add task</button></section>
          {taskMessage && <p className="task-message">{taskMessage}</p>}
          <div className="task-board">
            {(["doing","todo","done"] as TaskStatus[]).map((column) => <section className="task-column" key={column}><div className="task-column-title"><strong>{column === "doing" ? "In progress" : column === "todo" ? "To do" : "Done"}</strong><span>{tasks.filter((task) => task.status === column).length}</span></div>{tasks.filter((task) => task.status === column).map((task) => <article className={`managed-task priority-${task.priority}`} key={task.id}><div className="managed-task-meta"><span>{task.assignee === "ai" ? "✦ AI AGENT" : task.assignee === "automatic" ? "⚙ AUTOMATIC" : "● HUMAN"}</span><b>{task.priority}</b></div><h3>{task.title}</h3><p>{task.releaseTitle ?? "No release"}{task.dueAt ? ` · due ${task.dueAt}` : ""}</p>{task.agentOutput && <div className="agent-output"><strong>Agent result · {task.model}</strong><p>{task.agentOutput}</p><small>Human review required</small></div>}<div className="managed-task-actions">{column !== "doing" && column !== "done" && <button onClick={() => void changeTaskStatus(task.id, "doing")}>Start</button>}{column !== "done" && <button onClick={() => void changeTaskStatus(task.id, "done")}>Done</button>}{column === "done" && <button onClick={() => void changeTaskStatus(task.id, "todo")}>Reopen</button>}{task.assignee === "ai" && column !== "done" && <button className="agent-button" disabled={runningTaskId === task.id} onClick={() => void runTaskAgent(task.id)}>{runningTaskId === task.id ? "Working..." : "Run agent"}</button>}</div></article>)}</section>)}
          </div>
          <section className="publishing-section panel"><div className="publishing-heading"><div><span className="eyebrow">Publishing Queue V1</span><h2>Build and schedule campaign posts.</h2><p>Only approved captions and media can enter the queue. Export creates a ready-to-post local folder.</p></div><div className="publishing-metrics"><span><b>{publishingQueue.filter((item)=>item.status==="scheduled").length}</b> scheduled</span><span><b>{publishingQueue.filter((item)=>item.status==="published").length}</b> published</span></div></div><div className="publishing-creator"><label>Release<select value={activeReleaseId??""} onChange={(event)=>{const release=releases.find((item)=>item.id===event.target.value);if(release)void selectRelease(release);}}><option value="">Select release</option>{releases.map((release)=><option value={release.id} key={release.id}>{release.title} · {release.artistName}</option>)}</select></label><label>Platform<select value={publishingPlatform} onChange={(event)=>setPublishingPlatform(event.target.value as CampaignChannel)}>{(["Instagram","Facebook","TikTok","SoundCloud","YouTube"] as CampaignChannel[]).map((platform)=><option key={platform}>{platform}</option>)}</select></label><label>Approved caption<select value={publishingCaptionId} onChange={(event)=>setPublishingCaptionId(event.target.value)}><option value="">Select caption</option>{campaignPackItems.filter((item)=>item.kind==="caption"&&item.status==="approved").map((item)=><option value={item.id} key={item.id}>{item.channel} · {item.content.slice(0,70)}</option>)}</select></label><label>Approved media (optional)<select value={publishingMediaId} onChange={(event)=>setPublishingMediaId(event.target.value)}><option value="">Text-only post</option>{mediaGenerations.filter((item)=>item.status==="approved").map((item)=><option value={item.id} key={item.id}>{item.provider} · {item.mediaType} · {item.prompt.slice(0,55)}</option>)}</select></label><label>Publishing time<input type="datetime-local" value={publishingDate} onChange={(event)=>setPublishingDate(event.target.value)}/></label><button className="primary" disabled={!activeReleaseId||!publishingCaptionId} onClick={()=>void addPublishingItem()}>Add Draft</button></div>{publishingMessage&&<p className="task-message">{publishingMessage}</p>}<div className="campaign-calendar">{publishingQueue.map((item)=><article className={`publishing-${item.status}`} key={item.id}><div className="publishing-date"><b>{item.scheduledAt?new Date(item.scheduledAt).toLocaleDateString(undefined,{day:"2-digit",month:"short"}):"NO DATE"}</b><span>{item.scheduledAt?new Date(item.scheduledAt).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}):"Draft"}</span></div><div className="publishing-content"><div><strong>{item.platform} · {item.releaseTitle}</strong><b className={`status-${item.status}`}>{item.status}</b></div><p>{item.caption}</p><small>{item.mediaType?`${item.mediaProvider} ${item.mediaType}`:"Text only"}{item.exportedAt?` · exported ${new Date(item.exportedAt).toLocaleDateString()}`:""}</small>{item.rightsBlocked&&<em>BOOTLEG RIGHTS NOT CLEARED · SOUNDCLOUD/YOUTUBE BLOCKED</em>}</div><div className="publishing-actions">{item.status==="draft"&&<button onClick={()=>void changePublishingStatus(item.id,"approved")}>Approve</button>}{item.status==="approved"&&<><button onClick={()=>void changePublishingStatus(item.id,"draft")}>Back to Draft</button><button disabled={!item.scheduledAt} onClick={()=>void changePublishingStatus(item.id,"scheduled")}>Schedule</button></>}{item.status==="scheduled"&&<><button onClick={()=>void changePublishingStatus(item.id,"approved")}>Unschedule</button><button onClick={()=>void changePublishingStatus(item.id,"published")}>Mark Published</button><button onClick={()=>void changePublishingStatus(item.id,"failed")}>Mark Failed</button></>}{item.status==="failed"&&<button onClick={()=>void changePublishingStatus(item.id,"draft")}>Retry as Draft</button>}{["approved","scheduled","published"].includes(item.status)&&<button className="export-button" onClick={()=>void exportPublishingPack(item.id)}>Export Pack</button>}</div></article>)}{publishingQueue.length===0&&<div className="publishing-empty">No campaign posts queued yet. Approve a caption in AI Studio, then create the first publishing draft.</div>}</div></section>
        </div>}

        {activeView==="settings"&&<div className="page-content brand-settings-page"><header><div><span className="eyebrow">Prompt Templates & Brand Profiles V1</span><h1>Keep every alias visually consistent.</h1><p>These rules are automatically added to approved image and video prompts before generation.</p></div></header><div className="brand-profile-layout"><aside>{brandProfiles.map((profile)=><button className={brandDraft?.artistId===profile.artistId?"selected":""} key={profile.artistId} onClick={()=>setBrandDraft(profile)}><strong>{profile.artistName}</strong><span>{profile.defaultAspectRatio} default · {profile.palette}</span></button>)}</aside>{brandDraft&&<section className="panel brand-editor"><div className="brand-editor-heading"><div><span className="eyebrow">{brandDraft.artistName}</span><h2>Visual identity template</h2></div><label>Default format<select value={brandDraft.defaultAspectRatio} onChange={(event)=>setBrandDraft({...brandDraft,defaultAspectRatio:event.target.value as MediaAspectRatio})}>{(["1:1","4:5","9:16","16:9"] as MediaAspectRatio[]).map((ratio)=><option key={ratio}>{ratio}</option>)}</select></label></div><label>Visual direction<textarea rows={3} value={brandDraft.visualDirection} onChange={(event)=>setBrandDraft({...brandDraft,visualDirection:event.target.value})}/></label><div className="brand-two-columns"><label>Color palette<textarea rows={3} value={brandDraft.palette} onChange={(event)=>setBrandDraft({...brandDraft,palette:event.target.value})}/></label><label>Typography and layout<textarea rows={3} value={brandDraft.typography} onChange={(event)=>setBrandDraft({...brandDraft,typography:event.target.value})}/></label><label>Required elements<textarea rows={4} value={brandDraft.requiredElements} onChange={(event)=>setBrandDraft({...brandDraft,requiredElements:event.target.value})}/></label><label>Forbidden elements<textarea rows={4} value={brandDraft.forbiddenElements} onChange={(event)=>setBrandDraft({...brandDraft,forbiddenElements:event.target.value})}/></label></div><label>ComfyUI negative prompt<textarea rows={4} value={brandDraft.negativePrompt} onChange={(event)=>setBrandDraft({...brandDraft,negativePrompt:event.target.value})}/></label><div className="brand-save-row"><p>{brandMessage||"The original campaign prompt is preserved; this profile is appended only at generation time."}</p><button className="primary" onClick={()=>void saveBrandProfile()}>Save brand profile</button></div></section>}</div></div>}

        {activeView === "integrations" && <div className="page-content integrations-page">
          <header><div><span className="eyebrow">Integrations</span><h1>Connect SoundCloud.</h1><p>Authorize your Artist Pro account and bring your existing catalog into the local studio database.</p></div><span className={`connection-badge ${soundCloud?.connected ? "connected" : ""}`}>{soundCloud?.connected ? "● CONNECTED" : "○ NOT CONNECTED"}</span></header>
          <div className="integration-grid">
            <section className="panel connection-panel">
              <div className="integration-title"><span className="soundcloud-mark">☁</span><div><h2>SoundCloud Artist Pro</h2><p>OAuth 2.1 · credentials encrypted by Windows</p></div></div>
              <div className="callback-box"><small>CALLBACK URL — add this exact address in your SoundCloud app</small><code>{soundCloud?.callbackUrl ?? "ai-studio-manager://soundcloud/callback"}</code></div>
              <label>Client ID<input autoComplete="off" placeholder={soundCloud?.configured ? "Credentials already configured" : "Paste SoundCloud Client ID"} value={soundCloudClientId} onChange={(event) => setSoundCloudClientId(event.target.value)} /></label>
              <label>Client Secret<input type="password" autoComplete="new-password" placeholder={soundCloud?.configured ? "Enter only when replacing credentials" : "Paste SoundCloud Client Secret"} value={soundCloudClientSecret} onChange={(event) => setSoundCloudClientSecret(event.target.value)} /></label>
              <div className="integration-actions"><button disabled={soundCloudBusy || !soundCloudClientId.trim() || !soundCloudClientSecret.trim()} onClick={() => void saveSoundCloudCredentials()}>Save API credentials</button><button className="primary" disabled={soundCloudBusy || !soundCloud?.configured || soundCloud.connected} onClick={() => void connectSoundCloud()}>{soundCloudBusy ? "Working..." : "Connect with SoundCloud"}</button></div>
              {soundCloud?.connected && <div className="connected-profile"><span>✓</span><div><strong>{soundCloud.username}</strong><small>{soundCloud.permalinkUrl}</small></div></div>}
              {soundCloudMessage && <p className="integration-message">{soundCloudMessage}</p>}
              {soundCloud?.connected && <div className="integration-actions"><button className="primary" disabled={soundCloudBusy} onClick={() => void syncSoundCloudCatalog()}>Sync catalog</button><button className="danger-button" disabled={soundCloudBusy} onClick={() => void disconnectSoundCloud()}>Disconnect</button></div>}
            </section>
            <section className="panel catalog-panel">
              <div className="catalog-heading"><div><span className="eyebrow">Local catalog</span><h2>{soundCloudTracks.length} tracks imported</h2></div>{soundCloudTracks.length > 0 && <small>Latest sync is stored in SQLite</small>}</div>
              {soundCloudTracks.length > 0 && <div className="catalog-metrics"><span><small>TOTAL PLAYS</small><b>{soundCloudTotals.plays.toLocaleString()}</b></span><span><small>LIKES</small><b>{soundCloudTotals.likes.toLocaleString()}</b></span><span><small>COMMENTS</small><b>{soundCloudTotals.comments.toLocaleString()}</b></span><span><small>REPOSTS</small><b>{soundCloudTotals.reposts.toLocaleString()}</b></span><span><small>BOOTLEGS</small><b>{soundCloudTotals.bootlegs}</b></span><span><small>GEMS</small><b>{soundCloudTotals.gems}</b></span></div>}
              {soundCloudTracks.length === 0 ? <div className="empty-catalog"><span>♫</span><strong>No SoundCloud tracks imported yet</strong><p>Connect your account and select Sync catalog. Nothing is published or changed on SoundCloud.</p></div> : <><div className="catalog-tools"><input placeholder="Search title, genre or tags..." value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} /><select value={catalogStatusFilter} onChange={(event) => setCatalogStatusFilter(event.target.value as SoundCloudCatalogStatus | "all")}><option value="all">All statuses</option><option value="unreviewed">Unreviewed</option><option value="release">Release</option><option value="gem">Gem</option><option value="archive">Archive</option><option value="exclude">Exclude</option></select><select value={catalogArtistFilter} onChange={(event) => setCatalogArtistFilter(event.target.value as ArtistAlias | "all" | "unassigned")}><option value="all">All aliases</option><option value="unassigned">Unassigned</option>{artists.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)}><option value="engagement">Best engagement</option><option value="plays">Most plays</option><option value="likes">Most likes</option><option value="newest">Newest</option></select><b>{visibleSoundCloudTracks.length} shown</b><button onClick={() => void markVisibleTracksAsBootlegs()}>Mark visible as Bootleg</button></div><div className="soundcloud-track-list">{visibleSoundCloudTracks.map((track) => <article className={`catalog-${track.catalogStatus}`} key={track.id}>{track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <span className="track-placeholder">♫</span>}<div className="track-main"><div className="track-title-line"><strong>{track.title}</strong><span className={`trend-${track.trend}`}>{track.trend === "baseline" ? "BASELINE" : track.trend === "growing" ? `↑ GROWING +${track.playsDelta}` : track.trend === "declining" ? `↓ DECLINING ${track.playsDelta}` : "→ STABLE"}</span></div><small>{new Date(track.createdAt).toLocaleDateString()} · {track.genre ?? "No genre"} · {Math.round(track.durationMs / 6000) / 10} min · {track.snapshotCount} snapshot{track.snapshotCount === 1 ? "" : "s"}</small>{track.contentType === "bootleg" && <b className="rights-warning">BOOTLEG · RIGHTS NOT CLEARED · OFFICIAL RELEASE BLOCKED</b>}<div className="track-classification"><select aria-label="Artist alias" value={track.artistId ?? ""} onChange={(event) => void classifySoundCloudTrack(track, (event.target.value || null) as ArtistAlias | null, track.catalogStatus, track.contentType)}><option value="">Unassigned alias</option>{artists.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select><select aria-label="Content type" value={track.contentType} onChange={(event) => void classifySoundCloudTrack(track, track.artistId, track.catalogStatus === "release" && event.target.value === "bootleg" ? "unreviewed" : track.catalogStatus, event.target.value as SoundCloudContentType)}><option value="original">Original</option><option value="bootleg">Bootleg</option><option value="official-remix">Official remix</option><option value="edit">Edit</option><option value="dj-set">DJ set</option></select><select aria-label="Catalog status" value={track.catalogStatus} onChange={(event) => void classifySoundCloudTrack(track, track.artistId, event.target.value as SoundCloudCatalogStatus, track.contentType)}><option value="unreviewed">Unreviewed</option><option value="release" disabled={track.contentType === "bootleg"}>Release</option><option value="gem">Gem</option><option value="archive">Archive</option><option value="exclude">Exclude</option></select></div><div className="release-link-row"><select aria-label="Linked release" value={track.releaseId ?? ""} onChange={(event) => void linkSoundCloudTrack(track, event.target.value || null)}><option value="">Not linked to Release Manager</option>{releases.filter((release) => !soundCloudTracks.some((item) => item.releaseId === release.id && item.id !== track.id)).map((release) => <option value={release.id} key={release.id}>{release.title} · {release.artistName}</option>)}</select>{!track.releaseId && <button disabled={!track.artistId} onClick={() => void createLocalEntryFromSoundCloud(track)}>Create local entry</button>}{track.releaseId && <b>↗ {track.releaseTitle}</b>}<button onClick={() => void toggleTrackPerformance(track.id)}>{selectedPerformanceTrackId === track.id ? "Hide history" : "History"}</button></div>{selectedPerformanceTrackId === track.id && trackPerformance && <div className="performance-history">{trackPerformance.windows.map((window) => <span key={window.days}><small>{window.days} DAYS</small><b>{window.available ? `${(window.playsDelta ?? 0) >= 0 ? "+" : ""}${window.playsDelta} plays` : "Collecting data"}</b>{window.available && <em>+{window.likesDelta ?? 0} likes · +{window.commentsDelta ?? 0} comments</em>}</span>)}</div>}</div><div className="track-stats"><span><b>{track.playbackCount ?? "—"}</b> plays</span><span><b>{track.likesCount ?? "—"}</b> likes</span><span><b>{track.commentCount ?? "—"}</b> comments</span><span className="engagement-stat"><b>{track.engagementRate === null ? "—" : `${track.engagementRate}%`}</b> engagement<small>score {track.engagementScore}</small></span></div><b className="sharing-label">{track.sharing}</b></article>)}</div></>}
            </section>
          </div>
          <section className="panel meta-panel"><div className="integration-title"><span className="meta-mark">f</span><div><h2>Meta publishing</h2><p>Facebook Pages + connected Instagram professional accounts · Graph API {meta?.graphVersion??"v26.0"}</p></div><span className={`connection-badge ${meta?.connected?"connected":""}`}>{meta?.connected?`● ${meta.destinations.length} DESTINATIONS`:"○ NOT CONNECTED"}</span></div><div className="meta-setup-grid"><div><div className="callback-box"><small>VALID OAUTH REDIRECT URI — add this exact address in Meta App Dashboard</small><code>{meta?.callbackUrl??"http://localhost:43822/callback"}</code></div><label>Meta App ID<input placeholder={meta?.configured?"App ID already configured":"Paste Meta App ID"} value={metaAppId} onChange={(event)=>setMetaAppId(event.target.value)}/></label><label>Meta App Secret<input type="password" autoComplete="new-password" placeholder={meta?.configured?"Enter only when replacing credentials":"Paste Meta App Secret"} value={metaAppSecret} onChange={(event)=>setMetaAppSecret(event.target.value)}/></label><label>Business Login Configuration ID<input placeholder="Paste Configuration ID" value={metaConfigurationId} onChange={(event)=>setMetaConfigurationId(event.target.value)}/></label><div className="integration-actions"><button disabled={metaBusy||!metaConfigurationId.trim()} onClick={()=>void saveMetaCredentials()}>Save encrypted credentials</button><button className="primary" disabled={metaBusy||!meta?.configured||meta.connected} onClick={()=>void connectMeta()}>Connect Meta</button>{meta?.connected&&<button className="danger-button" disabled={metaBusy} onClick={()=>void disconnectMeta()}>Disconnect</button>}</div>{metaMessage&&<p className="integration-message">{metaMessage}</p>}</div><div className="meta-destinations">{meta?.destinations.map((destination)=><article key={destination.id}><b>{destination.platform==="Facebook"?"f":"◎"}</b><div><strong>{destination.username?`@${destination.username}`:destination.name}</strong><small>{destination.platform} · {destination.pageId}</small></div></article>)}{!meta?.destinations.length&&<div className="empty-catalog"><strong>No Meta destinations discovered</strong><p>Create a Meta developer app, add Facebook Login, configure the redirect URI and request Pages permissions.</p></div>}</div></div><p className="meta-limit"><b>V1 capability:</b> Facebook text and image publishing is active. Instagram Feed publishing supports approved PNG and JPEG images through the Secure Media Bridge.</p></section>
          <section className="panel media-bridge-panel">
            <div><span className="eyebrow">Secure Media Bridge</span><h2>Cloudflare R2 temporary delivery</h2><p>A private bucket provides a signed URL for 15 minutes. The temporary object is deleted after Meta finishes publishing.</p></div>
            <div className="media-bridge-fields"><label>R2 Account ID<input value={r2AccountId} onChange={(event)=>setR2AccountId(event.target.value)} placeholder="Cloudflare Account ID"/></label><label>Bucket<input value={r2Bucket} onChange={(event)=>setR2Bucket(event.target.value)} placeholder="Private R2 bucket name"/></label><label>Access Key ID<input value={r2AccessKeyId} onChange={(event)=>setR2AccessKeyId(event.target.value)} placeholder={mediaBridge?.configured?"Enter only when replacing settings":"R2 Access Key ID"}/></label><label>Secret Access Key<input type="password" autoComplete="new-password" value={r2SecretAccessKey} onChange={(event)=>setR2SecretAccessKey(event.target.value)} placeholder={mediaBridge?.configured?"Enter only when replacing settings":"R2 Secret Access Key"}/></label></div>
            <div className="media-bridge-actions"><button className="primary" disabled={bridgeBusy||!r2AccountId.trim()||!r2Bucket.trim()||!r2AccessKeyId.trim()||!r2SecretAccessKey.trim()} onClick={()=>void saveMediaBridge()}>{bridgeBusy?"Testing...":"Save & test bridge"}</button><span className={mediaBridge?.configured?"connected":""}>{mediaBridge?.configured?`● READY · ${mediaBridge.bucket}`:"○ NOT CONFIGURED"}</span></div>{bridgeMessage&&<p className="integration-message">{bridgeMessage}</p>}
          </section>
          <section className="panel media-provider-panel">
            <div className="integration-title"><span className="ai-provider-mark">✦</span><div><h2>AI media providers</h2><p>API keys encrypted locally · calls start only after a manual click</p></div></div>
            {localServices&&<div className="local-service-manager"><div><span className="eyebrow">Application lifecycle</span><h3>Local AI services</h3><label className="auto-start-toggle"><input type="checkbox" checked={localServices.autoStart} onChange={(event)=>void toggleServiceAutoStart(event.target.checked)}/> Start Ollama with AI Studio Manager. ComfyUI starts only when local image generation is requested.</label></div>{(["ollama","comfyui"] as const).map((service)=>{const serviceStatus=service==="ollama"?localServices.ollama:localServices.comfyUi;return <article key={service}><div><strong>{service==="ollama"?"Ollama":"ComfyUI"}</strong><span className={serviceStatus.running?"online":""}>{serviceStatus.running?`● RUNNING${serviceStatus.managed?" · MANAGED BY APP":" · EXTERNAL"}`:"○ STOPPED"}</span>{service==="comfyui"&&<small>{localServices.comfyUi.batchPath??"No .bat launcher selected"}</small>}{serviceStatus.error&&<small className="service-error">{serviceStatus.error}</small>}</div><div>{service==="comfyui"&&<button disabled={localServiceBusy} onClick={()=>void chooseComfyLauncher()}>Choose .bat</button>}<button className={serviceStatus.running?"danger-button":"primary"} disabled={localServiceBusy||(serviceStatus.running&&!serviceStatus.managed)} onClick={()=>void toggleLocalService(service,serviceStatus.running)}>{serviceStatus.running?serviceStatus.managed?"Stop":"External process":"Start"}</button></div></article>})}</div>}
            <div className="provider-key-grid"><label>OpenAI API key<input type="password" autoComplete="new-password" placeholder={mediaSettings.openAiConfigured?"OpenAI key already configured":"Paste OpenAI API key"} value={openAiKey} onChange={(event)=>setOpenAiKey(event.target.value)}/><small>Images with GPT Image 1.5</small></label><label>Kling API key<input type="password" autoComplete="new-password" placeholder={mediaSettings.klingConfigured?"Kling key already configured":"Paste Kling API key"} value={klingKey} onChange={(event)=>setKlingKey(event.target.value)}/><small>Images and vertical 5-second videos</small></label></div>
            <div className="integration-actions"><button disabled={!openAiKey.trim()&&!klingKey.trim()} onClick={()=>void saveMediaCredentials()}>Save encrypted keys</button><span className="cost-warning">Generation can consume paid provider credits.</span></div>{mediaMessage&&<p className="integration-message">{mediaMessage}</p>}
            <div className="comfy-setup"><div><span className="eyebrow">Local · no API credits</span><h3>ComfyUI image generation</h3><p>ComfyUI remains off until a local image is requested. Only a local loopback address is accepted.</p></div><div className="comfy-controls"><label>ComfyUI address<input value={comfyUiUrl} onChange={(event)=>setComfyUiUrl(event.target.value)} /></label><button onClick={()=>void testComfyUi()}>Test & discover models</button><label>Checkpoint<select disabled={!mediaSettings.comfyUiAvailable} value={comfyUiCheckpoint} onChange={(event)=>setComfyUiCheckpoint(event.target.value)}><option value="">Select checkpoint</option>{mediaSettings.comfyUiCheckpoints.map((checkpoint)=><option value={checkpoint} key={checkpoint}>{checkpoint}</option>)}</select></label><button className="primary" disabled={!mediaSettings.comfyUiAvailable||!comfyUiCheckpoint} onClick={()=>void saveComfyUi()}>Save local model</button></div><div className={`comfy-status ${mediaSettings.comfyUiAvailable?"connected":""}`}>{mediaSettings.comfyUiAvailable?`● ONLINE · ${mediaSettings.comfyUiCheckpoint??"select model"}`:`○ STANDBY · starts on generation${mediaSettings.comfyUiCheckpoint?` · ${mediaSettings.comfyUiCheckpoint}`:""}`}</div></div>
          </section>
          <section className="panel spotify-panel">
            <div className="integration-title"><span className="spotify-mark">●</span><div><h2>Spotify catalog</h2><p>Development Mode · Authorization Code with PKCE · Premium required</p></div><span className={`connection-badge ${spotify?.connected ? "connected" : ""}`}>{spotify?.connected ? `● ${spotify.displayName}` : "○ NOT CONNECTED"}</span></div>
            <div className="spotify-setup-grid"><div><div className="callback-box"><small>REDIRECT URI — add this exact address in Spotify Developer Dashboard</small><code>{spotify?.callbackUrl ?? "http://127.0.0.1:43821/callback"}</code></div><label>Spotify Client ID<input placeholder={spotify?.configured ? "Client ID already configured" : "Paste Client ID"} value={spotifyClientId} onChange={(event) => setSpotifyClientId(event.target.value)} /></label></div><div className="artist-id-grid">{artists.map((artist) => <label key={artist.id}>{artist.name}<input placeholder="Spotify artist URL or ID" value={spotifyArtistIds[artist.id]} onChange={(event) => setSpotifyArtistIds((current) => ({ ...current, [artist.id]: event.target.value }))} /></label>)}</div></div>
            <div className="integration-actions"><button disabled={spotifyBusy || (!spotifyClientId.trim() && !Object.values(spotifyArtistIds).some((value) => value.trim()))} onClick={() => void saveSpotifyConfiguration()}>Save configuration</button><button className="primary" disabled={spotifyBusy || !spotify?.configured || spotify.connected} onClick={() => void connectSpotify()}>Connect Spotify</button><button className="primary" disabled={spotifyBusy || !spotify?.connected || !Object.values(spotifyArtistIds).some((value) => value.trim())} onClick={() => void syncSpotifyCatalog()}>Sync Spotify catalog</button></div>
            {spotifyMessage && <p className="integration-message">{spotifyMessage}</p>}
            <div className="match-panel"><div><span className="eyebrow">Unified catalog suggestions</span><h3>{catalogMatches.length} possible matches</h3><p>Bootlegs and DJ sets are excluded automatically.</p></div>{catalogMatches.slice(0, 8).map((match) => <article key={`${match.soundCloudTrackId}-${match.spotifyReleaseId}`}><div><strong>{match.soundCloudTitle}</strong><span>SoundCloud</span></div><b>{match.score}%</b><div><strong>{match.spotifyTitle}</strong><span>Spotify · {match.reason}</span></div><button onClick={() => void acceptCatalogMatch(match)}>Confirm match</button></article>)}{catalogMatches.length === 0 && <small>No safe unlinked matches found. Change incorrect Bootleg classifications to Original before matching.</small>}</div>
            <div className="spotify-release-grid">{spotifyReleases.map((release) => <article key={release.id}>{release.imageUrl ? <img src={release.imageUrl} alt="" /> : <span>♫</span>}<div><strong>{release.name}</strong><small>{artists.find((artist) => artist.id === release.artistId)?.name} · {release.albumType} · {release.releaseDate} · {release.totalTracks} tracks</small><select value={release.releaseId ?? ""} onChange={(event) => void linkSpotifyRelease(release, event.target.value || null)}><option value="">Not linked to Release Manager</option>{releases.filter((local) => !spotifyReleases.some((item) => item.releaseId === local.id && item.id !== release.id)).map((local) => <option value={local.id} key={local.id}>{local.title}</option>)}</select>{release.releaseId && <b>Unified: {release.releaseTitle}</b>}</div></article>)}</div>
          </section>
        </div>}

        {(activeView === "releases" || activeView === "ai-studio") && <div className="page-content release-page">
        <header>
          <div><span className="eyebrow">{activeView === "ai-studio" ? "AI Studio" : "Release Manager"}</span><h1>{activeView === "ai-studio" ? "Create campaign content." : "Build the next release."}</h1></div>
          <div className="header-actions">{activeReleaseId && currentRelease && <button className="danger-button" onClick={() => void deleteRelease(currentRelease)}>Delete release</button>}<button className="primary" onClick={saveRelease}>{activeReleaseId ? "Save changes" : "Create release"}</button></div>
        </header>
        <section className="artist-strip">
          {artists.map((profile) => (
            <button className={profile.id === selectedArtist ? "selected" : ""} key={profile.id} onClick={() => { setSelectedArtist(profile.id); setPrimaryGenre(profile.genres[0]); }}>
              <strong>{profile.name}</strong><span>{profile.genres.slice(0, 2).join(" · ")}</span>
            </button>
          ))}
        </section>

        <div className={`workspace ${activeView === "ai-studio" ? "ai-focus" : ""}`}>
          <section className="panel form-panel">
            <div className="panel-heading"><span className="eyebrow">01 / Source</span><h2>Release foundation</h2></div>
            <label>Track title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Artist<input value={artist.name} readOnly /></label>
            <label>Primary genre<input value={primaryGenre} onChange={(event) => setPrimaryGenre(event.target.value)} /></label>
            <label>Release date<input type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} /></label>
            <label>Release status<select value={releaseStatus} onChange={(event) => setReleaseStatus(event.target.value as ReleaseStatus)}>{(["draft","planned","scheduled","published","archived"] as ReleaseStatus[]).map((statusOption) => <option disabled={activeReleaseId ? !allowedReleaseStatuses[persistedStatus].includes(statusOption) : statusOption !== "draft"} value={statusOption} key={statusOption}>{statusOption[0].toUpperCase() + statusOption.slice(1)}</option>)}</select></label>
            <label>Track story<textarea rows={6} value={story} onChange={(event) => setStory(event.target.value)} /></label>
            {saveMessage && <p className="save-message">{saveMessage}</p>}
            <div className="dropzone"><strong>Release media library</strong><span>Files remain in their original folders; the application stores secure references.</span><div className="asset-buttons"><button onClick={() => void attachAsset("audio")}>Choose audio</button><button onClick={() => void attachAsset("cover")}>Choose cover</button></div>{assetMessage && <p>{assetMessage}</p>}</div>
            {assets.length > 0 && <div className="asset-list-local">{assets.map((asset) => {
              const analysis = audioAnalyses[asset.id];
              return <article key={asset.id}><b>{asset.kind}</b><div><div className="asset-title"><strong>{asset.fileName}</strong><button onClick={() => void detachAsset(asset.id)}>Detach</button></div><span>{formatBytes(asset.sizeBytes)} · {asset.mimeType ?? "unknown type"}{asset.width && asset.height ? ` · ${asset.width} × ${asset.height}px` : ""}</span><small title={asset.filePath}>{asset.filePath}</small>
                {asset.kind === "cover" && asset.width && asset.height && (asset.width !== asset.height || asset.width < 3000) && <small className="asset-warning">Cover recommendation: square artwork, at least 3000 × 3000 px.</small>}
                {asset.kind === "audio" && playbackUrls[asset.id] && <AudioPlayer source={playbackUrls[asset.id]} title={asset.fileName} />}
                {asset.kind === "audio" && <div className="analysis-row">{analysis ? <><span><b>{formatDuration(analysis.durationSeconds)}</b> duration</span><span><b>{(analysis.sampleRate / 1000).toFixed(1)} kHz</b> sample rate</span><span><b>{analysis.bitDepth ?? "—"} bit</b> depth</span><span><b>{analysis.integratedLufs ?? "—"} LUFS</b> loudness</span><span><b>{analysis.truePeakDbtp ?? "—"} dBTP</b> peak</span>{analysis.loudnessRangeLu !== null && <span><b>{analysis.loudnessRangeLu} LU</b> range</span>}<span className="musical-result"><b>{analysis.bpm ?? "—"} BPM</b>{analysis.bpmConfidence !== null ? `${analysis.bpmConfidence}% confidence` : "tempo unavailable"}{analysis.alternateBpm !== null && <small>alt. {analysis.alternateBpm}</small>}</span><span className="musical-result"><b>{analysis.musicalKey ?? "—"}</b>{analysis.keyConfidence !== null ? `${analysis.keyConfidence}% confidence` : "key unavailable"}{analysis.alternateKey && <small>alt. {analysis.alternateKey}</small>}</span></> : <span>No analysis saved</span>}<button disabled={analyzingAssetId === asset.id} onClick={() => void analyzeAsset(asset.id)}>{analyzingAssetId === asset.id ? "Analyzing..." : analysis ? "Analyze again" : "Analyze audio"}</button></div>}
                {analysis?.note && <small className="analysis-note">{analysis.note}</small>}
              </div></article>;
            })}</div>}
          </section>

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
              {drafts.length === 0 ? <p>No AI drafts saved yet.</p> : drafts.slice(0, 8).map((item) => (
                <article key={item.id}>
                  <div className="draft-summary"><strong>{item.channel} · {item.language.toUpperCase()}</strong><span>{item.releaseTitle} · {item.model}</span><p>{item.content}</p></div>
                  <div className="draft-actions"><b className={`status-${item.status}`}>{item.status}</b>{nextDraftActions(item.status).map((next) => <button key={next} onClick={() => void changeDraftStatus(item.id, next)}>{next}</button>)}</div>
                </article>
              ))}
            </div>
          </section>
        </div>
        {activeView === "ai-studio" && <section className="panel campaign-pack-panel"><div className="campaign-pack-heading"><div><span className="eyebrow">Campaign Pack Generator V1</span><h2>One release. Every promotional format.</h2><p>Approve a media prompt first. ComfyUI starts automatically on demand; cloud providers use paid credits.</p></div><button className="primary" disabled={campaignPackBusy||!activeReleaseId||!aiSettings.model} onClick={()=>void generateCampaignPack()}>{campaignPackBusy?"Generating pack...":`Generate ${aiSettings.language.toUpperCase()} pack`}</button></div>{(campaignPackMessage||mediaMessage)&&<p className="integration-message">{mediaMessage||campaignPackMessage}</p>}<div className="campaign-pack-grid">{campaignPackItems.map((item)=><article key={item.id}><div className="pack-item-head"><div><span>{item.kind.replaceAll("-"," ").toUpperCase()}</span><strong>{item.channel??"MEDIA GENERATION"} · {item.language.toUpperCase()}</strong></div><b className={`status-${item.status}`}>{item.status}</b></div><p>{item.content}</p><div className="pack-item-actions">{nextDraftActions(item.status).map((next)=><button key={next} onClick={()=>void changeCampaignPackStatus(item.id,next)}>{next}</button>)}{item.status==="approved"&&item.kind==="image-prompt"&&<><button className="local-generate" disabled={mediaBusy===item.id||!mediaSettings.comfyUiCheckpoint} onClick={()=>void generateMedia(item,"comfyui","image")}>Generate locally · ComfyUI</button><button disabled={mediaBusy===item.id||!mediaSettings.openAiConfigured} onClick={()=>void generateMedia(item,"openai","image")}>OpenAI</button><button disabled={mediaBusy===item.id||!mediaSettings.klingConfigured} onClick={()=>void generateMedia(item,"kling","image")}>Kling</button></>}{item.status==="approved"&&["visualizer-prompt","video-script"].includes(item.kind)&&<button disabled={mediaBusy===item.id||!mediaSettings.klingConfigured} onClick={()=>void generateMedia(item,"kling","video")}>Generate video · Kling</button>}</div></article>)}</div>{mediaGenerations.length>0&&<div className="media-gallery"><div className="campaign-pack-heading"><div><span className="eyebrow">Results gallery</span><h2>Generated media.</h2></div></div><div className="media-gallery-grid">{mediaGenerations.map((media)=><article key={media.id}>{mediaUrls[media.id]?(media.mediaType==="image"?<img src={mediaUrls[media.id]} alt={media.prompt}/>:<video src={mediaUrls[media.id]} controls preload="metadata"/>):<div className="media-pending">{media.status==="failed"?"Generation failed":"Generation in progress"}</div>}<div><strong>{media.provider.toUpperCase()} · {media.mediaType}</strong><b className={`status-${media.status}`}>{media.status}</b><p>{media.error??media.prompt}</p><div className="pack-item-actions">{media.status==="generating"&&<button disabled={mediaBusy===media.id} onClick={()=>void refreshMedia(media.id)}>Refresh {media.provider==="comfyui"?"ComfyUI":"Kling"} task</button>}{["ready","approved","rejected"].includes(media.status)&&<><button onClick={()=>void reviewMedia(media.id,"approved")}>Approve</button><button onClick={()=>void reviewMedia(media.id,"rejected")}>Reject</button></>}</div></div></article>)}</div></div>}</section>}
        </div>}
      </main>
    </div>
  );
}
