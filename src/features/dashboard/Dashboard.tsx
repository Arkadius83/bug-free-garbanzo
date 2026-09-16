import type { AssetSummary, DatabaseHealth, MetaConnection, PublishingQueueItem, ReleaseReadiness, ReleaseSummary, ScheduleEvent, SoundCloudConnection, SpotifyConnection, SystemStatus, TaskSummary } from "../../../electron/shared/contracts";
import { DashboardKpiRow } from "./DashboardKpiRow";
import { FeaturedReleaseCard } from "./FeaturedReleaseCard";
import { AIStudioChat } from "./AIStudioChat";
import { QuickActionsPanel } from "./QuickActionsPanel";
import { DashboardOperations } from "./DashboardOperations";
import "./dashboard.css";

interface DashboardProps { releases: ReleaseSummary[]; tasks: TaskSummary[]; assets: AssetSummary[]; featuredRelease: ReleaseSummary | undefined; releaseReadiness: ReleaseReadiness | null; onCreateRelease: () => void; onOpenRelease: () => void; onOpenTasks: () => void; onOpenCalendar: () => void; queue?: PublishingQueueItem[]; events?: ScheduleEvent[]; meta?: MetaConnection | null; soundCloud?: SoundCloudConnection | null; spotify?: SpotifyConnection | null; system?: SystemStatus | null; database?: DatabaseHealth | null; }

export function Dashboard({ releases, tasks, assets, featuredRelease, releaseReadiness, onCreateRelease, onOpenRelease, onOpenTasks, onOpenCalendar, queue, events, meta, soundCloud, spotify, system, database }: DashboardProps) {
  const coverAsset = featuredRelease ? assets.find((asset) => asset.releaseId === featuredRelease.id && asset.kind === "cover") : undefined;
  return <div className="dashboard page-content">
    <div className="dashboard-top-strip">
      <header className="dashboard-header">
        <span className="dashboard-eyebrow">Operations overview</span>
        <h1>Dashboard</h1>
      </header>
      <DashboardKpiRow releases={releases} tasks={tasks} readiness={releaseReadiness} queue={queue ?? []} meta={meta ?? null} soundCloud={soundCloud ?? null} spotify={spotify ?? null} />
    </div>
    <div className="dashboard-main-row">
      <FeaturedReleaseCard release={featuredRelease} coverAsset={coverAsset} readiness={releaseReadiness} onOpenRelease={onOpenRelease} />
      <AIStudioChat system={system ?? null} />
      <QuickActionsPanel onCreateRelease={onCreateRelease} onOpenRelease={onOpenRelease} onOpenCalendar={onOpenCalendar} />
    </div>
    <DashboardOperations queue={queue} events={events} meta={meta} soundCloud={soundCloud} spotify={spotify} system={system} database={database} readinessMissing={releaseReadiness?.missing} />
  </div>;
}
