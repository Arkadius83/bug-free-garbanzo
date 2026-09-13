import { useEffect, useMemo, useState } from "react";
import type { AiHarnessResponse, ArtistAlias, ReleaseSummary } from "../electron/shared/contracts";
import {
  appendHarnessPlanHistory,
  createExecutionApprovalDraft,
  createExecutionReadinessReport,
  createHarnessPlanHistoryItem,
  deserializeHarnessPlanHistory,
  serializeHarnessPlanHistory,
  type HarnessPlanHistoryItem
} from "../electron/shared/execution-readiness";
import { buildHarnessPlanRequest } from "./harness-plan-preview-model";

type HarnessPlanPreviewProps = {
  release?: ReleaseSummary | null;
  artistId: ArtistAlias;
  artistName: string;
  defaultInstruction: string;
};

const HISTORY_KEY = "ai-studio-manager:harness-plan-history";

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function HarnessPlanPreview({ release, artistId, artistName, defaultInstruction }: HarnessPlanPreviewProps) {
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [response, setResponse] = useState<AiHarnessResponse | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [history, setHistory] = useState<HarnessPlanHistoryItem[]>([]);
  const [state, setState] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [message, setMessage] = useState("");
  const readiness = useMemo(() => createExecutionReadinessReport(response), [response]);
  const approvalDraft = useMemo(() => createExecutionApprovalDraft(readiness, selectedTaskIds, "preview-only"), [readiness, selectedTaskIds]);

  useEffect(() => {
    setHistory(deserializeHarnessPlanHistory(window.localStorage.getItem(HISTORY_KEY)));
  }, []);

  function persistHistory(next: HarnessPlanHistoryItem[]) {
    setHistory(next);
    window.localStorage.setItem(HISTORY_KEY, serializeHarnessPlanHistory(next));
  }

  async function previewPlan() {
    if (!window.studio) {
      setState("error");
      setMessage("Desktop bridge unavailable. Restart the app after updating.");
      return;
    }
    if (!instruction.trim()) {
      setState("error");
      setMessage("Enter a goal before previewing the plan.");
      return;
    }
    const now = Date.now();
    setState("loading");
    setMessage("");
    setSelectedTaskIds([]);
    try {
      const request = buildHarnessPlanRequest({
        requestId: `harness-preview-${now}`,
        goalId: `goal-${now}`,
        instruction,
        release,
        artistId,
        artistName
      });
      const next = await window.studio.runAiHarnessPlan(request);
      setResponse(next);
      persistHistory(appendHarnessPlanHistory(history, createHarnessPlanHistoryItem(next, instruction)));
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not preview the harness plan.");
    }
  }

  function toggleApproval(taskId: string) {
    const task = readiness.tasks.find((item) => item.taskId === taskId);
    if (!task?.approvable) return;
    setSelectedTaskIds((current) => current.includes(taskId) ? current.filter((item) => item !== taskId) : [...current, taskId]);
  }

  return (
    <div className="page-content harness-page">
      <header>
        <div>
          <span className="eyebrow">Harness Plan Preview</span>
          <h1>Preview the execution DAG.</h1>
          <p>Plan-only V12 routing for AI Manager goals. No providers, execution actions or repository mutations are triggered.</p>
        </div>
        <span className={`harness-overall ${response?.status.toLowerCase().replaceAll("_", "-") ?? "idle"}`}>{response?.status ? statusLabel(response.status) : "PLAN ONLY"}</span>
      </header>

      <div className="harness-disabled-banner"><strong>PLAN ONLY - EXECUTION DISABLED</strong><span>Approval selections are local preview data only. No execution IPC, provider call or repository mutation exists in this view.</span></div>

      <div className="harness-layout">
        <section className="panel harness-request-panel">
          <div className="panel-heading"><span className="eyebrow">Request</span><h2>Goal sent to AI Harness</h2></div>
          <label>Goal / request<textarea rows={8} value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
          <div className="harness-context">
            <span><small>PROJECT</small><b>AI Studio Manager</b></span>
            <span><small>RELEASE</small><b>{release?.title ?? "No active release"}</b></span>
            <span><small>ARTIST</small><b>{release?.artistName ?? artistName}</b></span>
            <span><small>MODE</small><b>planOnly=true</b></span>
          </div>
          <button className="primary" disabled={state === "loading"} onClick={() => void previewPlan()}>{state === "loading" ? "Previewing..." : "Preview plan"}</button>
          {message && <p className="harness-message error">{message}</p>}
        </section>

        <section className="panel harness-result-panel">
          <div className="panel-heading"><span className="eyebrow">Report</span><h2>Routing result</h2></div>
          {state === "empty" && <div className="harness-empty"><strong>No plan preview yet</strong><p>Enter a goal and preview the V12 plan to inspect task order, capabilities and blockers.</p></div>}
          {state === "loading" && <div className="harness-empty"><strong>Building plan...</strong><p>AI Manager is calling the Harness facade in plan-only mode.</p></div>}
          {state === "ready" && response && <>
            <div className="harness-metrics">
              <span><small>TOTAL</small><b>{readiness.metrics.total}</b></span>
              <span><small>READY</small><b>{readiness.metrics.ready}</b></span>
              <span><small>NO EXECUTOR</small><b>{readiness.metrics.noExecutor}</b></span>
              <span><small>BLOCKED</small><b>{readiness.metrics.blocked}</b></span>
              <span><small>ERROR/UNSUPPORTED</small><b>{readiness.metrics.errorOrUnsupported}</b></span>
              <span><small>APPROVABLE</small><b>{readiness.metrics.approvable}</b></span>
            </div>
            <div className="harness-order"><small>RESOLVED ORDER</small><code>{response.plan.resolvedTaskOrder.join(" -> ") || "No ordered tasks"}</code></div>
            <div className="harness-task-list">
              {readiness.tasks.map((task, index) => <article key={task.taskId} className={`harness-task status-${task.readinessStatus.toLowerCase().replaceAll("_", "-")}`}>
                <input type="checkbox" aria-label={`Select ${task.taskId}`} checked={selectedTaskIds.includes(task.taskId)} disabled={!task.approvable} onChange={() => toggleApproval(task.taskId)} />
                <b>{index + 1}</b>
                <div className="harness-task-main">
                  <div className="harness-task-title"><strong>{task.taskId}</strong><span>{task.title}</span></div>
                  <div className="harness-task-meta"><code>{task.capability}</code><small>depends on {task.dependencies.length ? task.dependencies.join(", ") : "none"}</small><small>executor {task.executorAvailable ? "YES" : "NO"}</small></div>
                  <em>{task.readinessReason}</em>
                </div>
                <span>{statusLabel(task.readinessStatus)}</span>
              </article>)}
            </div>
            {readiness.planningErrors.length > 0 && <div className="harness-errors"><strong>Planning errors</strong>{readiness.planningErrors.map((error, index) => <p key={`${error}-${index}`}>{error}</p>)}</div>}
          </>}
        </section>
      </div>

      <div className="harness-bottom-grid">
        <section className="panel harness-approval-panel">
          <div className="panel-heading"><span className="eyebrow">Execution Approval</span><h2>Approval preview only</h2></div>
          <div className="harness-approval-summary"><span><small>SELECTED READY TASKS</small><b>{approvalDraft.selectedTaskIds.length}</b></span><span><small>DRAFT SOURCE</small><b>{approvalDraft.source}</b></span></div>
          <code>{approvalDraft.selectedTaskIds.length ? approvalDraft.selectedTaskIds.join(", ") : "No READY task selected"}</code>
          <p>Only READY tasks can be selected. Tasks with NO_EXECUTOR, BLOCKED_BY_DEPENDENCY, PLANNING_ERROR, UNSUPPORTED or NOT_APPROVABLE remain disabled.</p>
        </section>

        <section className="panel harness-capability-panel">
          <div className="panel-heading"><span className="eyebrow">Capabilities</span><h2>Executor summary</h2></div>
          {readiness.capabilities.length === 0 ? <div className="harness-empty compact"><strong>No capability data</strong></div> : <div className="harness-capability-list">{readiness.capabilities.map((item) => <article key={item.capability}><strong>{item.capability}</strong><span>{item.taskCount} task{item.taskCount === 1 ? "" : "s"}</span><b>executor {item.executorAvailable ? "YES" : "NO"}</b><small>{item.readyCount} ready · {item.blockedCount} blocked</small></article>)}</div>}
        </section>

        <section className="panel harness-history-panel">
          <div className="panel-heading"><span className="eyebrow">Recent Harness Plans</span><h2>Product-owned history</h2></div>
          {history.length === 0 ? <div className="harness-empty compact"><strong>No saved plan summaries</strong></div> : <div className="harness-history-list">{history.slice(0, 8).map((item) => <article key={item.planId}><div><strong>{item.goalSummary}</strong><small>{new Date(item.timestamp).toLocaleString()} · {item.overallStatus}</small></div><span>{item.total} total · {item.ready} ready · {item.noExecutor} no executor · {item.blocked} blocked</span></article>)}</div>}
        </section>
      </div>
    </div>
  );
}