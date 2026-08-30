import type { ReleaseStatus } from "../../../electron/shared/contracts";
import { AudioPlayer } from "../../AudioPlayer";

export function ReleaseSourcePanel(props: any) {
  const { title,setTitle,artist,primaryGenre,setPrimaryGenre,releaseDate,setReleaseDate,releaseStatus,setReleaseStatus,activeReleaseId,allowedReleaseStatuses,persistedStatus,story,setStory,saveMessage,attachAsset,assetMessage,assets,audioAnalyses,detachAsset,playbackUrls,analyzingAssetId,analyzeAsset,formatBytes,formatDuration } = props;
  return (
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
            {assets.length > 0 && <div className="asset-list-local">{assets.map((asset: any) => {
              const analysis = audioAnalyses[asset.id];
              return <article key={asset.id}><b>{asset.kind}</b><div><div className="asset-title"><strong>{asset.fileName}</strong><button onClick={() => void detachAsset(asset.id)}>Detach</button></div><span>{formatBytes(asset.sizeBytes)} · {asset.mimeType ?? "unknown type"}{asset.width && asset.height ? ` · ${asset.width} × ${asset.height}px` : ""}</span><small title={asset.filePath}>{asset.filePath}</small>
                {asset.kind === "cover" && asset.width && asset.height && (asset.width !== asset.height || asset.width < 3000) && <small className="asset-warning">Cover recommendation: square artwork, at least 3000 × 3000 px.</small>}
                {asset.kind === "audio" && playbackUrls[asset.id] && <AudioPlayer source={playbackUrls[asset.id]} title={asset.fileName} />}
                {asset.kind === "audio" && <div className="analysis-row">{analysis ? <><span><b>{formatDuration(analysis.durationSeconds)}</b> duration</span><span><b>{(analysis.sampleRate / 1000).toFixed(1)} kHz</b> sample rate</span><span><b>{analysis.bitDepth ?? "—"} bit</b> depth</span><span><b>{analysis.integratedLufs ?? "—"} LUFS</b> loudness</span><span><b>{analysis.truePeakDbtp ?? "—"} dBTP</b> peak</span>{analysis.loudnessRangeLu !== null && <span><b>{analysis.loudnessRangeLu} LU</b> range</span>}<span className="musical-result"><b>{analysis.bpm ?? "—"} BPM</b>{analysis.bpmConfidence !== null ? `${analysis.bpmConfidence}% confidence` : "tempo unavailable"}{analysis.alternateBpm !== null && <small>alt. {analysis.alternateBpm}</small>}</span><span className="musical-result"><b>{analysis.musicalKey ?? "—"}</b>{analysis.keyConfidence !== null ? `${analysis.keyConfidence}% confidence` : "key unavailable"}{analysis.alternateKey && <small>alt. {analysis.alternateKey}</small>}</span></> : <span>No analysis saved</span>}<button disabled={analyzingAssetId === asset.id} onClick={() => void analyzeAsset(asset.id)}>{analyzingAssetId === asset.id ? "Analyzing..." : analysis ? "Analyze again" : "Analyze audio"}</button></div>}
                {analysis?.note && <small className="analysis-note">{analysis.note}</small>}
              </div></article>;
            })}</div>}
          </section>
  );
}
