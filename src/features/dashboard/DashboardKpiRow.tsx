import type { CampaignPackItem, MediaGenerationSummary, MetaConnection, PublishingQueueItem, ReleaseReadiness, ReleaseSummary, SoundCloudConnection, SoundCloudTrackSummary, SpotifyConnection, TaskSummary } from "../../../electron/shared/contracts";


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
  icon: string;
  accent: "cyan" | "purple" | "teal" | "magenta" | "cyan-purple";
}

function KpiCard({ label, value, trend, icon, accent }: KpiCardProps) {
  return <article className={`kpi-widget kpi-${accent}`} aria-label={`${label}: ${value}. ${trend}`}>
    <span className="kpi-symbol" aria-hidden="true">{icon}</span>
    <div className="kpi-value-field">
      <span className="kpi-label">{label}</span>
      <strong>{value}</strong>
      <span className="kpi-trend">{trend}</span>
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
    <KpiCard label="Total Reach" value={hasPlays ? totalPlays.toLocaleString() : "-"} trend={hasPlays ? `${soundCloudTracks.length} tracks` : "Import tracks"} icon="◎" accent="cyan" />
    <KpiCard label="Engagement Rate" value={averageEngagement != null ? `${averageEngagement}%` : "-"} trend={averageEngagement != null ? `${tracksWithRate.length} tracks` : "Awaiting data"} icon="♡" accent="purple" />
    <KpiCard label="Generated Assets" value={generatedAssetCount} trend={`${mediaGenerations.length} media · ${campaignPackItems.length} copy`} icon="◇" accent="teal" />
    <KpiCard label="Scheduled Posts" value={scheduledPosts} trend={`${queue.length} in queue`} icon="▦" accent="magenta" />
    <KpiCard label="Approvals Pending" value={approvalsPending} trend={`Readiness ${readiness?.score ?? 0}%`} icon="◷" accent="cyan-purple" />
  </section>;
}
