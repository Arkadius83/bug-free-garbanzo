import { useMemo, useState } from "react";
import type { AiHarnessResponse, ArtistAlias, ReleaseSummary } from "../electron/shared/contracts";
import { buildHarnessPlanRequest, summarizeHarnessPlan } from "./harness-plan-preview-model";

type HarnessPlanPreviewProps = {
  release?: ReleaseSummary | null;
  artistId: ArtistAlias;
  artistName: string;
  defaultInstruction: string;
};

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function taskName(id: string, description?: string): string {
  return description?.trim() || id;
}

export function HarnessPlanPreview({ release, artistId, artistName, defaultInstruction }: HarnessPlanPreviewProps) {
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [response, setResponse] = useState<AiHarnessResponse | null>(null);
  const [state, setState] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [message, setMessage] = useState("");
  const metrics = useMemo(() => summarizeHarnessPlan(response), [response]);

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
    setState("loading");
    setMessage("");
    try {
      const request = buildHarnessPlanRequest({
        requestId: `harness-preview-${Date.now()}`,
        goalId: `goal-${Date.now()}`,
        instruction,
        release,
        artistId,
        artistName
      });
      const next = await window.studio.runAiHarnessPlan(request);
      setResponse(next);
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not preview the harness plan.");
    }
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
              <span><small>TASKS</small><b>{metrics.totalTasks}</b></span>
              <span><small>NO EXECUTOR</small><b>{metrics.noExecutorTasks}</b></span>
              <span><small>BLOCKED</small><b>{metrics.blockedTasks}</b></span>
              <span><small>FAILED</small><b>{metrics.failedTasks}</b></span>
            </div>
            <div className="harness-order"><small>RESOLVED ORDER</small><code>{response.plan.resolvedTaskOrder.join(" -> ") || "No ordered tasks"}</code></div>
            <div className="harness-task-list">
              {response.plan.tasks.map((task, index) => {
                const result = response.results.find((item) => item.taskId === task.id);
                return <article key={task.id} className={`harness-task status-${result?.status.toLowerCase().replaceAll("_", "-") ?? "unknown"}`}>
                  <b>{index + 1}</b>
                  <div className="harness-task-main">
                    <div className="harness-task-title"><strong>{task.id}</strong><span>{taskName(task.id, task.description)}</span></div>
                    <div className="harness-task-meta"><code>{task.capability ?? "unspecified"}</code><small>depends on {task.dependsOn.length ? task.dependsOn.join(", ") : "none"}</small></div>
                    {result?.blockedBy.length ? <em>Blocked by {result.blockedBy.join(", ")}</em> : null}
                    {result?.errors.length ? <p>{result.errors.map((error) => error.message).join(" · ")}</p> : null}
                  </div>
                  <span>{result ? statusLabel(result.status) : "NO RESULT"}</span>
                </article>;
              })}
            </div>
            {response.errors.length > 0 && <div className="harness-errors"><strong>Planning errors</strong>{response.errors.map((error, index) => <p key={`${error.code}-${index}`}>{error.code}: {error.message}</p>)}</div>}
          </>}
        </section>
      </div>
    </div>
  );
}
