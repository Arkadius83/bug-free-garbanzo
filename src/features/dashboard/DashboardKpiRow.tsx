import type { MetaConnection, PublishingQueueItem, ReleaseReadiness, ReleaseSummary, SoundCloudConnection, SpotifyConnection, TaskSummary } from "../../../electron/shared/contracts";
import { StatusBadge } from "../../ui/StatusBadge";
import { SurfacePanel } from "../../ui/SurfacePanel";

type KpiAccent = "cyan" | "purple" | "green" | "amber" | "teal" | "blue";

function Kpi({ label, value, accent }: { label: string; value: string; accent: KpiAccent }) {
  return <div className={`dashboard-kpi dashboard-kpi-${accent}`}><span className="dashboard-kpi-label">{label}</span><span className="dashboard-kpi-value">{value}</span></div>;
}

interface DashboardKpiRowProps {
  releases: ReleaseSummary[];
  tasks: TaskSummary[];
  readiness: ReleaseReadiness | null;
  queue: PublishingQueueItem[];
  meta: MetaConnection | null;
  soundCloud: SoundCloudConnection | null;
  spotify: SpotifyConnection | null;
}

export function DashboardKpiRow({ releases, tasks, readiness, queue, meta, soundCloud, spotify }: DashboardKpiRowProps) {
  const activeReleases = releases.filter((r) => ["planned", "scheduled"].includes(r.status)).length;
  const activeTasks = tasks.filter((t) => t.status === "doing").length;
  const openTasks = tasks.filter((t) => t.status === "todo").length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const readinessScore = readiness?.score ?? 0;
  const approved = queue.filter((q) => q.status === "approved" || q.status === "scheduled" || q.status === "published").length;
  const connectedCount = [spotify?.connected, soundCloud?.connected, meta?.connected].filter(Boolean).length;

  return <div className="dashboard-kpi-row" aria-label="Workspace summary">
    <Kpi label="Releases" value={`${releases.length}${activeReleases ? ` / ${activeReleases} active` : ""}`} accent="cyan" />
    <Kpi label="In progress" value={String(activeTasks)} accent="purple" />
    <Kpi label="To review" value={String(openTasks)} accent="amber" />
    <Kpi label="Completed" value={String(completedTasks)} accent="green" />
    <Kpi label="Readiness" value={`${readinessScore}%`} accent="cyan" />
    <Kpi label="Campaign" value={queue.length ? `${approved}/${queue.length}` : "—"} accent="teal" />
    <Kpi label="Platforms" value={`${connectedCount}/3`} accent="blue" />
  </div>;
}
