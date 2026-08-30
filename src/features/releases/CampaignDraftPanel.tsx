import type { AiSettings } from "../../../electron/shared/contracts";

export function CampaignDraftPanel(props: any) {
  const { aiSettings,updateAiSettings,status,generationState,generateWithOllama,generationMessage,generatedDraft,draft,releases,activeReleaseId,selectRelease,deleteRelease,drafts,nextDraftActions,changeDraftStatus } = props;
  return (
<section className="panel output-panel">
            <div className="panel-heading"><span className="eyebrow">02 / Draft</span><h2>Campaign preview</h2></div>
            <div className="ai-controls">
              <label>Local model<select value={aiSettings.model ?? ""} onChange={(event) => void updateAiSettings({ ...aiSettings, model: event.target.value || null })}>
                {status?.ollama.models.length ? status.ollama.models.map((model: any) => <option key={model.name} value={model.name}>{model.name}</option>) : <option value="">No models available</option>}
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
              {releases.length === 0 ? <p>No releases saved yet.</p> : releases.slice(0, 6).map((release: any) => (
                <article className={activeReleaseId === release.id ? "active-release" : ""} key={release.id} onClick={() => void selectRelease(release)}><div><strong>{release.title}</strong><span>{release.artistName} · {release.primaryGenre}</span></div><div className="release-item-actions"><b>{activeReleaseId === release.id ? "ACTIVE" : release.status}</b><button title="Delete release" onClick={(event) => { event.stopPropagation(); void deleteRelease(release); }}>Delete</button></div></article>
              ))}
            </div>
            <div className="draft-workflow">
              <strong>Campaign drafts</strong>
              {drafts.length === 0 ? <p>No AI drafts saved yet.</p> : drafts.slice(0, 8).map((item: any) => (
                <article key={item.id}>
                  <div className="draft-summary"><strong>{item.channel} · {item.language.toUpperCase()}</strong><span>{item.releaseTitle} · {item.model}</span><p>{item.content}</p></div>
                  <div className="draft-actions"><b className={`status-${item.status}`}>{item.status}</b>{nextDraftActions(item.status).map((next: any) => <button key={next} onClick={() => void changeDraftStatus(item.id, next)}>{next}</button>)}</div>
                </article>
              ))}
            </div>
          </section>
  );
}
