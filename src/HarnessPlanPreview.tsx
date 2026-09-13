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
import {
  appendHarnessExecutionHistory,
  createHarnessExecutionHistoryItem,
  deserializeHarnessExecutionHistory,
  serializeHarnessExecutionHistory,
  type HarnessAuditEntry,
  type HarnessExecutionContext,
  type HarnessExecutionHistoryItem,
  type HarnessExecutionResponse,
  type HarnessExecutionReview
} from "../electron/shared/harness-execution";
import { buildHarnessPlanRequest } from "./harness-plan-preview-model";

type HarnessPlanPreviewProps = {
  release?: ReleaseSummary | null;
  artistId: ArtistAlias;
  artistName: string;
  defaultInstruction: string;
};

const PLAN_HISTORY_KEY = "ai-studio-manager:harness-plan-history";
const EXECUTION_HISTORY_KEY = "ai-studio-manager:harness-execution-history";

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function hasRunnablePayload(expectedOutputs: unknown): boolean {
  if (!expectedOutputs || typeof expectedOutputs !== "object") return false;
  const payload = (expectedOutputs as { fileTransform?: unknown }).fileTransform;
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { path?: unknown; text?: unknown; content?: unknown };
  return typeof candidate.path === "string" && candidate.path.trim().length > 0 && (typeof candidate.text === "string" || typeof candidate.content === "string");
}

export function HarnessPlanPreview({ release, artistId, artistName, defaultInstruction }: HarnessPlanPreviewProps) {
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [response, setResponse] = useState<AiHarnessResponse | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [planHistory, setPlanHistory] = useState<HarnessPlanHistoryItem[]>([]);
  const [executionHistory, setExecutionHistory] = useState<HarnessExecutionHistoryItem[]>([]);
  const [executionContext, setExecutionContext] = useState<HarnessExecutionContext | null>(null);
  const [executionResult, setExecutionResult] = useState<HarnessExecutionResponse | null>(null);
  const [executionReview, setExecutionReview] = useState<HarnessExecutionReview | null>(null);
  const [auditHistory, setAuditHistory] = useState<HarnessAuditEntry[]>([]);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [executionState, setExecutionState] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [state, setState] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [message, setMessage] = useState("");
  const [executionMessage, setExecutionMessage] = useState("");
  const readiness = useMemo(() => createExecutionReadinessReport(response), [response]);
  const approvalDraft = useMemo(() => createExecutionApprovalDraft(readiness, selectedTaskIds), [readiness, selectedTaskIds]);
  const executorByCapability = useMemo(() => new Map((executionContext?.executors ?? []).map((executor) => [executor.capability, executor])), [executionContext]);
  const selectedReadyTasks = readiness.tasks.filter((task) => selectedTaskIds.includes(task.taskId));
  const selectedPlanTasks = response?.plan.tasks.filter((task) => selectedTaskIds.includes(task.id)) ?? [];
  const requiredPhrase = response ? `CONFIRM:${response.requestId}` : "";
  const selectedTasksHaveExecutors = selectedReadyTasks.length > 0 && selectedReadyTasks.every((task) => executorByCapability.get(task.capability)?.available === true);
  const selectedTasksHavePayload = selectedPlanTasks.length > 0 && selectedPlanTasks.every((task) => task.capability === "file.transform" && hasRunnablePayload(task.expectedOutputs));
  const approvedTaskPayload = selectedReadyTasks.map((task) => { const planTask = response?.plan.tasks.find((item) => item.id === task.taskId); return { taskId: task.taskId, title: task.title, capability: task.capability, readinessStatus: task.readinessStatus, dependencies: task.dependencies, expectedOutputs: planTask?.expectedOutputs }; });
  const canExecute = Boolean(response && executionContext && executionReview && selectedReadyTasks.length > 0 && selectedReadyTasks.every((task) => task.readinessStatus === "READY") && selectedTasksHaveExecutors && selectedTasksHavePayload && confirmationPhrase === requiredPhrase && executionState !== "running");

  useEffect(() => {
    setPlanHistory(deserializeHarnessPlanHistory(window.localStorage.getItem(PLAN_HISTORY_KEY)));
    setExecutionHistory(deserializeHarnessExecutionHistory(window.localStorage.getItem(EXECUTION_HISTORY_KEY)));
    if (window.studio) void Promise.all([window.studio.getHarnessExecutionContext(), window.studio.listHarnessExecutionAudit()]).then(([context, audit]) => { setExecutionContext(context); setAuditHistory(audit); }).catch((error) => setExecutionMessage(error instanceof Error ? error.message : "Could not load execution context."));
  }, []);

  function persistPlanHistory(next: HarnessPlanHistoryItem[]) {
    setPlanHistory(next);
    window.localStorage.setItem(PLAN_HISTORY_KEY, serializeHarnessPlanHistory(next));
  }

  function persistExecutionHistory(next: HarnessExecutionHistoryItem[]) {
    setExecutionHistory(next);
    window.localStorage.setItem(EXECUTION_HISTORY_KEY, serializeHarnessExecutionHistory(next));
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
    setExecutionMessage("");
    setExecutionResult(null);
    setExecutionReview(null);
    setConfirmationPhrase("");
    setSelectedTaskIds([]);
    try {
      const request = buildHarnessPlanRequest({ requestId: `harness-preview-${now}`, goalId: `goal-${now}`, instruction, release, artistId, artistName });
      const next = await window.studio.runAiHarnessPlan(request);
      setResponse(next);
      persistPlanHistory(appendHarnessPlanHistory(planHistory, createHarnessPlanHistoryItem(next, instruction)));
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not preview the harness plan.");
    }
  }

  async function reviewSelectedTasks() {
    if (!window.studio || !response || !executionContext || !selectedTasksHaveExecutors || !selectedTasksHavePayload) return;
    setExecutionMessage("");
    try {
      const review = await window.studio.reviewHarnessExecution({ planId: response.requestId, selectedTaskIds: approvalDraft.selectedTaskIds, source: "harness-plan-preview", workspace: executionContext.workspace, tasks: approvedTaskPayload });
      setExecutionReview(review);
    } catch (error) {
      setExecutionMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Execution review failed.");
    }
  }

  async function executeSelectedTasks() {
    if (!window.studio || !response || !executionContext || !executionReview || !canExecute) return;
    setExecutionState("running");
    setExecutionMessage("");
    try {
      const approvalRequest = { planId: response.requestId, selectedTaskIds: approvalDraft.selectedTaskIds, source: "harness-plan-preview", workspace: executionContext.workspace, tasks: approvedTaskPayload };
      const approval = await window.studio.createHarnessExecutionApproval(approvalRequest);
      const result = await window.studio.executeHarnessTasks({ ...approvalRequest, approval });
      setExecutionResult(result);
      persistExecutionHistory(appendHarnessExecutionHistory(executionHistory, createHarnessExecutionHistoryItem(result)));
      setAuditHistory(await window.studio.listHarnessExecutionAudit());
      setExecutionState("complete");
    } catch (error) {
      setExecutionState("error");
      setExecutionMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Execution failed.");
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
        <div><span className="eyebrow">Harness Plan Preview</span><h1>Preview the execution DAG.</h1><p>Plan-only V12 routing plus one narrow local execution foundation. No providers, shell commands, process spawning or network calls are exposed.</p></div>
        <span className={`harness-overall ${response?.status.toLowerCase().replaceAll("_", "-") ?? "idle"}`}>{response?.status ? statusLabel(response.status) : "PLAN ONLY"}</span>
      </header>

      <div className="harness-disabled-banner"><strong>REAL EXECUTION FOUNDATION - GUARDED</strong><span>Only confirmed READY tasks with an available registered executor can run inside the controlled workspace.</span></div>

      <div className="harness-layout">
        <section className="panel harness-request-panel">
          <div className="panel-heading"><span className="eyebrow">Request</span><h2>Goal sent to AI Harness</h2></div>
          <label>Goal / request<textarea rows={8} value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
          <div className="harness-context"><span><small>PROJECT</small><b>AI Studio Manager</b></span><span><small>RELEASE</small><b>{release?.title ?? "No active release"}</b></span><span><small>ARTIST</small><b>{release?.artistName ?? artistName}</b></span><span><small>MODE</small><b>planOnly=true</b></span></div>
          <button className="primary" disabled={state === "loading"} onClick={() => void previewPlan()}>{state === "loading" ? "Previewing..." : "Preview plan"}</button>
          {message && <p className="harness-message error">{message}</p>}
        </section>

        <section className="panel harness-result-panel">
          <div className="panel-heading"><span className="eyebrow">Report</span><h2>Routing result</h2></div>
          {state === "empty" && <div className="harness-empty"><strong>No plan preview yet</strong><p>Enter a goal and preview the V12 plan to inspect task order, capabilities and blockers.</p></div>}
          {state === "loading" && <div className="harness-empty"><strong>Building plan...</strong><p>AI Manager is calling the Harness facade in plan-only mode.</p></div>}
          {state === "ready" && response && <><div className="harness-metrics"><span><small>TOTAL</small><b>{readiness.metrics.total}</b></span><span><small>READY</small><b>{readiness.metrics.ready}</b></span><span><small>NO EXECUTOR</small><b>{readiness.metrics.noExecutor}</b></span><span><small>BLOCKED</small><b>{readiness.metrics.blocked}</b></span><span><small>ERROR/UNSUPPORTED</small><b>{readiness.metrics.errorOrUnsupported}</b></span><span><small>APPROVABLE</small><b>{readiness.metrics.approvable}</b></span></div><div className="harness-order"><small>RESOLVED ORDER</small><code>{response.plan.resolvedTaskOrder.join(" -> ") || "No ordered tasks"}</code></div><div className="harness-task-list">{readiness.tasks.map((task, index) => { const executor = executorByCapability.get(task.capability); return <article key={task.taskId} className={`harness-task status-${task.readinessStatus.toLowerCase().replaceAll("_", "-")}`}><input type="checkbox" aria-label={`Select ${task.taskId}`} checked={selectedTaskIds.includes(task.taskId)} disabled={!task.approvable} onChange={() => toggleApproval(task.taskId)} /><b>{index + 1}</b><div className="harness-task-main"><div className="harness-task-title"><strong>{task.taskId}</strong><span>{task.title}</span></div><div className="harness-task-meta"><code>{task.capability}</code><small>depends on {task.dependencies.length ? task.dependencies.join(", ") : "none"}</small><small>executor {executor?.available ? executor.executorId : "NO"}</small></div><em>{task.readinessReason}</em></div><span>{statusLabel(task.readinessStatus)}</span></article>; })}</div>{readiness.planningErrors.length > 0 && <div className="harness-errors"><strong>Planning errors</strong>{readiness.planningErrors.map((error, index) => <p key={`${error}-${index}`}>{error}</p>)}</div>}</>}
        </section>
      </div>

      <div className="harness-bottom-grid">
        <section className="panel harness-approval-panel">
          <div className="panel-heading"><span className="eyebrow">Execution Approval</span><h2>Explicit local execution</h2></div>
          <div className="harness-approval-summary"><span><small>SELECTED READY TASKS</small><b>{approvalDraft.selectedTaskIds.length}</b></span><span><small>EXECUTOR CHECK</small><b>{selectedTasksHaveExecutors ? "PASS" : "WAIT"}</b></span></div>
          <code>{approvalDraft.selectedTaskIds.length ? approvalDraft.selectedTaskIds.join(", ") : "No READY task selected"}</code>
          <div className="harness-workspace-box"><small>CONTROLLED WORKSPACE</small><b>{executionContext?.workspace.root ?? "Loading workspace..."}</b></div>
          <div className="harness-safety-list"><span className={selectedReadyTasks.length ? "pass" : ""}>READY task selected</span><span className={selectedTasksHaveExecutors ? "pass" : ""}>executor exists</span><span className={executionContext?.workspace.root ? "pass" : ""}>workspace valid</span><span className={selectedTasksHavePayload ? "pass" : ""}>safe file payload</span><span className={executionReview ? "pass" : ""}>review created</span><span className={confirmationPhrase === requiredPhrase && requiredPhrase ? "pass" : ""}>user confirmed</span></div><button disabled={!response || !executionContext || !selectedTasksHaveExecutors || !selectedTasksHavePayload} onClick={() => void reviewSelectedTasks()}>Create execution review</button>{executionReview && <div className="harness-review"><strong>Execution Review</strong><small>Approval expires {new Date(executionReview.expiresAt).toLocaleString()}</small><code>{executionReview.planFingerprint}</code>{executionReview.tasks.map((task) => <article key={task.taskId}><div><b>{task.taskId}</b><span>{task.capability} · {task.executorId ?? "NO EXECUTOR"}</span></div><small>{task.workspaceRoot}</small><small>target {task.targetRelativePath ?? "none"} · exists {task.fileExists ? "YES" : "NO"}</small><small>before {task.beforeHash ?? "new file"}</small><small>after {task.expectedAfterHash ?? "unknown"}</small><small>dependencies {task.dependencies.length ? task.dependencies.join(", ") : "none"}</small><pre>{task.diffPreview}</pre></article>)}</div>}
          <label>Type confirmation phrase<input value={confirmationPhrase} onChange={(event) => setConfirmationPhrase(event.target.value)} placeholder={requiredPhrase || "Preview a plan first"} /></label>
          <button className="primary" disabled={!canExecute} onClick={() => void executeSelectedTasks()}>{executionState === "running" ? "Executing..." : "Execute approved tasks"}</button>
          {executionMessage && <p className="harness-message error">{executionMessage}</p>}
          {executionResult && <div className="harness-execution-result"><strong>{executionResult.status}</strong>{executionResult.results.map((result) => <article key={result.taskId}><b>{result.taskId}</b><span>{result.status}</span><p>{result.message}</p>{result.changedResources.map((resource) => <small key={resource.path}>{`${resource.path}: ${resource.beforeSizeBytes ?? 0} -> ${resource.afterSizeBytes ?? 0} bytes · verify ${result.verificationStatus} · rollback ${result.rollbackAttempted ? result.rollbackSucceeded ? "ok" : "failed" : "not-run"}`}</small>)}</article>)}</div>}
        </section>

        <section className="panel harness-capability-panel">
          <div className="panel-heading"><span className="eyebrow">Capabilities</span><h2>Executor summary</h2></div>
          {readiness.capabilities.length === 0 ? <div className="harness-empty compact"><strong>No capability data</strong></div> : <div className="harness-capability-list">{readiness.capabilities.map((item) => { const executor = executorByCapability.get(item.capability); return <article key={item.capability}><strong>{item.capability}</strong><span>{item.taskCount} task{item.taskCount === 1 ? "" : "s"}</span><b>executor {executor?.available ? "YES" : "NO"}</b><small>{item.readyCount} ready · {item.blockedCount} blocked</small></article>; })}</div>}
        </section>

        <section className="panel harness-history-panel">
          <div className="panel-heading"><span className="eyebrow">Recent Harness Plans</span><h2>Product-owned history</h2></div>
          {planHistory.length === 0 ? <div className="harness-empty compact"><strong>No saved plan summaries</strong></div> : <div className="harness-history-list">{planHistory.slice(0, 8).map((item) => <article key={item.planId}><div><strong>{item.goalSummary}</strong><small>{new Date(item.timestamp).toLocaleString()} · {item.overallStatus}</small></div><span>{item.total} total · {item.ready} ready · {item.noExecutor} no executor · {item.blocked} blocked</span></article>)}</div>}
        </section>

        <section className="panel harness-history-panel">
          <div className="panel-heading"><span className="eyebrow">Recent Executions</span><h2>Local execution summaries</h2></div>
          {executionHistory.length === 0 ? <div className="harness-empty compact"><strong>No execution summaries</strong></div> : <div className="harness-history-list">{executionHistory.slice(0, 8).map((item) => <article key={item.executionId}><div><strong>{item.executionId}</strong><small>{new Date(item.timestamp).toLocaleString()} · {item.status} · {item.planFingerprint?.slice(0, 10) ?? "no-fingerprint"}</small></div><span>{item.taskSummaries.map((task) => `${task.taskId}:${task.status}`).join(", ")}</span></article>)}</div>}<div className="harness-audit-list"><strong>Audit History</strong>{auditHistory.length === 0 ? <small>No durable audit entries</small> : auditHistory.slice(0, 10).map((entry) => <article key={`${entry.executionId}-${entry.taskId}-${entry.finishedAt}`}><div><b>{entry.taskId}</b><span>{entry.outcome} · {entry.verificationStatus}</span></div><small>{entry.capability} · {entry.executorId ?? "no executor"}</small><small>{entry.targetPath ?? "no target"} · rollback {entry.rollbackAttempted ? entry.rollbackSucceeded ? "SUCCESS" : "FAILED" : "NOT RUN"}</small><small>{entry.fingerprint?.slice(0, 16) ?? "no fingerprint"}</small></article>)}</div>
        </section>
      </div>
    </div>
  );
}