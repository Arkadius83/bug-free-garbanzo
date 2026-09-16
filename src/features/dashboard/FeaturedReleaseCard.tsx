import { useState } from "react";
import type { AssetSummary, ReleaseReadiness, ReleaseSummary } from "../../../electron/shared/contracts";
import { Button } from "../../ui/Button";
import { StatusBadge, type StatusBadgeTone } from "../../ui/StatusBadge";
import { SurfacePanel } from "../../ui/SurfacePanel";

interface FeaturedReleaseCardProps { release: ReleaseSummary | undefined; coverAsset: AssetSummary | undefined; readiness: ReleaseReadiness | null; onOpenRelease: () => void; }

function titleCase(value: string): string { return value.slice(0, 1).toUpperCase() + value.slice(1); }
function initials(value: string): string { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AR"; }
function assetUrl(asset: AssetSummary): string { const normalizedPath = asset.filePath.replaceAll("\\", "/"); return `file://${encodeURI(normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`)}`; }
function formatReleaseDate(value: string | null): string { return value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "Release date not set"; }
function releaseTone(status: ReleaseSummary["status"]): StatusBadgeTone { return status === "published" ? "success" : status === "scheduled" ? "purple" : status === "planned" ? "cyan" : "neutral"; }

export function FeaturedReleaseCard({ release, coverAsset, readiness, onOpenRelease }: FeaturedReleaseCardProps) {
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  if (!release) return <SurfacePanel variant="standard" className="dashboard-panel featured-release-card dashboard-empty-panel"><span className="dashboard-eyebrow">Featured release</span><h2>No release selected</h2><p>Create a release to begin building its production and promotion workflow.</p></SurfacePanel>;

  const showCover = Boolean(coverAsset) && !coverUnavailable;
  const readinessScore = readiness && readiness.releaseId === release.id ? readiness.score : null;
  return <SurfacePanel variant="highlight" state="active" className="dashboard-panel featured-release-card">
    <div className="dashboard-panel-heading"><span className="dashboard-eyebrow">Featured release</span><StatusBadge label={titleCase(release.status)} tone={releaseTone(release.status)} state="active" /></div>
    <div className="featured-release-body">
      <div className="featured-release-art">{showCover ? <img src={assetUrl(coverAsset!)} alt={`${release.title} cover artwork`} onError={() => setCoverUnavailable(true)} /> : <span aria-label="Cover artwork unavailable">{initials(release.title)}</span>}</div>
      <div className="featured-release-copy">
        <h2>{release.title}</h2>
        <p>{release.artistName}</p>
        <div className="featured-release-meta">
          <span>{release.primaryGenre}</span>
          {readinessScore !== null && <span className="featured-release-readiness">{readinessScore}% ready</span>}
        </div>
        <small>{formatReleaseDate(release.releaseDate)}</small>
      </div>
    </div>
    <div className="featured-release-footer">
      <StatusBadge label={titleCase(release.status)} tone={releaseTone(release.status)} />
      <Button variant="primary" onClick={onOpenRelease}>Open Release <b aria-hidden="true">&gt;</b></Button>
    </div>
  </SurfacePanel>;
}
