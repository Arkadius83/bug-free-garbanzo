import { useEffect, useMemo, useState } from "react";
import type { AiSettings, AssetKind, AssetSummary, AudioAnalysisSummary, ArtistAlias, BrandProfile, CampaignChannel, CampaignPackItem, CatalogMatchSuggestion, DatabaseHealth, DraftStatus, DraftSummary, GeneratedCampaignDraft, LocalServiceStatus, MediaAspectRatio, MediaBridgeStatus, MediaGenerationSettings, MediaGenerationSummary, MediaProvider, MetaConnection, PublishingQueueItem, PublishingStatus, ReleaseReadiness, ReleaseStatus, ReleaseSummary, SoundCloudCatalogStatus, SoundCloudConnection, SoundCloudContentType, SoundCloudTrackPerformance, SoundCloudTrackSummary, SpotifyConnection, SpotifyReleaseSummary, SystemStatus, TaskAssignee, TaskPriority, TaskStatus, TaskSummary } from "../electron/shared/contracts";
import { artists } from "./data/artists";
import { AudioPlayer } from "./AudioPlayer";
import { ContactsPage } from "./features/contacts/ContactsPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { CampaignPackPanel } from "./features/ai-studio/CampaignPackPanel";
import { ReleaseSourcePanel } from "./features/releases/ReleaseSourcePanel";
import { CampaignDraftPanel } from "./features/releases/CampaignDraftPanel";
import { MetaPanel } from "./features/integrations/MetaPanel";
import { MediaBridgePanel } from "./features/integrations/MediaBridgePanel";
import { MediaProvidersPanel } from "./features/integrations/MediaProvidersPanel";
import { SoundCloudPanel } from "./features/integrations/SoundCloudPanel";
import { SpotifyPanel } from "./features/integrations/SpotifyPanel";
import { useReleaseManager } from "./features/releases/useReleaseManager";
import { useAiStudio } from "./features/ai-studio/useAiStudio";
import { usePublishing } from "./features/publishing/usePublishing";
import { useIntegrations } from "./features/integrations/useIntegrations";

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
  const { releases, setReleases, activeReleaseId, setActiveReleaseId, assets, setAssets, assetMessage, setAssetMessage, audioAnalyses, setAudioAnalyses, playbackUrls, setPlaybackUrls, analyzingAssetId, setAnalyzingAssetId, releaseReadiness, setReleaseReadiness, saveMessage, setSaveMessage, title, setTitle, story, setStory, releaseDate, setReleaseDate, primaryGenre, setPrimaryGenre, releaseStatus, setReleaseStatus } = useReleaseManager();
  const { drafts, setDrafts, aiSettings, setAiSettings, generatedDraft, setGeneratedDraft, generationState, setGenerationState, generationMessage, setGenerationMessage, campaignPackItems, setCampaignPackItems, campaignPackBusy, setCampaignPackBusy, campaignPackMessage, setCampaignPackMessage, mediaGenerations, setMediaGenerations, mediaUrls, setMediaUrls, mediaBusy, setMediaBusy, mediaMessage, setMediaMessage } = useAiStudio();
  const { publishingQueue, setPublishingQueue, publishingPlatform, setPublishingPlatform, publishingCaptionId, setPublishingCaptionId, publishingMediaId, setPublishingMediaId, publishingDate, setPublishingDate, publishingMessage, setPublishingMessage, metaDestinationByItem, setMetaDestinationByItem, metaQueueItemId, setMetaQueueItemId } = usePublishing();
  const { soundCloud, setSoundCloud, soundCloudTracks, setSoundCloudTracks, soundCloudClientId, setSoundCloudClientId, soundCloudClientSecret, setSoundCloudClientSecret, soundCloudMessage, setSoundCloudMessage, soundCloudBusy, setSoundCloudBusy, catalogQuery, setCatalogQuery, catalogStatusFilter, setCatalogStatusFilter, catalogArtistFilter, setCatalogArtistFilter, catalogSort, setCatalogSort, selectedPerformanceTrackId, setSelectedPerformanceTrackId, trackPerformance, setTrackPerformance, spotify, setSpotify, spotifyClientId, setSpotifyClientId, spotifyArtistIds, setSpotifyArtistIds, spotifyReleases, setSpotifyReleases, spotifyMessage, setSpotifyMessage, spotifyBusy, setSpotifyBusy, catalogMatches, setCatalogMatches, mediaSettings, setMediaSettings, openAiKey, setOpenAiKey, klingKey, setKlingKey, comfyUiUrl, setComfyUiUrl, comfyUiCheckpoint, setComfyUiCheckpoint, localServices, setLocalServices, localServiceBusy, setLocalServiceBusy, meta, setMeta, metaAppId, setMetaAppId, metaAppSecret, setMetaAppSecret, metaConfigurationId, setMetaConfigurationId, metaBusy, setMetaBusy, metaMessage, setMetaMessage, mediaBridge, setMediaBridge, r2AccountId, setR2AccountId, r2Bucket, setR2Bucket, r2AccessKeyId, setR2AccessKeyId, r2SecretAccessKey, setR2SecretAccessKey, bridgeBusy, setBridgeBusy, bridgeMessage, setBridgeMessage } = useIntegrations();
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [selectedArtist, setSelectedArtist] = useState<ArtistAlias>("the-arkadiusz");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [database, setDatabase] = useState<DatabaseHealth | null>(null);
  const [bridgeError, setBridgeError] = useState("");
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskAssignee, setTaskAssignee] = useState<TaskAssignee>("human");
  const [taskMessage, setTaskMessage] = useState("");
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [brandProfiles,setBrandProfiles]=useState<BrandProfile[]>([]);const [brandDraft,setBrandDraft]=useState<BrandProfile|null>(null);const [brandMessage,setBrandMessage]=useState("");const [imageAspect,setImageAspect]=useState<"default"|MediaAspectRatio>("default");
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

        {activeView === "calendar" && TasksPage({tasks,taskTitle,setTaskTitle,taskPriority,setTaskPriority,taskAssignee,setTaskAssignee,taskDueAt,setTaskDueAt,activeReleaseId,createTask,taskMessage,runningTaskId,changeTaskStatus,runTaskAgent,meta,publishingQueue,metaQueueItemId,setMetaQueueItemId,metaDestinationByItem,setMetaDestinationByItem,publishMetaItem,releases,selectRelease,publishingPlatform,setPublishingPlatform,publishingCaptionId,setPublishingCaptionId,campaignPackItems,publishingMediaId,setPublishingMediaId,mediaGenerations,publishingDate,setPublishingDate,publishingMessage,addPublishingItem,changePublishingStatus,exportPublishingPack})}

        {activeView==="settings"&&<div className="page-content brand-settings-page"><header><div><span className="eyebrow">Prompt Templates & Brand Profiles V1</span><h1>Keep every alias visually consistent.</h1><p>These rules are automatically added to approved image and video prompts before generation.</p></div></header><div className="brand-profile-layout"><aside>{brandProfiles.map((profile)=><button className={brandDraft?.artistId===profile.artistId?"selected":""} key={profile.artistId} onClick={()=>setBrandDraft(profile)}><strong>{profile.artistName}</strong><span>{profile.defaultAspectRatio} default · {profile.palette}</span></button>)}</aside>{brandDraft&&<section className="panel brand-editor"><div className="brand-editor-heading"><div><span className="eyebrow">{brandDraft.artistName}</span><h2>Visual identity template</h2></div><label>Default format<select value={brandDraft.defaultAspectRatio} onChange={(event)=>setBrandDraft({...brandDraft,defaultAspectRatio:event.target.value as MediaAspectRatio})}>{(["1:1","4:5","9:16","16:9"] as MediaAspectRatio[]).map((ratio)=><option key={ratio}>{ratio}</option>)}</select></label></div><label>Visual direction<textarea rows={3} value={brandDraft.visualDirection} onChange={(event)=>setBrandDraft({...brandDraft,visualDirection:event.target.value})}/></label><div className="brand-two-columns"><label>Color palette<textarea rows={3} value={brandDraft.palette} onChange={(event)=>setBrandDraft({...brandDraft,palette:event.target.value})}/></label><label>Typography and layout<textarea rows={3} value={brandDraft.typography} onChange={(event)=>setBrandDraft({...brandDraft,typography:event.target.value})}/></label><label>Required elements<textarea rows={4} value={brandDraft.requiredElements} onChange={(event)=>setBrandDraft({...brandDraft,requiredElements:event.target.value})}/></label><label>Forbidden elements<textarea rows={4} value={brandDraft.forbiddenElements} onChange={(event)=>setBrandDraft({...brandDraft,forbiddenElements:event.target.value})}/></label></div><label>ComfyUI negative prompt<textarea rows={4} value={brandDraft.negativePrompt} onChange={(event)=>setBrandDraft({...brandDraft,negativePrompt:event.target.value})}/></label><div className="brand-save-row"><p>{brandMessage||"The original campaign prompt is preserved; this profile is appended only at generation time."}</p><button className="primary" onClick={()=>void saveBrandProfile()}>Save brand profile</button></div></section>}</div></div>}

        {activeView === "integrations" && <div className="page-content integrations-page">
          <SoundCloudPanel connection={soundCloud} tracks={soundCloudTracks} visibleTracks={visibleSoundCloudTracks} releases={releases} totals={soundCloudTotals} clientId={soundCloudClientId} clientSecret={soundCloudClientSecret} message={soundCloudMessage} busy={soundCloudBusy} query={catalogQuery} statusFilter={catalogStatusFilter} artistFilter={catalogArtistFilter} sort={catalogSort} selectedPerformanceTrackId={selectedPerformanceTrackId} trackPerformance={trackPerformance} onClientIdChange={setSoundCloudClientId} onClientSecretChange={setSoundCloudClientSecret} onSaveCredentials={saveSoundCloudCredentials} onConnect={connectSoundCloud} onSync={syncSoundCloudCatalog} onDisconnect={disconnectSoundCloud} onQueryChange={setCatalogQuery} onStatusFilterChange={setCatalogStatusFilter} onArtistFilterChange={setCatalogArtistFilter} onSortChange={setCatalogSort} onMarkVisibleBootlegs={markVisibleTracksAsBootlegs} onClassify={classifySoundCloudTrack} onLink={linkSoundCloudTrack} onCreateLocal={createLocalEntryFromSoundCloud} onTogglePerformance={toggleTrackPerformance} />
          <MetaPanel meta={meta} appId={metaAppId} appSecret={metaAppSecret} configurationId={metaConfigurationId} busy={metaBusy} message={metaMessage} onAppIdChange={setMetaAppId} onAppSecretChange={setMetaAppSecret} onConfigurationIdChange={setMetaConfigurationId} onSave={saveMetaCredentials} onConnect={connectMeta} onDisconnect={disconnectMeta} />
          <MediaBridgePanel status={mediaBridge} accountId={r2AccountId} bucket={r2Bucket} accessKeyId={r2AccessKeyId} secretAccessKey={r2SecretAccessKey} busy={bridgeBusy} message={bridgeMessage} onAccountIdChange={setR2AccountId} onBucketChange={setR2Bucket} onAccessKeyIdChange={setR2AccessKeyId} onSecretAccessKeyChange={setR2SecretAccessKey} onSave={saveMediaBridge} />
          <MediaProvidersPanel localServices={localServices} localServiceBusy={localServiceBusy} mediaSettings={mediaSettings} openAiKey={openAiKey} klingKey={klingKey} mediaMessage={mediaMessage} comfyUiUrl={comfyUiUrl} comfyUiCheckpoint={comfyUiCheckpoint} onAutoStartChange={toggleServiceAutoStart} onChooseComfyLauncher={chooseComfyLauncher} onToggleLocalService={toggleLocalService} onOpenAiKeyChange={setOpenAiKey} onKlingKeyChange={setKlingKey} onSaveCredentials={saveMediaCredentials} onComfyUiUrlChange={setComfyUiUrl} onTestComfyUi={testComfyUi} onComfyUiCheckpointChange={setComfyUiCheckpoint} onSaveComfyUi={saveComfyUi} />
          <SpotifyPanel spotify={spotify} clientId={spotifyClientId} artistIds={spotifyArtistIds} releases={releases} spotifyReleases={spotifyReleases} matches={catalogMatches} message={spotifyMessage} busy={spotifyBusy} onClientIdChange={setSpotifyClientId} onArtistIdsChange={setSpotifyArtistIds} onSave={saveSpotifyConfiguration} onConnect={connectSpotify} onSync={syncSpotifyCatalog} onAcceptMatch={acceptCatalogMatch} onLinkRelease={linkSpotifyRelease} />
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
          <ReleaseSourcePanel title={title} setTitle={setTitle} artist={artist} primaryGenre={primaryGenre} setPrimaryGenre={setPrimaryGenre} releaseDate={releaseDate} setReleaseDate={setReleaseDate} releaseStatus={releaseStatus} setReleaseStatus={setReleaseStatus} activeReleaseId={activeReleaseId} allowedReleaseStatuses={allowedReleaseStatuses} persistedStatus={persistedStatus} story={story} setStory={setStory} saveMessage={saveMessage} attachAsset={attachAsset} assetMessage={assetMessage} assets={assets} audioAnalyses={audioAnalyses} detachAsset={detachAsset} playbackUrls={playbackUrls} analyzingAssetId={analyzingAssetId} analyzeAsset={analyzeAsset} formatBytes={formatBytes} formatDuration={formatDuration} />

          <CampaignDraftPanel aiSettings={aiSettings} updateAiSettings={updateAiSettings} status={status} generationState={generationState} generateWithOllama={generateWithOllama} generationMessage={generationMessage} generatedDraft={generatedDraft} draft={draft} releases={releases} activeReleaseId={activeReleaseId} selectRelease={selectRelease} deleteRelease={deleteRelease} drafts={drafts} nextDraftActions={nextDraftActions} changeDraftStatus={changeDraftStatus} />
        </div>
        {activeView === "ai-studio" && <CampaignPackPanel campaignPackBusy={campaignPackBusy} activeReleaseId={activeReleaseId} aiSettings={aiSettings} generateCampaignPack={generateCampaignPack} campaignPackMessage={campaignPackMessage} mediaMessage={mediaMessage} campaignPackItems={campaignPackItems} nextDraftActions={nextDraftActions} changeCampaignPackStatus={changeCampaignPackStatus} mediaBusy={mediaBusy} mediaSettings={mediaSettings} generateMedia={generateMedia} mediaGenerations={mediaGenerations} mediaUrls={mediaUrls} refreshMedia={refreshMedia} reviewMedia={reviewMedia} />}
        </div>}
      </main>
    </div>
  );
}
