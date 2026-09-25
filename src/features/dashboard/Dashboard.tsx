import type { AssetSummary, CampaignPackItem, DatabaseHealth, MediaGenerationSummary, MetaConnection, PublishingQueueItem, ReleaseReadiness, ReleaseSummary, ScheduleEvent, SoundCloudConnection, SoundCloudTrackSummary, SpotifyConnection, SystemStatus, TaskSummary, YouTubeAnalyticsRange, YouTubeAnalyticsSnapshot, YouTubeChannelDataSnapshot, YouTubeConnection } from "../../../electron/shared/contracts";
import { useEffect, useState } from "react";
import { DashboardKpiRow } from "./DashboardKpiRow";
import { FeaturedReleaseCard } from "./FeaturedReleaseCard";
import { AIStudioChat } from "./AIStudioChat";
import { QuickActionsPanel } from "./QuickActionsPanel";
import { ReleaseWorkflowCard } from "./ReleaseWorkflowCard";
import { DashboardOperations } from "./DashboardOperations";
import "./dashboard.css";
import "./overview-v4.css";
import "./overview-grid.css";
import { useOverviewConnections } from "./useOverviewConnections";

interface DashboardProps { releases: ReleaseSummary[]; tasks: TaskSummary[]; assets: AssetSummary[]; featuredRelease: ReleaseSummary | undefined; releaseReadiness: ReleaseReadiness | null; onCreateRelease: () => void; onOpenRelease: () => void; onOpenTasks: () => void; onOpenCalendar: () => void; queue?: PublishingQueueItem[]; events?: ScheduleEvent[]; meta?: MetaConnection | null; soundCloud?: SoundCloudConnection | null; spotify?: SpotifyConnection | null; youTube?: YouTubeConnection | null; youTubeData?: YouTubeChannelDataSnapshot | null; youTubeAnalytics?: YouTubeAnalyticsSnapshot | null; youTubeAnalyticsRange?: YouTubeAnalyticsRange; system?: SystemStatus | null; database?: DatabaseHealth | null; soundCloudTracks?: SoundCloudTrackSummary[]; mediaGenerations?: MediaGenerationSummary[]; campaignPackItems?: CampaignPackItem[]; playerPlaying?: boolean; onPlayFeatured?: () => void; featuredAudioSource?: string; }

export function Dashboard({ releases, tasks, assets, featuredRelease, releaseReadiness, onCreateRelease, onOpenRelease, onOpenTasks, onOpenCalendar, queue, events, meta, soundCloud, spotify, youTube, youTubeData, youTubeAnalytics, youTubeAnalyticsRange, system, database, soundCloudTracks, mediaGenerations, campaignPackItems, playerPlaying, onPlayFeatured, featuredAudioSource }: DashboardProps) {
  const { tikTok, distroKid, connectionError } = useOverviewConnections();
  const coverAsset = featuredRelease ? assets.find((asset) => asset.releaseId === featuredRelease.id && asset.kind === "cover") : undefined;
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!coverAsset || !window.studio) { setCoverUrl(undefined); return; }
    let cancelled = false;
    window.studio.getAssetPlaybackUrl(coverAsset.id).then((url) => { if (!cancelled) setCoverUrl(url); }).catch(() => { if (!cancelled) setCoverUrl(undefined); });
    return () => { cancelled = true; };
  }, [coverAsset?.id]);

  return <div className="dashboard overview-v4 page-content">
    <div className="dashboard-top-strip">
      <header className="dashboard-header">
        <span className="dashboard-eyebrow">Operations overview</span>
        <h1>Dashboard</h1>
      </header>
      <DashboardKpiRow releases={releases} tasks={tasks} readiness={releaseReadiness} queue={queue ?? []} meta={meta ?? null} soundCloud={soundCloud ?? null} spotify={spotify ?? null} soundCloudTracks={soundCloudTracks ?? []} mediaGenerations={mediaGenerations ?? []} campaignPackItems={campaignPackItems ?? []} />
    </div>
    <div className="dashboard-main-row">
      <FeaturedReleaseCard release={featuredRelease} coverAsset={coverAsset} coverUrl={coverUrl} readiness={releaseReadiness} onOpenRelease={onOpenRelease} audioSource={featuredAudioSource} isPlaying={playerPlaying ?? false} onPlay={onPlayFeatured ?? (() => {})} />
      <AIStudioChat system={system ?? null} release={featuredRelease} />
      <QuickActionsPanel onCreateRelease={onCreateRelease} onOpenRelease={onOpenRelease} onOpenCalendar={onOpenCalendar} />
    </div>
    <ReleaseWorkflowCard release={featuredRelease} readiness={releaseReadiness} tasks={tasks} onOpenTasks={onOpenTasks} />
    <DashboardOperations tikTok={tikTok} distroKid={distroKid} connectionError={connectionError} queue={queue} events={events} meta={meta} soundCloud={soundCloud} spotify={spotify} youTube={youTube} youTubeData={youTubeData} youTubeAnalytics={youTubeAnalytics} youTubeAnalyticsRange={youTubeAnalyticsRange} system={system} database={database} readinessMissing={releaseReadiness?.missing} />
  </div>;
}
