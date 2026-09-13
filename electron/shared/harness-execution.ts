export type HarnessExecutionTaskStatus = "SUCCESS" | "FAILED" | "REJECTED" | "BLOCKED" | "NO_EXECUTOR";
export type HarnessExecutorSafetyClass = "SAFE_WORKSPACE_TEXT_WRITE";
export type HarnessWorkspaceScope = "WORKSPACE_ONLY";
export type HarnessVerificationStatus = "PASSED" | "FAILED" | "NOT_RUN";

export interface HarnessExecutionWorkspace { root: string; }

export interface HarnessExecutionApproval {
  approvalId: string;
  approved: boolean;
  confirmed: boolean;
  approvedAt: string;
  expiresAt: string;
  token: string;
  planFingerprint: string;
  selectedTaskIds: string[];
  workspaceRoot: string;
}

export interface HarnessExecutionApprovedTask {
  taskId: string;
  title: string;
  capability: string;
  readinessStatus: string;
  dependencies: string[];
  expectedOutputs?: unknown;
}

export interface HarnessExecutionApprovalRequest {
  planId: string;
  selectedTaskIds: string[];
  source: string;
  workspace: HarnessExecutionWorkspace;
  tasks: HarnessExecutionApprovedTask[];
}

export interface HarnessExecutionRequest extends HarnessExecutionApprovalRequest {
  approval: HarnessExecutionApproval;
}

export interface HarnessChangedResource {
  path: string;
  beforeExists: boolean;
  afterExists: boolean;
  beforeSizeBytes: number | null;
  afterSizeBytes: number | null;
  beforeModifiedAt: string | null;
  afterModifiedAt: string | null;
}

export interface HarnessTaskExecutionResult {
  taskId: string;
  capability: string;
  executorId: string | null;
  status: HarnessExecutionTaskStatus;
  message: string;
  startedAt: string;
  finishedAt: string;
  changedResources: HarnessChangedResource[];
  errorSummary: string | null;
  planFingerprint: string | null;
  verificationStatus: HarnessVerificationStatus;
  rollbackAttempted: boolean;
  rollbackSucceeded: boolean | null;
  beforeHash: string | null;
  afterHash: string | null;
}

export interface HarnessExecutionResponse {
  executionId: string;
  planId: string;
  planFingerprint: string | null;
  status: HarnessExecutionTaskStatus;
  startedAt: string;
  finishedAt: string;
  results: HarnessTaskExecutionResult[];
}

export interface HarnessExecutorDescriptor {
  capability: string;
  executorId: string;
  available: boolean;
  safetyClass: HarnessExecutorSafetyClass;
  workspaceScope: HarnessWorkspaceScope;
}

export interface HarnessExecutionContext {
  executors: HarnessExecutorDescriptor[];
  workspace: HarnessExecutionWorkspace;
  approvalTtlMs: number;
}

export interface HarnessExecutionHistoryItem {
  executionId: string;
  planId: string;
  planFingerprint: string | null;
  timestamp: string;
  selectedTaskIds: string[];
  status: HarnessExecutionTaskStatus;
  taskSummaries: Array<{
    taskId: string;
    capability: string;
    executorId: string | null;
    status: HarnessExecutionTaskStatus;
    message: string;
    planFingerprint: string | null;
    verificationStatus: HarnessVerificationStatus;
    rollbackAttempted: boolean;
    rollbackSucceeded: boolean | null;
  }>;
}

const DEFAULT_EXECUTION_HISTORY_LIMIT = 50;

export function createHarnessExecutionHistoryItem(response: HarnessExecutionResponse): HarnessExecutionHistoryItem {
  return {
    executionId: response.executionId,
    planId: response.planId,
    planFingerprint: response.planFingerprint,
    timestamp: response.finishedAt,
    selectedTaskIds: response.results.map((result) => result.taskId),
    status: response.status,
    taskSummaries: response.results.map((result) => ({
      taskId: result.taskId,
      capability: result.capability,
      executorId: result.executorId,
      status: result.status,
      message: result.message,
      planFingerprint: result.planFingerprint,
      verificationStatus: result.verificationStatus,
      rollbackAttempted: result.rollbackAttempted,
      rollbackSucceeded: result.rollbackSucceeded
    }))
  };
}

export function appendHarnessExecutionHistory(history: HarnessExecutionHistoryItem[], item: HarnessExecutionHistoryItem, limit = DEFAULT_EXECUTION_HISTORY_LIMIT): HarnessExecutionHistoryItem[] {
  const withoutDuplicate = history.filter((entry) => entry.executionId !== item.executionId);
  return [item, ...withoutDuplicate].slice(0, Math.max(1, limit));
}

export function serializeHarnessExecutionHistory(history: HarnessExecutionHistoryItem[]): string {
  return JSON.stringify(history.map(sanitizeHistoryItem).filter((item): item is HarnessExecutionHistoryItem => item !== null));
}

export function deserializeHarnessExecutionHistory(serialized: string | null | undefined, limit = DEFAULT_EXECUTION_HISTORY_LIMIT): HarnessExecutionHistoryItem[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeHistoryItem).filter((item): item is HarnessExecutionHistoryItem => item !== null).slice(0, Math.max(1, limit));
  } catch { return []; }
}

function sanitizeHistoryItem(value: unknown): HarnessExecutionHistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<HarnessExecutionHistoryItem>;
  if (!isNonEmptyString(item.executionId) || !isNonEmptyString(item.planId) || !isNonEmptyString(item.timestamp) || !isExecutionStatus(item.status)) return null;
  const summaries = Array.isArray(item.taskSummaries) ? item.taskSummaries.map(sanitizeTaskSummary).filter((summary): summary is HarnessExecutionHistoryItem["taskSummaries"][number] => summary !== null) : [];
  return {
    executionId: item.executionId,
    planId: item.planId,
    planFingerprint: typeof item.planFingerprint === "string" ? item.planFingerprint : null,
    timestamp: item.timestamp,
    selectedTaskIds: Array.isArray(item.selectedTaskIds) ? item.selectedTaskIds.filter(isNonEmptyString) : summaries.map((summary) => summary.taskId),
    status: item.status,
    taskSummaries: summaries
  };
}

function sanitizeTaskSummary(value: unknown): HarnessExecutionHistoryItem["taskSummaries"][number] | null {
  if (!value || typeof value !== "object") return null;
  const item = value as HarnessExecutionHistoryItem["taskSummaries"][number];
  if (!isNonEmptyString(item.taskId) || !isNonEmptyString(item.capability) || !isExecutionStatus(item.status) || typeof item.message !== "string") return null;
  return {
    taskId: item.taskId,
    capability: item.capability,
    executorId: typeof item.executorId === "string" && item.executorId.trim() ? item.executorId : null,
    status: item.status,
    message: item.message,
    planFingerprint: typeof item.planFingerprint === "string" ? item.planFingerprint : null,
    verificationStatus: isVerificationStatus(item.verificationStatus) ? item.verificationStatus : "NOT_RUN",
    rollbackAttempted: Boolean(item.rollbackAttempted),
    rollbackSucceeded: typeof item.rollbackSucceeded === "boolean" ? item.rollbackSucceeded : null
  };
}

function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isExecutionStatus(value: unknown): value is HarnessExecutionTaskStatus { return value === "SUCCESS" || value === "FAILED" || value === "REJECTED" || value === "BLOCKED" || value === "NO_EXECUTOR"; }
function isVerificationStatus(value: unknown): value is HarnessVerificationStatus { return value === "PASSED" || value === "FAILED" || value === "NOT_RUN"; }