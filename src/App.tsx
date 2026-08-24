import { useEffect, useMemo, useState } from "react";
import type { AiSettings, ArtistAlias, DatabaseHealth, GeneratedCampaignDraft, ReleaseSummary, SystemStatus } from "../electron/shared/contracts";
import { artists } from "./data/artists";

const modules = ["Release", "Content", "Visuals", "Schedule", "Website", "Engagement", "Trends", "Analytics", "Business", "Memory"];

export function App() {
  const [selectedArtist, setSelectedArtist] = useState<ArtistAlias>("the-arkadiusz");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [database, setDatabase] = useState<DatabaseHealth | null>(null);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
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
        const [system, databaseHealth, savedReleases, savedAiSettings] = await Promise.all([
          window.studio!.getSystemStatus(),
          window.studio!.getDatabaseHealth(),
          window.studio!.listReleases(),
          window.studio!.getAiSettings()
        ]);
        setStatus(system);
        setDatabase(databaseHealth);
        setReleases(savedReleases);
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
      setGeneratedDraft(result);
      setGenerationState("idle");
      setGenerationMessage(`Generated locally with ${result.model}`);
    } catch (error) {
      setGenerationState("error");
      const message = error instanceof Error ? error.message : "Ollama generation failed";
      setGenerationMessage(message.includes("TimeoutError")
        ? "The model did not respond within 5 minutes. Check whether it fits in GPU memory or select a smaller variant."
        : message.replace(/^Error invoking remote method '[^']+': Error: /, ""));
    }
  }

  async function saveRelease() {
    if (!window.studio) return;
    setSaveMessage("Saving...");
    try {
      const created = await window.studio.createReleaseDraft({
        artistId: selectedArtist,
        title,
        primaryGenre: artist.genres[0],
        story,
        releaseDate: releaseDate || null
      });
      setReleases((current) => [created, ...current]);
      setSaveMessage("Release draft saved locally");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save release");
    }
  }

  const fallbackDraft = `${artist.name} presents ${title}.\n\n${story}\n\nA ${artist.genres[0]} transmission shaped for listeners who want more than background music.`;
  const draft = generatedDraft?.content ?? fallbackDraft;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span>SONIC—ARK</span><strong>AI Studio Manager</strong></div>
        <nav>{modules.map((module, index) => <button className={index === 0 ? "active" : ""} key={module}>{module}</button>)}</nav>
        <div className="system-card">
          <span className={`dot ${status?.ollama.available ? "online" : ""}`} />
          <div><strong>{status?.ollama.available ? "Ollama connected" : "Ollama offline"}</strong><small>{status?.ollama.models.length ?? 0} local models</small></div>
        </div>
        <div className="system-card">
          <span className={`dot ${database?.ready ? "online" : ""}`} />
          <div><strong>{database?.ready ? `SQLite schema v${database.schemaVersion}` : "SQLite starting"}</strong><small>{releases.length} saved releases</small></div>
        </div>
      </aside>

      <main>
        {bridgeError && <div className="bridge-error">{bridgeError}</div>}
        <header>
          <div><span className="eyebrow">Release Manager</span><h1>Turn one track into a complete campaign.</h1></div>
          <button className="primary" onClick={saveRelease}>Save release draft</button>
        </header>

        <section className="artist-strip">
          {artists.map((profile) => (
            <button className={profile.id === selectedArtist ? "selected" : ""} key={profile.id} onClick={() => setSelectedArtist(profile.id)}>
              <strong>{profile.name}</strong><span>{profile.genres.slice(0, 2).join(" · ")}</span>
            </button>
          ))}
        </section>

        <div className="workspace">
          <section className="panel form-panel">
            <div className="panel-heading"><span className="eyebrow">01 / Source</span><h2>Release foundation</h2></div>
            <label>Track title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Artist<input value={artist.name} readOnly /></label>
            <label>Primary genre<input value={artist.genres[0]} readOnly /></label>
            <label>Release date<input type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} /></label>
            <label>Track story<textarea rows={6} value={story} onChange={(event) => setStory(event.target.value)} /></label>
            {saveMessage && <p className="save-message">{saveMessage}</p>}
            <div className="dropzone"><strong>Drop audio and cover here</strong><span>Media library arrives in the next milestone</span></div>
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
            <div className="architecture-note">
              <strong>Foundation status</strong>
              <ul>
                <li>React renderer isolated from Node.js</li>
                <li>Typed IPC through secure preload</li>
                <li>Four artist identities established</li>
                <li>Ollama model discovery connected</li>
              </ul>
            </div>
            <div className="release-list">
              <strong>Saved releases</strong>
              {releases.length === 0 ? <p>No releases saved yet.</p> : releases.slice(0, 6).map((release) => (
                <article key={release.id}><div><strong>{release.title}</strong><span>{release.artistName} · {release.primaryGenre}</span></div><b>{release.status}</b></article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
