import type { AiHarnessResponse, AiHarnessTaskResult, AiHarnessTaskSummary } from "./contracts.js";

export type ExecutionReadinessStatus =
  | "READY"
  | "NO_EXECUTOR"
  | "BLOCKED_BY_DEPENDENCY"
  | "PLANNING_ERROR"
  | "UNSUPPORTED"
  | "NOT_APPROVABLE";

export interface ExecutionReadinessTask {
  taskId: string;
  title: string;
  capability: string;
  dependencies: string[];
  executorAvailable: boolean;
  readinessStatus: ExecutionReadinessStatus;
  readinessReason: string;
  approvable: boolean;
}

export interface ExecutionReadinessMetrics {
  total: number;
  ready: number;
  blocked: number;
  noExecutor: number;
  errorOrUnsupported: number;
  approvable: number;
}

export interface CapabilityExecutionSummary {
  capability: string;
  taskCount: number;
  executorAvailable: boolean;
  readyCount: number;
  blockedCount: number;
}

export interface ExecutionReadinessReport {
  planId: string;
  overallStatus: string;
  tasks: ExecutionReadinessTask[];
  metrics: ExecutionReadinessMetrics;
  capabilities: CapabilityExecutionSummary[];
  planningErrors: string[];
}

export interface ExecutionApprovalDraft {
  planId: string;
  selectedTaskIds: string[];
  createdAt: string;
  source: "harness-plan-preview" | string;
}

export interface HarnessPlanHistoryItem {
  planId: string;
  timestamp: string;
  goalSummary: string;
  overallStatus: string;
  total: number;
  ready: number;
  noExecutor: number;
  blocked: number;
  errorOrUnsupported: number;
}

const DEFAULT_HISTORY_LIMIT = 50;

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asArray<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

function isTask(value: unknown): value is AiHarnessTaskSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AiHarnessTaskSummary>;
  return hasString(candidate.id) && Array.isArray(candidate.dependsOn) && candidate.dependsOn.every((item) => typeof item === "string");
}

function isResult(value: unknown): value is AiHarnessTaskResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AiHarnessTaskResult>;
  return hasString(candidate.taskId) && hasString(candidate.status) && Array.isArray(candidate.blockedBy) && Array.isArray(candidate.errors);
}

function resultReason(result: AiHarnessTaskResult | undefined): string {
  if (!result) return "Harness did not return a task result.";
  if (result.errors.length) return result.errors.map((error) => error.message || error.code).join("; ");
  if (result.blockedBy.length) return `Blocked by dependency: ${result.blockedBy.join(", ")}.`;
  if (result.status === "NO_EXECUTOR") return "No executor is registered for this capability.";
  if (result.status === "UNSUPPORTED_CAPABILITY") return "Capability is valid for planning but unsupported by the current execution layer.";
  if (result.status === "PLANNING_ONLY") return "Plan-only result is not approvable until an executor is available.";
  if (result.status === "EXECUTION_FAILED") return "The task result indicates execution failure.";
  return "Task is ready for future approval preview.";
}

function readinessStatus(task: AiHarnessTaskSummary, result: AiHarnessTaskResult | undefined, planHasErrors: boolean): ExecutionReadinessStatus {
  if (planHasErrors || !hasString(task.id)) return "PLANNING_ERROR";
  if (!result) return "PLANNING_ERROR";
  if (result.status === "UNSUPPORTED_CAPABILITY") return "UNSUPPORTED";
  if (result.status === "NO_EXECUTOR") return "NO_EXECUTOR";
  if (result.status === "BLOCKED_BY_DEPENDENCY") return "BLOCKED_BY_DEPENDENCY";
  if (result.status === "EXECUTION_FAILED") return "PLANNING_ERROR";
  if (result.status === "READY" || result.status === "EXECUTABLE" || result.status === "EXECUTED") return "READY";
  return "NOT_APPROVABLE";
}

export function createExecutionReadinessReport(response: unknown): ExecutionReadinessReport {
  if (!response || typeof response !== "object") {
    return emptyReadinessReport("invalid-plan", "INVALID", ["Harness response is missing or invalid."]);
  }

  const candidate = response as Partial<AiHarnessResponse>;
  const tasks = asArray(candidate.plan?.tasks, isTask);
  const results = asArray(candidate.results, isResult);
  const planningErrors = asArray(candidate.errors, (item): item is { code?: string; message?: string } => !!item && typeof item === "object")
    .map((error) => `${error.code ? `${error.code}: ` : ""}${error.message ?? "Unknown planning error"}`);
  const planHasErrors = candidate.plan?.valid === false || planningErrors.length > 0 || !candidate.plan;
  const resultByTaskId = new Map(results.map((result) => [result.taskId, result]));
  const planId = hasString(candidate.requestId) ? candidate.requestId : "invalid-plan";

  const readinessTasks = tasks.map((task) => {
    const result = resultByTaskId.get(task.id);
    const status = readinessStatus(task, result, planHasErrors);
    const executorAvailable = Boolean(result?.executorId) || result?.status === "READY" || result?.status === "EXECUTABLE" || result?.status === "EXECUTED";
    return {
      taskId: task.id,
      title: task.description?.trim() || task.id,
      capability: task.capability?.trim() || result?.capability?.trim() || "unspecified",
      dependencies: [...task.dependsOn],
      executorAvailable,
      readinessStatus: status,
      readinessReason: planHasErrors ? "Plan contains planning errors and cannot be approved." : resultReason(result),
      approvable: status === "READY"
    } satisfies ExecutionReadinessTask;
  });

  if (tasks.length === 0 && planHasErrors) {
    return emptyReadinessReport(planId, candidate.status ?? "INVALID", planningErrors.length ? planningErrors : ["Harness plan is missing or invalid."]);
  }

  return {
    planId,
    overallStatus: candidate.status ?? "UNKNOWN",
    tasks: readinessTasks,
    metrics: aggregateReadinessMetrics(readinessTasks),
    capabilities: aggregateCapabilityReadiness(readinessTasks),
    planningErrors
  };
}

export function aggregateReadinessMetrics(tasks: ExecutionReadinessTask[]): ExecutionReadinessMetrics {
  return {
    total: tasks.length,
    ready: tasks.filter((task) => task.readinessStatus === "READY").length,
    blocked: tasks.filter((task) => task.readinessStatus === "BLOCKED_BY_DEPENDENCY").length,
    noExecutor: tasks.filter((task) => task.readinessStatus === "NO_EXECUTOR").length,
    errorOrUnsupported: tasks.filter((task) => task.readinessStatus === "PLANNING_ERROR" || task.readinessStatus === "UNSUPPORTED" || task.readinessStatus === "NOT_APPROVABLE").length,
    approvable: tasks.filter((task) => task.approvable).length
  };
}

export function aggregateCapabilityReadiness(tasks: ExecutionReadinessTask[]): CapabilityExecutionSummary[] {
  const groups = new Map<string, ExecutionReadinessTask[]>();
  for (const task of tasks) {
    const capability = task.capability || "unspecified";
    groups.set(capability, [...(groups.get(capability) ?? []), task]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([capability, items]) => ({
    capability,
    taskCount: items.length,
    executorAvailable: items.some((task) => task.executorAvailable),
    readyCount: items.filter((task) => task.readinessStatus === "READY").length,
    blockedCount: items.filter((task) => task.readinessStatus === "BLOCKED_BY_DEPENDENCY").length
  }));
}

export function createExecutionApprovalDraft(report: ExecutionReadinessReport, selectedTaskIds: string[], now = new Date().toISOString(), source = "harness-plan-preview"): ExecutionApprovalDraft {
  const approvableIds = new Set(report.tasks.filter((task) => task.approvable).map((task) => task.taskId));
  const selected = selectedTaskIds.filter((taskId, index, all) => approvableIds.has(taskId) && all.indexOf(taskId) === index);
  return { planId: report.planId, selectedTaskIds: selected, createdAt: now, source };
}

export function createHarnessPlanHistoryItem(response: AiHarnessResponse, goalSummary: string, timestamp = new Date().toISOString()): HarnessPlanHistoryItem {
  const report = createExecutionReadinessReport(response);
  return {
    planId: report.planId,
    timestamp,
    goalSummary: summarizeGoal(goalSummary),
    overallStatus: report.overallStatus,
    total: report.metrics.total,
    ready: report.metrics.ready,
    noExecutor: report.metrics.noExecutor,
    blocked: report.metrics.blocked,
    errorOrUnsupported: report.metrics.errorOrUnsupported
  };
}

export function appendHarnessPlanHistory(history: HarnessPlanHistoryItem[], item: HarnessPlanHistoryItem, limit = DEFAULT_HISTORY_LIMIT): HarnessPlanHistoryItem[] {
  const withoutDuplicate = history.filter((entry) => entry.planId !== item.planId);
  return [item, ...withoutDuplicate].slice(0, Math.max(1, limit));
}

export function serializeHarnessPlanHistory(history: HarnessPlanHistoryItem[]): string {
  return JSON.stringify(history.map(sanitizeHistoryItem).filter((item): item is HarnessPlanHistoryItem => item !== null));
}

export function deserializeHarnessPlanHistory(serialized: string | null | undefined, limit = DEFAULT_HISTORY_LIMIT): HarnessPlanHistoryItem[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeHistoryItem).filter((item): item is HarnessPlanHistoryItem => item !== null).slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

function summarizeGoal(goal: string): string {
  const compact = goal.replace(/\s+/g, " ").trim();
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function sanitizeHistoryItem(value: unknown): HarnessPlanHistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<HarnessPlanHistoryItem>;
  if (!hasString(item.planId) || !hasString(item.timestamp) || !hasString(item.goalSummary) || !hasString(item.overallStatus)) return null;
  return {
    planId: item.planId,
    timestamp: item.timestamp,
    goalSummary: summarizeGoal(item.goalSummary),
    overallStatus: item.overallStatus,
    total: safeNumber(item.total),
    ready: safeNumber(item.ready),
    noExecutor: safeNumber(item.noExecutor),
    blocked: safeNumber(item.blocked),
    errorOrUnsupported: safeNumber(item.errorOrUnsupported)
  };
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function emptyReadinessReport(planId: string, overallStatus: string, planningErrors: string[]): ExecutionReadinessReport {
  return {
    planId,
    overallStatus,
    tasks: [],
    metrics: aggregateReadinessMetrics([]),
    capabilities: [],
    planningErrors
  };
}