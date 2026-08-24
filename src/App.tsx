import { useEffect, useMemo, useState } from "react";
import type { ArtistAlias, DatabaseHealth, ReleaseSummary, SystemStatus } from "../electron/shared/contracts";
import { artists } from "./data/artists";

const modules = ["Release", "Content", "Visuals", "Schedule", "Website", "Engagement", "Trends", "Analytics", "Business", "Memory"];

export function App() {
  const [selectedArtist, setSelectedArtist] = useState<ArtistAlias>("the-arkadiusz");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [database, setDatabase] = useState<DatabaseHealth | null>(null);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [bridgeError, setBridgeError] = useState("");
  const [title, setTitle] = useState("Different Perspective");
  const [story, setStory] = useState("Seeing beyond ego reveals another perspective.");
  const [releaseDate, setReleaseDate] = useState("");
  const artist = useMemo(() => artists.find((item) => item.id === selectedArtist) ?? artists[0], [selectedArtist]);

  useEffect(() => {
    if (!window.studio) {
      setBridgeError("Desktop bridge unavailable — restart after updating the application.");
      return;
    }
    void Promise.all([
      window.studio.getSystemStatus().then(setStatus),
      window.studio.getDatabaseHealth().then(setDatabase),
      window.studio.listReleases().then(setReleases)
    ]);
  }, []);

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

  const draft = `${artist.name} presents ${title}.\n\n${story}\n\nA ${artist.genres[0]} transmission shaped for listeners who want more than background music.`;

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
            <div className="draft"><span>Instagram · English</span><pre>{draft}</pre></div>
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
