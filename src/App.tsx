import { useEffect, useMemo, useState } from "react";
import type { AiSettings, AssetKind, AssetSummary, AudioAnalysisSummary, ArtistAlias, DatabaseHealth, DraftStatus, DraftSummary, GeneratedCampaignDraft, ReleaseSummary, SystemStatus } from "../electron/shared/contracts";
import { artists } from "./data/artists";

type AppView = "overview" | "releases" | "ai-studio";

const navigation: Array<{ id: AppView | "placeholder"; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "releases", label: "Releases", icon: "♫" },
  { id: "ai-studio", label: "AI Studio", icon: "✦" },
  { id: "placeholder", label: "Calendar", icon: "□" },
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
  const [saveMessage, setSaveMessage] = useState("");
  const [bridgeError, setBridgeError] = useState("");
  const [aiSettings, setAiSettings] = useState<AiSettings>({ model: null, language: "en", channel: "Instagram" });
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedCampaignDraft | null>(null);
  const [generationState, setGenerationState] = useState<"idle" | "generating" | "error">("idle");
  const [generationMessage, setGenerationMessage] = useState("");
  const [title, setTitle] = useState("Different Perspective");
  const [story, setStory] = useState("Seeing beyond ego reveals another perspective.");
  const [releaseDate, setReleaseDate] = useState("");
  const artist = useMemo(() => artists.find((item) => item.id === selectedArtist) ?? artists[0], [selectedArtist]);

  useEffect(() => {
    if (!window.studio) {
      setBridgeError("Desktop bridge unavailable — restart after updating the application.");
      return;
    }
    void (async () => {
      try {
        const [system, databaseHealth, savedReleases, savedDrafts, savedAiSettings] = await Promise.all([
          window.studio!.getSystemStatus(),
          window.studio!.getDatabaseHealth(),
          window.studio!.listReleases(),
          window.studio!.listDrafts(),
          window.studio!.getAiSettings()
        ]);
        setStatus(system);
        setDatabase(databaseHealth);
        setReleases(savedReleases);
        setDrafts(savedDrafts);
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

  async function updateAiSettings(next: AiSettings) {
    setAiSettings(next);
    if (!window.studio) return;
    try { setAiSettings(await window.studio.saveAiSettings(next)); }
    catch (error) { setGenerationMessage(error instanceof Error ? error.message : "Could not save AI settings"); }
  }

  async function generateWithOllama() {
    if (!window.studio || !aiSettings.model) {
      setGenerationState("error");
      setGenerationMessage("Select a local Ollama model first.");
      return;
    }
    setGenerationState("generating");
    setGenerationMessage(`Generating with ${aiSettings.model}...`);
    try {
      const releaseId = activeReleaseId ?? (await persistRelease()).id;
      const result = await window.studio.generateCampaignDraft({
        ...aiSettings,
        model: aiSettings.model,
        artistId: selectedArtist,
        artistName: artist.name,
        artistVoice: artist.voice,
        title,
        primaryGenre: artist.genres[0],
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
      const existing = releases.find((release) => release.id === activeReleaseId);
      if (existing) return existing;
    }
    const created = await window.studio.createReleaseDraft({
      artistId: selectedArtist,
      title,
      primaryGenre: artist.genres[0],
      story,
      releaseDate: releaseDate || null
    });
    setReleases((current) => [created, ...current]);
    setActiveReleaseId(created.id);
    return created;
  }

  async function saveRelease() {
    setSaveMessage("Saving...");
    try {
      await persistRelease();
      setSaveMessage("Release draft saved locally");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save release");
    }
  }

  async function changeDraftStatus(draftId: string, status: DraftStatus) {
    if (!window.studio) return;
    try {
      const updated = await window.studio.updateDraftStatus(draftId, status);
      setDrafts((current) => current.map((draft) => draft.id === updated.id ? updated : draft));
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
    const releaseAssets = window.studio ? await window.studio.listAssets(release.id) : [];
    setAssets(releaseAssets);
    if (window.studio) {
      const analyses = await Promise.all(releaseAssets.filter((asset) => asset.kind === "audio").map(async (asset) => [asset.id, await window.studio!.getAudioAnalysis(asset.id)] as const));
      setAudioAnalyses(Object.fromEntries(analyses.filter((entry): entry is readonly [string, AudioAnalysisSummary] => entry[1] !== null)));
    }
    setAssetMessage(`Active release: ${release.title}`);
  }

  async function attachAsset(kind: AssetKind) {
    if (!window.studio) return;
    setAssetMessage(kind === "audio" ? "Choose the source audio file..." : "Choose the cover artwork...");
    try {
      const release = await persistRelease();
      const asset = await window.studio.selectAndAttachAsset(release.id, kind);
      if (!asset) {
        setAssetMessage("File selection cancelled");
        return;
      }
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
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
      setAssetMessage(analysis.status === "complete" ? "Audio analysis completed" : "Basic WAV analysis completed");
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Audio analysis failed");
    } finally {
      setAnalyzingAssetId(null);
    }
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

  const fallbackDraft = `${artist.name} presents ${title}.\n\n${story}\n\nA ${artist.genres[0]} transmission shaped for listeners who want more than background music.`;
  const draft = generatedDraft?.content ?? fallbackDraft;
  const currentRelease = releases.find((release) => release.id === activeReleaseId) ?? releases[0];
  const approvedDrafts = drafts.filter((item) => item.status === "approved" || item.status === "scheduled" || item.status === "published").length;
  const readiness = Math.min(100, 25 + (assets.some((item) => item.kind === "audio") ? 25 : 0) + (assets.some((item) => item.kind === "cover") ? 25 : 0) + (approvedDrafts > 0 ? 25 : 0));

  function openReleaseWorkspace(release?: ReleaseSummary) {
    if (release) void selectRelease(release);
    setActiveView("releases");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">▥</span><div><strong>AI MUSIC</strong><small>MANAGER</small></div></div>
        <nav>{navigation.map((item, index) => <button className={item.id === activeView ? "active" : ""} key={`${item.label}-${index}`} onClick={() => item.id !== "placeholder" && setActiveView(item.id)}><span>{item.icon}</span>{item.label}{item.label === "AI Studio" && <b>AI</b>}</button>)}</nav>
        <div className="nav-divider" />
        <nav className="secondary-nav"><button><span>⌘</span>Integrations<i className="status-light" /></button><button><span>⚙</span>Settings</button></nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-health"><span className={`dot ${status?.ollama.available && database?.ready ? "online" : ""}`} /><span>{status?.ollama.available && database?.ready ? "Local systems ready" : "Connecting local systems"}</span></div>
        <div className="user-card"><span className="avatar">A</span><div><strong>Arkadiusz</strong><small>Independent artist</small></div><b>•••</b></div>
      </aside>

      <main className="app-main">
        <div className="topbar"><div className="search">⌕<span>Search releases, tracks, tasks...</span><kbd>⌘ K</kbd></div><div className="top-actions"><span><i className={`dot ${status?.ollama.available && database?.ready ? "online" : ""}`} />{status?.ollama.available && database?.ready ? "All systems synced" : "Systems starting"}</span><button className="icon-button">♧</button><button className="primary" onClick={() => openReleaseWorkspace()}>+ New release</button></div></div>
        {bridgeError && <div className="bridge-error">{bridgeError}</div>}
        {activeView === "overview" && <div className="overview page-content">
          <div className="overview-heading"><div><span className="date-label">MONDAY, AUG 24</span><h1>Your music. <em>Ready for the world.</em></h1><p>Everything that needs your attention, in one place.</p></div><button className="daily-brief"><span>✦</span><small>AI DAILY BRIEF</small><strong>{Math.max(1, 3 - approvedDrafts)} smart actions →<br />ready</strong></button></div>
          <section className="release-hero">
            <div className="cover-art"><div className="orbit"><i /><i /></div><span>DIFFERENT<br />PERSPECTIVE</span><small>THE ARKADIUSZ</small></div>
            <div className="release-info"><span className="eyebrow">NEXT RELEASE · {releaseDate ? "scheduled" : "date pending"}</span><h2>{currentRelease?.title ?? title}</h2><p>{currentRelease?.artistName ?? artist.name} · Single · {currentRelease?.primaryGenre ?? artist.genres[0]}</p><div className="platforms"><span>↗ Spotify</span><span>◖ SoundCloud</span><span>♪ TikTok</span><span>+12</span></div></div>
            <div className="readiness" style={{ "--progress": `${readiness * 3.6}deg` } as React.CSSProperties}><div><strong>{readiness}%</strong><span>READY</span></div><small>Release readiness</small></div>
            <div className="release-steps"><div className="done"><b>✓</b><span>AUDIO<small>Master ready</small></span></div><div className="current"><b>2</b><span>IDENTITY<small>Artwork due</small></span></div><div><b>3</b><span>DELIVERY<small>Send to distributor</small></span></div><div><b>4</b><span>CAMPAIGN<small>Pre-save live</small></span></div><div><b>5</b><span>RELEASE<small>{releaseDate || "Set date"}</small></span></div></div>
          </section>
          <div className="dashboard-grid">
            <section className="dashboard-card focus-card"><div className="card-header"><div><span>YOUR FOCUS</span><h3>Move the release forward</h3></div><div className="tabs"><b>Tasks</b><span>Activity</span></div></div><div className="task done"><b>✓</b><i>WAV</i><div><strong>Final master approved</strong><small>Audio foundation complete</small></div><span>→</span></div><div className="task"><b /><i>ART</i><div><strong>Artwork export</strong><small>3000 × 3000 px · due today</small></div><span>→</span></div><div className="task"><b /><i>AI</i><div><strong>Spotify editorial pitch</strong><small>{approvedDrafts ? `${approvedDrafts} approved campaign draft${approvedDrafts === 1 ? "" : "s"}` : "Draft ready · review with AI"}</small></div><button onClick={() => setActiveView("ai-studio")}>Review →</button></div></section>
            <section className="dashboard-card intelligence-card"><div className="card-header"><div><span>AI RELEASE INTELLIGENCE</span><h3>Worth your attention</h3></div><b className="live">● LIVE</b></div><article><i>◷</i><div><small>TIMING</small><strong>Your pitch window is ready.</strong><p>Approve a campaign draft before sending it to editorial teams.</p><button onClick={() => setActiveView("ai-studio")}>Open pitch →</button></div></article><article><i>↗</i><div><small>MOMENTUM</small><strong>Local AI is connected.</strong><p>{status?.ollama.models.length ?? 0} models available for release content.</p></div></article></section>
          </div>
        </div>}

        {(activeView === "releases" || activeView === "ai-studio") && <div className="page-content release-page">
        <header>
          <div><span className="eyebrow">{activeView === "ai-studio" ? "AI Studio" : "Release Manager"}</span><h1>{activeView === "ai-studio" ? "Create campaign content." : "Build the next release."}</h1></div>
          <button className="primary" onClick={saveRelease}>Save release draft</button>
        </header>
        <section className="artist-strip">
          {artists.map((profile) => (
            <button className={profile.id === selectedArtist ? "selected" : ""} key={profile.id} onClick={() => setSelectedArtist(profile.id)}>
              <strong>{profile.name}</strong><span>{profile.genres.slice(0, 2).join(" · ")}</span>
            </button>
          ))}
        </section>

        <div className={`workspace ${activeView === "ai-studio" ? "ai-focus" : ""}`}>
          <section className="panel form-panel">
            <div className="panel-heading"><span className="eyebrow">01 / Source</span><h2>Release foundation</h2></div>
            <label>Track title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Artist<input value={artist.name} readOnly /></label>
            <label>Primary genre<input value={artist.genres[0]} readOnly /></label>
            <label>Release date<input type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} /></label>
            <label>Track story<textarea rows={6} value={story} onChange={(event) => setStory(event.target.value)} /></label>
            {saveMessage && <p className="save-message">{saveMessage}</p>}
            <div className="dropzone"><strong>Release media library</strong><span>Files remain in their original folders; the application stores secure references.</span><div className="asset-buttons"><button onClick={() => void attachAsset("audio")}>Choose audio</button><button onClick={() => void attachAsset("cover")}>Choose cover</button></div>{assetMessage && <p>{assetMessage}</p>}</div>
            {assets.length > 0 && <div className="asset-list-local">{assets.map((asset) => {
              const analysis = audioAnalyses[asset.id];
              return <article key={asset.id}><b>{asset.kind}</b><div><strong>{asset.fileName}</strong><span>{formatBytes(asset.sizeBytes)} · {asset.mimeType ?? "unknown type"}</span><small title={asset.filePath}>{asset.filePath}</small>
                {asset.kind === "audio" && <div className="analysis-row">{analysis ? <><span><b>{formatDuration(analysis.durationSeconds)}</b> duration</span><span><b>{(analysis.sampleRate / 1000).toFixed(1)} kHz</b> sample rate</span><span><b>{analysis.bitDepth ?? "—"} bit</b> depth</span><span><b>{analysis.integratedLufs ?? "—"} LUFS</b> loudness</span><span><b>{analysis.truePeakDbtp ?? "—"} dBTP</b> peak</span>{analysis.loudnessRangeLu !== null && <span><b>{analysis.loudnessRangeLu} LU</b> range</span>}</> : <span>No analysis saved</span>}<button disabled={analyzingAssetId === asset.id} onClick={() => void analyzeAsset(asset.id)}>{analyzingAssetId === asset.id ? "Analyzing..." : analysis ? "Analyze again" : "Analyze audio"}</button></div>}
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
                <article className={activeReleaseId === release.id ? "active-release" : ""} key={release.id} onClick={() => void selectRelease(release)}><div><strong>{release.title}</strong><span>{release.artistName} · {release.primaryGenre}</span></div><b>{activeReleaseId === release.id ? "ACTIVE" : release.status}</b></article>
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
