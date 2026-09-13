import assert from "node:assert/strict";
import test from "node:test";
import type { AiHarnessResponse, AiHarnessTaskResult, AiHarnessTaskSummary } from "../shared/contracts.js";
import {
  aggregateCapabilityReadiness,
  appendHarnessPlanHistory,
  createExecutionApprovalDraft,
  createExecutionReadinessReport,
  createHarnessPlanHistoryItem,
  deserializeHarnessPlanHistory,
  serializeHarnessPlanHistory
} from "../shared/execution-readiness.js";

function task(id: string, capability = "text", dependsOn: string[] = []): AiHarnessTaskSummary {
  return { id, description: `Task ${id}`, capability, dependsOn };
}

function result(taskId: string, status: AiHarnessTaskResult["status"], capability = "text", blockedBy: string[] = [], executorId: string | null = status === "READY" ? "executor-1" : null): AiHarnessTaskResult {
  return { taskId, capability, executorId, status, planningOnly: true, blockedBy, dependencyResults: [], errors: [] };
}

function response(tasks: AiHarnessTaskSummary[], results: AiHarnessTaskResult[], overrides: Partial<AiHarnessResponse> = {}): AiHarnessResponse {
  return {
    requestId: "plan-1",
    status: "PLANNING_ONLY",
    planOnly: true,
    plan: { valid: true, originalTaskOrder: tasks.map((item) => item.id), resolvedTaskOrder: tasks.map((item) => item.id), tasks },
    results,
    errors: [],
    ...overrides
  };
}

test("execution readiness marks all READY tasks as approvable", () => {
  const report = createExecutionReadinessReport(response([task("A"), task("B")], [result("A", "READY"), result("B", "EXECUTABLE")]));
  assert.deepEqual(report.tasks.map((item) => [item.taskId, item.readinessStatus, item.approvable]), [["A", "READY", true], ["B", "READY", true]]);
  assert.equal(report.metrics.approvable, 2);
});

test("execution readiness maps NO_EXECUTOR tasks", () => {
  const report = createExecutionReadinessReport(response([task("A", "image.generate")], [result("A", "NO_EXECUTOR", "image.generate")]));
  assert.equal(report.tasks[0].readinessStatus, "NO_EXECUTOR");
  assert.equal(report.tasks[0].executorAvailable, false);
  assert.equal(report.metrics.noExecutor, 1);
});

test("execution readiness maps dependency blocked tasks", () => {
  const report = createExecutionReadinessReport(response([task("A"), task("B", "text", ["A"])], [result("A", "NO_EXECUTOR"), result("B", "BLOCKED_BY_DEPENDENCY", "text", ["A"])]));
  assert.equal(report.tasks[1].readinessStatus, "BLOCKED_BY_DEPENDENCY");
  assert.match(report.tasks[1].readinessReason, /Blocked by dependency: A/);
  assert.equal(report.metrics.blocked, 1);
});

test("execution readiness handles mixed plans deterministically", () => {
  const report = createExecutionReadinessReport(response(
    [task("A", "text"), task("B", "image.generate"), task("C", "file.transform", ["B"]), task("D", "voice.generate")],
    [result("A", "READY", "text"), result("B", "NO_EXECUTOR", "image.generate"), result("C", "BLOCKED_BY_DEPENDENCY", "file.transform", ["B"]), result("D", "UNSUPPORTED_CAPABILITY", "voice.generate")]
  ));
  assert.deepEqual(report.tasks.map((item) => item.readinessStatus), ["READY", "NO_EXECUTOR", "BLOCKED_BY_DEPENDENCY", "UNSUPPORTED"]);
  assert.deepEqual(report.metrics, { total: 4, ready: 1, blocked: 1, noExecutor: 1, errorOrUnsupported: 1, approvable: 1 });
});

test("planning errors mark tasks as PLANNING_ERROR", () => {
  const report = createExecutionReadinessReport(response([task("A")], [result("A", "READY")], { plan: { valid: false, originalTaskOrder: ["A"], resolvedTaskOrder: [], tasks: [task("A")] }, errors: [{ code: "DEPENDENCY_CYCLE", message: "A -> A" }] }));
  assert.equal(report.tasks[0].readinessStatus, "PLANNING_ERROR");
  assert.equal(report.planningErrors[0], "DEPENDENCY_CYCLE: A -> A");
});

test("missing or invalid response fields do not throw", () => {
  const report = createExecutionReadinessReport({ requestId: 12, plan: { tasks: [{ id: "A" }] }, results: "bad" });
  assert.equal(report.planId, "invalid-plan");
  assert.equal(report.metrics.total, 0);
});

test("approval draft excludes non-READY tasks", () => {
  const report = createExecutionReadinessReport(response([task("A"), task("B")], [result("A", "READY"), result("B", "NO_EXECUTOR")]));
  const draft = createExecutionApprovalDraft(report, ["B", "A", "A"], "2026-01-01T00:00:00.000Z");
  assert.deepEqual(draft.selectedTaskIds, ["A"]);
  assert.equal(draft.createdAt, "2026-01-01T00:00:00.000Z");
});

test("aggregate metrics count each readiness bucket", () => {
  const report = createExecutionReadinessReport(response([task("A"), task("B"), task("C"), task("D")], [result("A", "READY"), result("B", "NO_EXECUTOR"), result("C", "BLOCKED_BY_DEPENDENCY", "text", ["B"]), result("D", "UNSUPPORTED_CAPABILITY")]));
  assert.deepEqual(report.metrics, { total: 4, ready: 1, blocked: 1, noExecutor: 1, errorOrUnsupported: 1, approvable: 1 });
});

test("capability aggregation is sorted and counts availability", () => {
  const report = createExecutionReadinessReport(response([task("B", "voice.generate"), task("A", "image.generate"), task("C", "image.generate")], [result("B", "NO_EXECUTOR", "voice.generate"), result("A", "READY", "image.generate"), result("C", "BLOCKED_BY_DEPENDENCY", "image.generate", ["A"])]));
  assert.deepEqual(report.capabilities, [
    { capability: "image.generate", taskCount: 2, executorAvailable: true, readyCount: 1, blockedCount: 1 },
    { capability: "voice.generate", taskCount: 1, executorAvailable: false, readyCount: 0, blockedCount: 0 }
  ]);
});

test("standalone capability aggregation stays pure", () => {
  const summaries = aggregateCapabilityReadiness([
    { taskId: "A", title: "A", capability: "text", dependencies: [], executorAvailable: true, readinessStatus: "READY", readinessReason: "ok", approvable: true },
    { taskId: "B", title: "B", capability: "text", dependencies: ["A"], executorAvailable: false, readinessStatus: "BLOCKED_BY_DEPENDENCY", readinessReason: "blocked", approvable: false }
  ]);
  assert.deepEqual(summaries, [{ capability: "text", taskCount: 2, executorAvailable: true, readyCount: 1, blockedCount: 1 }]);
});

test("history serialize and deserialize preserves safe summaries", () => {
  const item = createHarnessPlanHistoryItem(response([task("A")], [result("A", "READY")]), "  Generate   a launch plan  ", "2026-01-01T00:00:00.000Z");
  const parsed = deserializeHarnessPlanHistory(serializeHarnessPlanHistory([item]));
  assert.equal(parsed[0].goalSummary, "Generate a launch plan");
  assert.equal(parsed[0].ready, 1);
});

test("corrupt history returns an empty list", () => {
  assert.deepEqual(deserializeHarnessPlanHistory("{bad json"), []);
  assert.deepEqual(deserializeHarnessPlanHistory(JSON.stringify({ not: "array" })), []);
});

test("history is bounded and de-duplicates by plan id", () => {
  const base = Array.from({ length: 5 }, (_, index) => ({ planId: `plan-${index}`, timestamp: "2026-01-01T00:00:00.000Z", goalSummary: `Goal ${index}`, overallStatus: "PLANNING_ONLY", total: 1, ready: 0, noExecutor: 1, blocked: 0, errorOrUnsupported: 0 }));
  const next = appendHarnessPlanHistory(base, { ...base[2], goalSummary: "Updated" }, 3);
  assert.deepEqual(next.map((item) => item.planId), ["plan-2", "plan-0", "plan-1"]);
  assert.equal(next[0].goalSummary, "Updated");
});