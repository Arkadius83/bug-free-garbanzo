import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  HarnessChangedResource,
  HarnessExecutionApprovedTask,
  HarnessExecutionRequest,
  HarnessExecutionResponse,
  HarnessExecutionTaskStatus,
  HarnessExecutorDescriptor,
  HarnessTaskExecutionResult
} from "../shared/harness-execution.js";

const KNOWN_CAPABILITIES = [
  "text", "reasoning", "image.generate", "image.edit", "image.analyze", "image.upscale", "audio.generate", "audio.edit", "audio.analyze", "music.generate", "voice.generate", "voice.convert", "file.transform", "workflow", "code", "repository"
];
const TEXT_FILE_EXECUTOR_ID = "local.text-file-transform.v1";
const MAX_TEXT_BYTES = 64 * 1024;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".csv", ".log"]);

export function createHarnessExecutorRegistry(): HarnessExecutorDescriptor[] {
  return KNOWN_CAPABILITIES.map((capability) => ({
    capability,
    executorId: capability === "file.transform" ? TEXT_FILE_EXECUTOR_ID : `${capability}.unavailable`,
    available: capability === "file.transform",
    safetyClass: "SAFE_WORKSPACE_TEXT_WRITE",
    workspaceScope: "WORKSPACE_ONLY"
  }));
}

export function getHarnessExecutor(capability: string, registry = createHarnessExecutorRegistry()): HarnessExecutorDescriptor | null {
  return registry.find((executor) => executor.capability === capability) ?? null;
}

export async function executeApprovedHarnessTasks(input: unknown, options: { allowedWorkspaceRoot: string; now?: () => string } ): Promise<HarnessExecutionResponse> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const executionId = `harness-exec-${randomUUID()}`;
  const validation = validateExecutionRequest(input, options.allowedWorkspaceRoot);
  if (!validation.valid) {
    const finishedAt = now();
    return { executionId, planId: validation.planId, status: "REJECTED", startedAt, finishedAt, results: [createImmediateResult("request", "unknown", null, "REJECTED", validation.message, startedAt, finishedAt)] };
  }

  const request = validation.request;
  const registry = createHarnessExecutorRegistry();
  const taskById = new Map(request.tasks.map((task) => [task.taskId, task]));
  const results: HarnessTaskExecutionResult[] = [];
  const selected = request.selectedTaskIds.filter((taskId, index, all) => all.indexOf(taskId) === index);

  for (const taskId of selected) {
    const taskStartedAt = now();
    const task = taskById.get(taskId);
    if (!task) {
      results.push(createImmediateResult(taskId, "unknown", null, "REJECTED", "Selected task is not included in approved task payload.", taskStartedAt, now()));
      continue;
    }
    const registryEntry = getHarnessExecutor(task.capability, registry);
    if (!registryEntry) {
      results.push(createImmediateResult(task.taskId, task.capability, null, "REJECTED", `Unknown capability: ${task.capability}.`, taskStartedAt, now()));
      continue;
    }
    if (task.readinessStatus !== "READY") {
      results.push(createImmediateResult(task.taskId, task.capability, registryEntry.executorId, task.readinessStatus === "BLOCKED_BY_DEPENDENCY" ? "BLOCKED" : "REJECTED", `Task is ${task.readinessStatus}, not READY.`, taskStartedAt, now()));
      continue;
    }
    if (!registryEntry.available) {
      results.push(createImmediateResult(task.taskId, task.capability, registryEntry.executorId, "NO_EXECUTOR", `No executor is available for ${task.capability}.`, taskStartedAt, now()));
      continue;
    }
    try {
      results.push(await runTextFileTransformExecutor(task, request.workspace.root, registryEntry.executorId, taskStartedAt, now));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Executor failed.";
      results.push(createImmediateResult(task.taskId, task.capability, registryEntry.executorId, message.startsWith("Rejected:") ? "REJECTED" : "FAILED", message, taskStartedAt, now()));
    }
  }

  const finishedAt = now();
  return { executionId, planId: request.planId, status: overallStatus(results), startedAt, finishedAt, results };
}

function validateExecutionRequest(value: unknown, allowedWorkspaceRoot: string): { valid: true; request: HarnessExecutionRequest } | { valid: false; planId: string; message: string } {
  if (!value || typeof value !== "object") return { valid: false, planId: "invalid-plan", message: "Execution request is missing or invalid." };
  const request = value as Partial<HarnessExecutionRequest>;
  const planId = isText(request.planId) ? request.planId : "invalid-plan";
  if (!isText(request.planId)) return { valid: false, planId, message: "planId is required." };
  if (!Array.isArray(request.selectedTaskIds) || request.selectedTaskIds.length === 0 || !request.selectedTaskIds.every(isText)) return { valid: false, planId, message: "selectedTaskIds must contain at least one task id." };
  if (!isText(request.source)) return { valid: false, planId, message: "source is required." };
  if (!request.approval?.approved || !request.approval.confirmed || !isText(request.approval.token) || !isText(request.approval.approvedAt)) return { valid: false, planId, message: "Explicit user approval is required before execution." };
  if (request.approval.token !== `EXECUTE:${request.planId}`) return { valid: false, planId, message: "Approval token does not match the plan." };
  if (!request.workspace || !isText(request.workspace.root)) return { valid: false, planId, message: "workspace.root is required." };
  if (!samePath(request.workspace.root, allowedWorkspaceRoot)) return { valid: false, planId, message: "Workspace is outside the controlled execution root." };
  if (!Array.isArray(request.tasks) || request.tasks.length === 0) return { valid: false, planId, message: "Approved task payload is required." };
  for (const task of request.tasks) {
    if (!task || typeof task !== "object" || !isText((task as HarnessExecutionApprovedTask).taskId) || !isText((task as HarnessExecutionApprovedTask).capability) || !Array.isArray((task as HarnessExecutionApprovedTask).dependencies)) {
      return { valid: false, planId, message: "Approved task payload contains invalid fields." };
    }
  }
  return { valid: true, request: request as HarnessExecutionRequest };
}

async function runTextFileTransformExecutor(task: HarnessExecutionApprovedTask, workspaceRoot: string, executorId: string, startedAt: string, now: () => string): Promise<HarnessTaskExecutionResult> {
  const payload = parseTextFileTransformPayload(task.expectedOutputs);
  const targetPath = resolveWorkspacePath(workspaceRoot, payload.path);
  await assertNoSymlinkEscape(workspaceRoot, targetPath);
  const before = await metadata(targetPath);
  if (before.exists) await assertExistingFileIsText(targetPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, payload.text, "utf8");
  const after = await metadata(targetPath);
  return {
    taskId: task.taskId,
    capability: task.capability,
    executorId,
    status: "SUCCESS",
    message: `Updated ${path.relative(workspaceRoot, targetPath)}.`.replaceAll("\\", "/"),
    startedAt,
    finishedAt: now(),
    changedResources: [changedResource(workspaceRoot, targetPath, before, after)],
    errorSummary: null
  };
}

function parseTextFileTransformPayload(value: unknown): { path: string; text: string } {
  if (!value || typeof value !== "object") throw new Error("Rejected: file.transform requires expectedOutputs.fileTransform.");
  const payload = (value as { fileTransform?: unknown }).fileTransform;
  if (!payload || typeof payload !== "object") throw new Error("Rejected: file.transform requires expectedOutputs.fileTransform.");
  const candidate = payload as { path?: unknown; text?: unknown; content?: unknown };
  if (!isText(candidate.path)) throw new Error("Rejected: fileTransform.path is required.");
  const text = typeof candidate.text === "string" ? candidate.text : typeof candidate.content === "string" ? candidate.content : null;
  if (text === null) throw new Error("Rejected: fileTransform.text is required.");
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) throw new Error("Rejected: fileTransform.text exceeds the 64 KiB limit.");
  if (text.includes("\u0000")) throw new Error("Rejected: binary-like text is not allowed.");
  return { path: candidate.path, text };
}

function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  if (path.isAbsolute(requestedPath)) throw new Error("Rejected: fileTransform.path must be relative.");
  const normalizedRelative = path.normalize(requestedPath);
  if (normalizedRelative === "." || normalizedRelative.startsWith("..") || path.isAbsolute(normalizedRelative)) throw new Error("Rejected: path traversal is not allowed.");
  const extension = path.extname(normalizedRelative).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) throw new Error("Rejected: only text-like file extensions are allowed.");
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, normalizedRelative);
  if (!isInside(root, target)) throw new Error("Rejected: resolved path escapes the workspace.");
  return target;
}

async function assertNoSymlinkEscape(workspaceRoot: string, targetPath: string): Promise<void> {
  const root = path.resolve(workspaceRoot);
  let cursor = root;
  const relativeParts = path.relative(root, targetPath).split(path.sep).filter(Boolean);
  for (const part of relativeParts) {
    cursor = path.join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error("Rejected: symlink paths are not allowed.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function assertExistingFileIsText(filePath: string): Promise<void> {
  const extension = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) throw new Error("Rejected: binary overwrite is not allowed.");
  const buffer = await readFile(filePath);
  if (buffer.includes(0)) throw new Error("Rejected: existing binary file cannot be overwritten.");
}

async function metadata(filePath: string): Promise<{ exists: boolean; sizeBytes: number | null; modifiedAt: string | null }> {
  try {
    const info = await stat(filePath);
    return { exists: true, sizeBytes: info.size, modifiedAt: info.mtime.toISOString() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, sizeBytes: null, modifiedAt: null };
    throw error;
  }
}

function changedResource(root: string, filePath: string, before: Awaited<ReturnType<typeof metadata>>, after: Awaited<ReturnType<typeof metadata>>): HarnessChangedResource {
  return {
    path: path.relative(root, filePath).replaceAll("\\", "/"),
    beforeExists: before.exists,
    afterExists: after.exists,
    beforeSizeBytes: before.sizeBytes,
    afterSizeBytes: after.sizeBytes,
    beforeModifiedAt: before.modifiedAt,
    afterModifiedAt: after.modifiedAt
  };
}

function createImmediateResult(taskId: string, capability: string, executorId: string | null, status: HarnessExecutionTaskStatus, message: string, startedAt: string, finishedAt: string): HarnessTaskExecutionResult {
  return { taskId, capability, executorId, status, message, startedAt, finishedAt, changedResources: [], errorSummary: status === "SUCCESS" ? null : message };
}

function overallStatus(results: HarnessTaskExecutionResult[]): HarnessExecutionTaskStatus {
  if (results.length === 0) return "REJECTED";
  if (results.every((result) => result.status === "SUCCESS")) return "SUCCESS";
  if (results.some((result) => result.status === "FAILED")) return "FAILED";
  if (results.some((result) => result.status === "BLOCKED")) return "BLOCKED";
  if (results.some((result) => result.status === "NO_EXECUTOR")) return "NO_EXECUTOR";
  return "REJECTED";
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}