import { useEffect, useMemo, useState } from "react";
import type { AiSettings, AssetKind, AssetSummary, AudioAnalysisSummary, ArtistAlias, DatabaseHealth, DraftStatus, DraftSummary, GeneratedCampaignDraft, ReleaseReadiness, ReleaseStatus, ReleaseSummary, SoundCloudCatalogStatus, SoundCloudConnection, SoundCloudContentType, SoundCloudTrackSummary, SystemStatus, TaskAssignee, TaskPriority, TaskStatus, TaskSummary } from "../electron/shared/contracts";
import { artists } from "./data/artists";

type AppView = "overview" | "releases" | "ai-studio" | "calendar" | "integrations";

const navigation: Array<{ id: AppView | "placeholder"; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "releases", label: "Releases", icon: "♫" },
  { id: "ai-studio", label: "AI Studio", icon: "✦" },
  { id: "calendar", label: "Tasks & Calendar", icon: "□" },
  { id: "placeholder", label: "Analytics", icon: "⌁" },
  { id: "placeholder", label: "Contacts", icon: "◎" }
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
    if (activeView === "calendar" && window.studio) void window.studio.listTasks().then(setTasks).catch((error) => setTaskMessage(error instanceof Error ? error.message : "Could not load tasks"));
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "integrations" || !window.studio) return;
    void Promise.all([window.studio.getSoundCloudConnection(), window.studio.listSoundCloudTracks()]).then(([connection, tracks]) => { setSoundCloud(connection); setSoundCloudTracks(tracks); }).catch((error) => setSoundCloudMessage(error instanceof Error ? error.message : "Could not load SoundCloud integration"));
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
        <nav className="secondary-nav"><button className={activeView === "integrations" ? "active" : ""} onClick={() => setActiveView("integrations")}><span>⌘</span>Integrations<i className={`status-light ${soundCloud?.connected ? "connected" : ""}`} /></button><button><span>⚙</span>Settings</button></nav>
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

        {activeView === "calendar" && <div className="page-content tasks-page">
          <header><div><span className="eyebrow">Tasks, Calendar & Agents</span><h1>Plan the release work.</h1><p>Human decisions, local AI assistance and automatic readiness checks in one queue.</p></div></header>
          <section className="task-creator panel"><input placeholder="New task title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /><select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select><select value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value as TaskAssignee)}><option value="human">Human</option><option value="ai">AI Agent</option><option value="automatic">Automatic</option></select><input type="date" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /><button className="primary" disabled={!taskTitle.trim() || !activeReleaseId} onClick={() => void createTask()}>Add task</button></section>
          {taskMessage && <p className="task-message">{taskMessage}</p>}
          <div className="task-board">
            {(["doing","todo","done"] as TaskStatus[]).map((column) => <section className="task-column" key={column}><div className="task-column-title"><strong>{column === "doing" ? "In progress" : column === "todo" ? "To do" : "Done"}</strong><span>{tasks.filter((task) => task.status === column).length}</span></div>{tasks.filter((task) => task.status === column).map((task) => <article className={`managed-task priority-${task.priority}`} key={task.id}><div className="managed-task-meta"><span>{task.assignee === "ai" ? "✦ AI AGENT" : task.assignee === "automatic" ? "⚙ AUTOMATIC" : "● HUMAN"}</span><b>{task.priority}</b></div><h3>{task.title}</h3><p>{task.releaseTitle ?? "No release"}{task.dueAt ? ` · due ${task.dueAt}` : ""}</p>{task.agentOutput && <div className="agent-output"><strong>Agent result · {task.model}</strong><p>{task.agentOutput}</p><small>Human review required</small></div>}<div className="managed-task-actions">{column !== "doing" && column !== "done" && <button onClick={() => void changeTaskStatus(task.id, "doing")}>Start</button>}{column !== "done" && <button onClick={() => void changeTaskStatus(task.id, "done")}>Done</button>}{column === "done" && <button onClick={() => void changeTaskStatus(task.id, "todo")}>Reopen</button>}{task.assignee === "ai" && column !== "done" && <button className="agent-button" disabled={runningTaskId === task.id} onClick={() => void runTaskAgent(task.id)}>{runningTaskId === task.id ? "Working..." : "Run agent"}</button>}</div></article>)}</section>)}
          </div>
        </div>}

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
              {soundCloudTracks.length === 0 ? <div className="empty-catalog"><span>♫</span><strong>No SoundCloud tracks imported yet</strong><p>Connect your account and select Sync catalog. Nothing is published or changed on SoundCloud.</p></div> : <><div className="catalog-tools"><input placeholder="Search title, genre or tags..." value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} /><select value={catalogStatusFilter} onChange={(event) => setCatalogStatusFilter(event.target.value as SoundCloudCatalogStatus | "all")}><option value="all">All statuses</option><option value="unreviewed">Unreviewed</option><option value="release">Release</option><option value="gem">Gem</option><option value="archive">Archive</option><option value="exclude">Exclude</option></select><select value={catalogArtistFilter} onChange={(event) => setCatalogArtistFilter(event.target.value as ArtistAlias | "all" | "unassigned")}><option value="all">All aliases</option><option value="unassigned">Unassigned</option>{artists.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)}><option value="engagement">Best engagement</option><option value="plays">Most plays</option><option value="likes">Most likes</option><option value="newest">Newest</option></select><b>{visibleSoundCloudTracks.length} shown</b><button onClick={() => void markVisibleTracksAsBootlegs()}>Mark visible as Bootleg</button></div><div className="soundcloud-track-list">{visibleSoundCloudTracks.map((track) => <article className={`catalog-${track.catalogStatus}`} key={track.id}>{track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <span className="track-placeholder">♫</span>}<div className="track-main"><strong>{track.title}</strong><small>{new Date(track.createdAt).toLocaleDateString()} · {track.genre ?? "No genre"} · {Math.round(track.durationMs / 6000) / 10} min</small>{track.contentType === "bootleg" && <b className="rights-warning">BOOTLEG · RIGHTS NOT CLEARED · OFFICIAL RELEASE BLOCKED</b>}<div className="track-classification"><select aria-label="Artist alias" value={track.artistId ?? ""} onChange={(event) => void classifySoundCloudTrack(track, (event.target.value || null) as ArtistAlias | null, track.catalogStatus, track.contentType)}><option value="">Unassigned alias</option>{artists.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select><select aria-label="Content type" value={track.contentType} onChange={(event) => void classifySoundCloudTrack(track, track.artistId, track.catalogStatus === "release" && event.target.value === "bootleg" ? "unreviewed" : track.catalogStatus, event.target.value as SoundCloudContentType)}><option value="original">Original</option><option value="bootleg">Bootleg</option><option value="official-remix">Official remix</option><option value="edit">Edit</option><option value="dj-set">DJ set</option></select><select aria-label="Catalog status" value={track.catalogStatus} onChange={(event) => void classifySoundCloudTrack(track, track.artistId, event.target.value as SoundCloudCatalogStatus, track.contentType)}><option value="unreviewed">Unreviewed</option><option value="release" disabled={track.contentType === "bootleg"}>Release</option><option value="gem">Gem</option><option value="archive">Archive</option><option value="exclude">Exclude</option></select></div><div className="release-link-row"><select aria-label="Linked release" value={track.releaseId ?? ""} onChange={(event) => void linkSoundCloudTrack(track, event.target.value || null)}><option value="">Not linked to Release Manager</option>{releases.filter((release) => !soundCloudTracks.some((item) => item.releaseId === release.id && item.id !== track.id)).map((release) => <option value={release.id} key={release.id}>{release.title} · {release.artistName}</option>)}</select>{!track.releaseId && <button disabled={!track.artistId} onClick={() => void createLocalEntryFromSoundCloud(track)}>Create local entry</button>}{track.releaseId && <b>↗ {track.releaseTitle}</b>}</div></div><div className="track-stats"><span><b>{track.playbackCount ?? "—"}</b> plays</span><span><b>{track.likesCount ?? "—"}</b> likes</span><span><b>{track.commentCount ?? "—"}</b> comments</span><span className="engagement-stat"><b>{track.engagementRate === null ? "—" : `${track.engagementRate}%`}</b> engagement<small>score {track.engagementScore}</small></span></div><b className="sharing-label">{track.sharing}</b></article>)}</div></>}
            </section>
          </div>
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
        </div>}
      </main>
    </div>
  );
}
