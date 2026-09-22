import type { ReleaseReadiness, ReleaseSummary, TaskSummary } from "../../../electron/shared/contracts";
import { Button } from "../../ui/Button";
import { StatusBadge } from "../../ui/StatusBadge";
import { SurfacePanel } from "../../ui/SurfacePanel";

type WorkflowState = "complete" | "active" | "pending";
interface WorkflowStep { label: string; state: WorkflowState; }
interface ReleaseWorkflowCardProps { release: ReleaseSummary | undefined; readiness: ReleaseReadiness | null; tasks: TaskSummary[]; onOpenTasks: () => void; }

function workflowSteps(release: ReleaseSummary, readiness: ReleaseReadiness | null): WorkflowStep[] {
  const checks = readiness?.releaseId === release.id ? readiness.checks : [];
  const complete = (ids: string[]) => ids.length > 0 && ids.every((id) => checks.find((check) => check.id === id)?.complete);
  const base = [{ label: "Plan", complete: true }, { label: "Generate", complete: complete(["audio", "cover"]) }, { label: "Review", complete: complete(["metadata", "campaign"]) }, { label: "Distribute", complete: ["scheduled", "published"].includes(release.status) }, { label: "Monitor", complete: release.status === "published" }];
  const activeIndex = base.findIndex((step) => !step.complete);
  return base.map((step, index) => ({ label: step.label, state: step.complete ? "complete" : index === activeIndex ? "active" : "pending" }));
}

export function ReleaseWorkflowCard({ release, readiness, tasks, onOpenTasks }: ReleaseWorkflowCardProps) {
  const openTasks = tasks.filter((task) => task.status === "todo" || task.status === "doing").length;
  if (!release) return <SurfacePanel variant="standard" className="dashboard-panel release-workflow-card release-workflow-empty"><div className="workflow-head"><span className="dashboard-eyebrow">Release workflow</span><StatusBadge label="No release" /></div><p className="workflow-empty">Select or create a release to see its workflow state.</p></SurfacePanel>;

  const steps = workflowSteps(release, readiness);
  const blocker = readiness?.missing[0] ?? "No readiness blocker";
  return <SurfacePanel variant="standard" className="dashboard-panel release-workflow-card">
    <div className="workflow-head">
      <span className="dashboard-eyebrow">Release workflow</span>
      <h2>{release.title}</h2>
      <StatusBadge label={release.status} tone="cyan" />
    </div>
    <ol className="workflow-steps" aria-label="Release workflow">{steps.map((step) => <li className={`workflow-step workflow-step-${step.state}`} key={step.label}><i aria-hidden="true">{step.state === "complete" ? "OK" : step.state === "active" ? ">" : ""}</i><span>{step.label}</span></li>)}</ol>
    <div className="workflow-foot">
      <span>{openTasks} open task{openTasks === 1 ? "" : "s"}</span>
      <span>{blocker}</span>
      <Button variant="ghost" className="dashboard-text-action" onClick={onOpenTasks}>View tasks</Button>
    </div>
  </SurfacePanel>;
}
