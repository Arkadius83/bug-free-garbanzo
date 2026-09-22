import type { CampaignPackItem, MediaGenerationSummary, MetaConnection, PublishingQueueItem, ReleaseReadiness, ReleaseSummary, SoundCloudConnection, SoundCloudTrackSummary, SpotifyConnection, TaskSummary } from "../../../electron/shared/contracts";

import totalReachBg from "../../assets/kpi_templates/01_total_reach_template.png";
import engagementBg from "../../assets/kpi_templates/02_engagement_rate_template.png";
import assetsBg from "../../assets/kpi_templates/03_generated_assets_template.png";
import scheduledBg from "../../assets/kpi_templates/04_scheduled_posts_template.png";
import approvalsBg from "../../assets/kpi_templates/05_approvals_pending_template.png";

interface DashboardKpiRowProps {
  releases: ReleaseSummary[];
  tasks: TaskSummary[];
  readiness: ReleaseReadiness | null;
  queue: PublishingQueueItem[];
  meta: MetaConnection | null;
  soundCloud: SoundCloudConnection | null;
  spotify: SpotifyConnection | null;
  soundCloudTracks: SoundCloudTrackSummary[];
  mediaGenerations: MediaGenerationSummary[];
  campaignPackItems: CampaignPackItem[];
}

interface KpiCardProps {
  label: string;
  value: string | number;
  trend: string;
  artwork: string;
  accent: "cyan" | "purple" | "teal" | "magenta" | "cyan-purple";
}

function KpiCard({ label, value, trend, artwork, accent }: KpiCardProps) {
  return <article className={`kpi-widget kpi-${accent}`} style={{ backgroundImage: `url(${artwork})` }} aria-label={`${label}: ${value}. ${trend}`}>
    <div className="kpi-value-field">
      <strong>{value}</strong>
      <span>{trend}</span>
    </div>
  </article>;
}

export function DashboardKpiRow({ releases, tasks, readiness, queue, meta: _meta, soundCloud: _soundCloud, spotify: _spotify, soundCloudTracks, mediaGenerations, campaignPackItems }: DashboardKpiRowProps) {
  const scheduledPosts = queue.filter((item) => item.status === "scheduled").length;
  const approvalsPending = tasks.filter((task) => task.status === "todo").length;
  const totalPlays = soundCloudTracks.reduce((sum, track) => sum + (track.playbackCount ?? 0), 0);
  const hasPlays = soundCloudTracks.length > 0 && totalPlays > 0;
  const tracksWithRate = soundCloudTracks.filter((track) => track.engagementRate != null && track.engagementRate > 0);
  const averageEngagement = tracksWithRate.length > 0
    ? Math.round(tracksWithRate.reduce((sum, track) => sum + (track.engagementRate ?? 0), 0) / tracksWithRate.length)
    : null;
  const generatedAssetCount = mediaGenerations.length + campaignPackItems.length;

  return <section className="dashboard-kpi-row" aria-label="Workspace summary">
    <KpiCard label="Total Reach" value={hasPlays ? totalPlays.toLocaleString() : "-"} trend={hasPlays ? `${soundCloudTracks.length} tracks` : "Import tracks"} artwork={totalReachBg} accent="cyan" />
    <KpiCard label="Engagement Rate" value={averageEngagement != null ? `${averageEngagement}%` : "-"} trend={averageEngagement != null ? `${tracksWithRate.length} tracks` : "Awaiting data"} artwork={engagementBg} accent="purple" />
    <KpiCard label="Generated Assets" value={generatedAssetCount} trend={`${mediaGenerations.length} media · ${campaignPackItems.length} copy`} artwork={assetsBg} accent="teal" />
    <KpiCard label="Scheduled Posts" value={scheduledPosts} trend={`${queue.length} in queue`} artwork={scheduledBg} accent="magenta" />
    <KpiCard label="Approvals Pending" value={approvalsPending} trend={`Readiness ${readiness?.score ?? 0}%`} artwork={approvalsBg} accent="cyan-purple" />
  </section>;
}