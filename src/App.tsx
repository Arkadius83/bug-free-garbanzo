import { useEffect, useMemo, useState } from "react";
import type { ArtistAlias, SystemStatus } from "../electron/shared/contracts";
import { artists } from "./data/artists";

const modules = ["Release", "Content", "Visuals", "Schedule", "Website", "Engagement", "Trends", "Analytics", "Business", "Memory"];

export function App() {
  const [selectedArtist, setSelectedArtist] = useState<ArtistAlias>("the-arkadiusz");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [title, setTitle] = useState("Different Perspective");
  const [story, setStory] = useState("Seeing beyond ego reveals another perspective.");
  const artist = useMemo(() => artists.find((item) => item.id === selectedArtist) ?? artists[0], [selectedArtist]);

  useEffect(() => {
    if (window.studio) void window.studio.getSystemStatus().then(setStatus);
  }, []);

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
      </aside>

      <main>
        <header>
          <div><span className="eyebrow">Release Manager</span><h1>Turn one track into a complete campaign.</h1></div>
          <button className="primary">Generate campaign</button>
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
            <label>Track story<textarea rows={6} value={story} onChange={(event) => setStory(event.target.value)} /></label>
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
          </section>
        </div>
      </main>
    </div>
  );
}
