import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AssetKind, AssetSummary, ReleaseReadiness, ReleaseStatus } from "../../../electron/shared/contracts";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { Select } from "../../ui/Select";
import { StatusBadge } from "../../ui/StatusBadge";
import { SectionCard } from "../../ui/SectionCard";
import { MediaSurface } from "../../ui/MediaSurface";
import { SideDrawer } from "../../ui/SideDrawer";
import { DistroKidDistributionCard } from "./DistroKidDistributionCard";
import "./release-foundation.css";

interface Props {
  releaseId: string | null; title: string; artist: string; genre: string; date: string; story: string; status: ReleaseStatus;
  allowedStatuses: ReleaseStatus[]; assets: AssetSummary[]; readiness: ReleaseReadiness | null;
  saveMessage: string; saveError?: boolean; assetMessage: string; analyzing: boolean;
  onTitle: (value: string) => void; onGenre: (value: string) => void; onDate: (value: string) => void;
  onStory: (value: string) => void; onStatus: (value: ReleaseStatus) => void; onSave: () => void;
  onAttach: (kind: AssetKind) => void; onNavigate: (tab: string) => void;
  renderAsset: (asset: AssetSummary) => ReactNode;
}

export function ReleaseHero({ title, artist, genre, date, status, cover, onEdit, onArtwork, onNotes }: Pick<Props, "title" | "artist" | "genre" | "date" | "status"> & { cover?: string; onEdit: () => void; onArtwork: () => void; onNotes: () => void }) {
  const days = date ? Math.ceil((new Date(`${date.slice(0, 10)}T00:00:00`).getTime() - Date.now()) / 86400000) : null;
  return <div className="release-hero-v31">
    <MediaSurface className="release-hero-art" emptyLabel="No cover attached">{cover ? <img src={cover} alt={`${title} cover artwork`} /> : undefined}</MediaSurface>
    <div className="release-hero-copy"><span className="eyebrow">Release workspace</span><h1>{title || "Untitled release"}</h1><p>{artist}</p><StatusBadge label={genre || "Genre not set"} tone="cyan" /></div>
    <dl className="release-hero-facts"><div><dt>Release date</dt><dd>{date || "Not set"}</dd></div><div><dt>Status</dt><dd><StatusBadge label={status} tone={status === "published" ? "success" : "purple"} /></dd></div><div><dt>Countdown</dt><dd>{days === null || !Number.isFinite(days) ? "Not set" : days > 0 ? `${days} days` : days === 0 ? "Today" : `${Math.abs(days)} days ago`}</dd></div></dl>
    <div className="release-hero-actions"><Button variant="secondary" onClick={onEdit}>Edit release</Button><details className="release-hero-menu"><summary aria-label="More release actions">•••</summary><div><Button variant="ghost" onClick={onArtwork}>Manage artwork</Button><Button variant="ghost" onClick={onNotes}>Edit notes</Button></div></details></div>
  </div>;
}

export function ReleaseReadinessCard({ readiness }: { readiness: ReleaseReadiness | null }) {
  const score = readiness ? Math.min(100, Math.max(0, readiness.score)) : null;
  return <SectionCard title="Release Readiness" className="foundation-card readiness-card"><div className="readiness-summary"><svg className="readiness-ring" viewBox="0 0 100 100" role="img" aria-label={score === null ? "Readiness not available" : `${score}% release readiness`}><circle cx="50" cy="50" r="42" className="ring-track" /><circle cx="50" cy="50" r="42" className="ring-value" pathLength="100" strokeDasharray={`${score ?? 0} 100`} /><text x="50" y="55" textAnchor="middle">{score === null ? "--" : `${score}%`}</text></svg><p>{readiness?.missing[0] ?? (readiness ? "All readiness checks passed" : "Save a release to check readiness")}</p></div><ul className="readiness-checks">{readiness?.checks.map(check => <li key={check.id}><span className={check.complete ? "check-complete" : "check-pending"} aria-hidden="true">{check.complete ? "✓" : "○"}</span><span>{check.label}</span><span className="sr-only">{check.complete ? "Complete" : "Pending"}</span></li>)}</ul></SectionCard>;
}

export function ReleaseWorkflowBar({ readiness, onNavigate, evidence, published = false }: { readiness: ReleaseReadiness | null; onNavigate: Props["onNavigate"]; evidence?: { plan: boolean; content: boolean; review: boolean }; published?: boolean }) {
  const complete = (id: string) => readiness?.checks.find(check => check.id === id)?.complete === true;
  // Completion comes from persisted readiness, plan and generation evidence, never the open tab.
  const stages = [
    { label: "Foundation", done: complete("metadata") && complete("audio") && complete("cover"), tab: "foundation" },
    { label: "Campaign", done: complete("campaign"), tab: "campaign-drafts" },
    { label: "Plan", done: evidence?.plan === true, tab: "release-plan" },
    { label: "Content", done: evidence?.content === true, tab: "release-plan" },
    { label: "Review", done: evidence?.review === true, tab: "release-plan" },
    { label: "Distribute", done: published, tab: "promotion-formats" }
  ];
  const activeIndex = stages.findIndex(stage => !stage.done);
  return <nav className="foundation-workflow" aria-label="Release stages"><ol>{stages.map((stage, index) => <li key={stage.label} data-state={stage.done ? "complete" : index === activeIndex ? "active" : "pending"}><button onClick={() => onNavigate(stage.tab)} aria-current={index === 0 ? "step" : undefined}><span className="stage-marker">{stage.done ? "✓" : index + 1}</span><span>{stage.label}</span><small>{stage.done ? "Complete" : index === activeIndex ? "Next step" : "Open workspace"}</small></button></li>)}</ol></nav>;
}

export function ReleaseFoundation(props: Props) {
  const [drawer, setDrawer] = useState<"metadata" | "artwork" | "audio" | "dates" | "notes" | null>(null);
  const [cover, setCover] = useState<string>();
  const [evidence, setEvidence] = useState<{ plan: boolean; content: boolean; review: boolean }>();
  const [saved, setSaved] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  useEffect(() => {
    let live = true;
    setEvidence(undefined);
    if (props.releaseId && window.studio) void window.studio.getCurrentReleasePlan(props.releaseId).then(async plan => {
      const generations = plan ? await window.studio!.listPromoGenerations(plan.id) : [];
      const latest = (itemId: string) => generations.filter(generation => generation.campaignItemId === itemId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const covered = Boolean(plan?.campaignItems.length) && plan!.campaignItems.every(item => latest(item.id)?.status === "SUCCESS");
      const reviewed = covered && plan!.campaignItems.every(item => latest(item.id)?.reviewStatus === "APPROVED");
      if (live) setEvidence({ plan: Boolean(plan?.approvedAt), content: covered, review: reviewed });
    }).catch(() => {});
    return () => { live = false; };
  }, [props.releaseId]);
  useEffect(() => { setSaved(/saved locally|created locally/.test(props.saveMessage)); const timer = setTimeout(() => setSaved(false), 2400); return () => clearTimeout(timer); }, [props.saveMessage]);
  useEffect(() => { setUploaded(props.assetMessage.includes(" attached to ")); const timer = setTimeout(() => setUploaded(false), 800); return () => clearTimeout(timer); }, [props.assetMessage]);
  const coverAsset = props.assets.find(asset => asset.kind === "cover");
  const audio = props.assets.filter(asset => asset.kind === "audio");
  useEffect(() => { let live = true; setCover(undefined); if (coverAsset && window.studio) void window.studio.getAssetPlaybackUrl(coverAsset.id).then(url => { if (live) setCover(url); }).catch(() => {}); return () => { live = false; }; }, [coverAsset?.id]);
  const readiness = props.readiness?.releaseId === props.releaseId ? props.readiness : null;
  const metadata = <div className="foundation-fields"><Input label="Track title" value={props.title} onChange={event => props.onTitle(event.target.value)} /><Input label="Artist" value={props.artist} readOnly /><Input label="Primary genre" value={props.genre} onChange={event => props.onGenre(event.target.value)} /><Select label="Release status" value={props.status} onChange={event => props.onStatus(event.target.value as ReleaseStatus)}>{(["draft", "planned", "scheduled", "published", "archived"] as ReleaseStatus[]).map(status => <option key={status} value={status} disabled={!props.allowedStatuses.includes(status)}>{status}</option>)}</Select></div>;
  const notes = <Textarea label="Track story" rows={6} value={props.story} onChange={event => props.onStory(event.target.value)} />;
  const dates = <Input label="Release date" type="date" value={props.date} onChange={event => props.onDate(event.target.value)} />;
  const artwork = <><MediaSurface selected={Boolean(cover)} emptyLabel="No cover artwork" className="foundation-artwork">{cover ? <img src={cover} alt={`${props.title} artwork`} onError={() => setCover(undefined)} /> : undefined}</MediaSurface><Button variant="secondary" onClick={() => props.onAttach("cover")}>{coverAsset ? "Replace artwork" : "Choose cover"}</Button>{coverAsset && <div className="asset-list-local">{props.renderAsset(coverAsset)}</div>}</>;
  return <section className="release-foundation-v31">
    <ReleaseHero title={props.title} artist={props.artist} genre={props.genre} date={props.date} status={props.status} cover={cover} onEdit={() => setDrawer("metadata")} onArtwork={() => setDrawer("artwork")} onNotes={() => setDrawer("notes")} />
    <ReleaseWorkflowBar readiness={readiness} onNavigate={props.onNavigate} evidence={evidence} published={props.status === "published"} />
    <div className="foundation-grid">
      <div className="foundation-column">
        <SectionCard title="Basic Information" meta={<StatusBadge label={props.releaseId ? "Saved release" : "New release"} tone="cyan" />} className="foundation-card" data-save-error={props.saveError || undefined}>{metadata}<div className="foundation-save"><Button onClick={props.onSave}>{saved ? "Saved ✓" : props.releaseId ? "Save changes" : "Create release"}</Button><p role={props.saveError ? "alert" : "status"}>{props.saveMessage}</p></div></SectionCard>
        <SectionCard title="Audio & Tracks" actions={<Button variant="ghost" onClick={() => props.onAttach("audio")}>Choose audio</Button>} className="foundation-card" data-uploaded={uploaded || undefined} data-analyzing={props.analyzing || undefined}>{props.analyzing && <div className="analysis-wave" role="status" aria-label="Analyzing audio">{Array.from({ length: 16 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 45}ms` }} />)}</div>}{audio.length ? <><p>{audio.length} attached audio file{audio.length === 1 ? "" : "s"}</p><div className="foundation-file-names">{audio.map(asset => <strong key={asset.id}>{asset.fileName}</strong>)}</div><Button variant="secondary" onClick={() => setDrawer("audio")}>Tracks & audio analysis</Button></> : <p className="foundation-empty">No audio attached.</p>}<p className="foundation-feedback" role="status">{props.assetMessage}</p></SectionCard>
        <SectionCard className="foundation-card"><details className="foundation-disclosure" open><summary>Lyrics & Credits</summary><div><dl className="foundation-metadata"><div><dt>Artist</dt><dd>{props.artist}</dd></div></dl><p className="foundation-empty">Dedicated lyrics and contributor fields are not available for this release.</p></div></details></SectionCard>
      </div>
      <div className="foundation-column">
        <SectionCard title="Metadata & Identifiers" actions={<Button variant="ghost" onClick={() => setDrawer("metadata")}>Edit</Button>} className="foundation-card"><dl className="foundation-metadata"><div><dt>Release ID</dt><dd>{props.releaseId || "Not saved"}</dd></div><div><dt>Genre</dt><dd>{props.genre || "Not set"}</dd></div><div><dt>ISRC / UPC</dt><dd>Not available</dd></div></dl></SectionCard>
        <SectionCard title="Artwork" actions={<Button variant="ghost" onClick={() => setDrawer("artwork")}>Manage</Button>} className="foundation-card" data-uploaded={uploaded || undefined}><div className="foundation-art-summary"><MediaSurface selected={Boolean(cover)} emptyLabel="No artwork">{cover ? <img src={cover} alt={`${props.title} cover`} /> : undefined}</MediaSurface><div><strong>{coverAsset?.fileName || "Attach release artwork"}</strong><p>{coverAsset?.width && coverAsset.height ? `${coverAsset.width} × ${coverAsset.height} px` : "Square cover recommended"}</p><small>Original file stays in its folder.</small></div></div></SectionCard>
        <SectionCard title="Notes & References" actions={<Button variant="ghost" onClick={() => setDrawer("notes")}>Expand</Button>} className="foundation-card">{notes}</SectionCard>
      </div>
      <aside className="foundation-column foundation-sidebar">
        <ReleaseReadinessCard readiness={readiness} />
        <SectionCard title="Key Dates" actions={<Button variant="ghost" onClick={() => setDrawer("dates")}>Edit</Button>} className="foundation-card">{dates}</SectionCard>
        <DistroKidDistributionCard releaseId={props.releaseId} title={props.title} />
        <SectionCard title="Quick Actions" className="foundation-card foundation-actions"><Button variant="secondary" onClick={() => props.onNavigate("campaign-drafts")}>Campaign drafts →</Button><Button variant="secondary" onClick={() => props.onNavigate("release-plan")}>Release plan →</Button><Button variant="ghost" onClick={() => props.onNavigate("promotion-formats")}>Promotion formats →</Button></SectionCard>
      </aside>
    </div>
    <SideDrawer open={drawer !== null} title={drawer === "metadata" ? "Edit release metadata" : drawer === "artwork" ? "Release artwork" : drawer === "audio" ? "Audio & analysis" : drawer === "dates" ? "Key dates" : "Notes & references"} onClose={() => setDrawer(null)} footer={drawer === "metadata" || drawer === "notes" || drawer === "dates" ? <><Button onClick={props.onSave}>Save changes</Button><p role="status">{props.saveMessage}</p></> : undefined}>
      {drawer === "metadata" ? metadata : drawer === "artwork" ? artwork : drawer === "audio" ? <div className="asset-list-local">{audio.map(props.renderAsset)}</div> : drawer === "dates" ? dates : notes}
    </SideDrawer>
  </section>;
}
