import { lstat, mkdir, open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  HarnessChangedResource,
  HarnessExecutionApproval,
  HarnessExecutionApprovalRequest,
  HarnessExecutionApprovedTask,
  HarnessExecutionRequest,
  HarnessExecutionResponse,
  HarnessExecutionTaskStatus,
  HarnessExecutorDescriptor,
  HarnessTaskExecutionResult
} from "../shared/harness-execution.js";

const KNOWN_CAPABILITIES = ["text", "reasoning", "image.generate", "image.edit", "image.analyze", "image.upscale", "audio.generate", "audio.edit", "audio.analyze", "music.generate", "voice.generate", "voice.convert", "file.transform", "workflow", "code", "repository"];
const TEXT_FILE_EXECUTOR_ID = "local.text-file-transform.v1";
const MAX_TEXT_BYTES = 64 * 1024;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".csv", ".log"]);
export const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000;

const usedApprovalIds = new Set<string>();
const lockedPaths = new Set<string>();

export interface HarnessApprovalStore { approvals: Map<string, HarnessExecutionApproval>; }
export function createHarnessApprovalStore(): HarnessApprovalStore { return { approvals: new Map() }; }
export const defaultHarnessApprovalStore = createHarnessApprovalStore();

export function createHarnessExecutorRegistry(): HarnessExecutorDescriptor[] {
  return KNOWN_CAPABILITIES.map((capability) => ({ capability, executorId: capability === "file.transform" ? TEXT_FILE_EXECUTOR_ID : `${capability}.unavailable`, available: capability === "file.transform", safetyClass: "SAFE_WORKSPACE_TEXT_WRITE", workspaceScope: "WORKSPACE_ONLY" }));
}

export function getHarnessExecutor(capability: string, registry = createHarnessExecutorRegistry()): HarnessExecutorDescriptor | null {
  return registry.find((executor) => executor.capability === capability) ?? null;
}

export function createPlanFingerprint(input: Pick<HarnessExecutionApprovalRequest, "planId" | "selectedTaskIds" | "workspace" | "tasks">): string {
  const selected = [...new Set(input.selectedTaskIds)].sort();
  const taskById = new Map(input.tasks.map((task) => [task.taskId, task]));
  const canonical = {
    planId: input.planId,
    selectedTaskIds: selected,
    workspaceRoot: path.resolve(input.workspace.root).toLowerCase(),
    tasks: selected.map((taskId) => {
      const task = taskById.get(taskId);
      return task ? { taskId: task.taskId, capability: task.capability, readinessStatus: task.readinessStatus, dependencies: [...task.dependencies].sort(), expectedOutputs: normalizeValue(task.expectedOutputs) } : { taskId, missing: true };
    })
  };
  return hashText(stableStringify(canonical));
}

export function createHarnessExecutionApproval(input: unknown, options: { allowedWorkspaceRoot: string; now?: () => string; ttlMs?: number; store?: HarnessApprovalStore }): HarnessExecutionApproval {
  const now = options.now ?? (() => new Date().toISOString());
  const ttlMs = options.ttlMs ?? DEFAULT_APPROVAL_TTL_MS;
  const validation = validateApprovalRequest(input, options.allowedWorkspaceRoot);
  if (!validation.valid) throw new Error(validation.message);
  const approvedAt = now();
  const expiresAt = new Date(Date.parse(approvedAt) + ttlMs).toISOString();
  const planFingerprint = createPlanFingerprint(validation.request);
  const approval: HarnessExecutionApproval = { approvalId: `approval-${randomUUID()}`, approved: true, confirmed: true, approvedAt, expiresAt, token: hashText(`${planFingerprint}:${randomBytes(16).toString("hex")}`), planFingerprint, selectedTaskIds: [...new Set(validation.request.selectedTaskIds)].sort(), workspaceRoot: path.resolve(validation.request.workspace.root) };
  (options.store ?? defaultHarnessApprovalStore).approvals.set(approval.approvalId, cloneApproval(approval));
  return cloneApproval(approval);
}

export async function executeApprovedHarnessTasks(input: unknown, options: { allowedWorkspaceRoot: string; now?: () => string; ttlMs?: number; store?: HarnessApprovalStore; verificationOverride?: (task: HarnessExecutionApprovedTask, targetPath: string, expectedText: string) => Promise<boolean> | boolean; beforeAtomicWrite?: (targetPath: string) => Promise<void> | void } ): Promise<HarnessExecutionResponse> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const executionId = `harness-exec-${randomUUID()}`;
  const validation = validateExecutionRequest(input, options.allowedWorkspaceRoot, options.store ?? defaultHarnessApprovalStore, now(), options.ttlMs ?? DEFAULT_APPROVAL_TTL_MS);
  if (!validation.valid) {
    const finishedAt = now();
    return { executionId, planId: validation.planId, planFingerprint: validation.planFingerprint, status: "REJECTED", startedAt, finishedAt, results: [createImmediateResult("request", "unknown", null, "REJECTED", validation.message, startedAt, finishedAt, validation.planFingerprint)] };
  }

  const request = validation.request;
  const registry = createHarnessExecutorRegistry();
  const taskById = new Map(request.tasks.map((task) => [task.taskId, task]));
  const results: HarnessTaskExecutionResult[] = [];
  const selected = [...new Set(request.selectedTaskIds)];

  for (const taskId of selected) {
    const taskStartedAt = now();
    const task = taskById.get(taskId);
    if (!task) { results.push(createImmediateResult(taskId, "unknown", null, "REJECTED", "Selected task is not included in approved task payload.", taskStartedAt, now(), validation.planFingerprint)); continue; }
    const registryEntry = getHarnessExecutor(task.capability, registry);
    if (!registryEntry) { results.push(createImmediateResult(task.taskId, task.capability, null, "REJECTED", `Unknown capability: ${task.capability}.`, taskStartedAt, now(), validation.planFingerprint)); continue; }
    if (task.readinessStatus !== "READY") { results.push(createImmediateResult(task.taskId, task.capability, registryEntry.executorId, task.readinessStatus === "BLOCKED_BY_DEPENDENCY" ? "BLOCKED" : "REJECTED", `Task is ${task.readinessStatus}, not READY.`, taskStartedAt, now(), validation.planFingerprint)); continue; }
    if (!registryEntry.available) { results.push(createImmediateResult(task.taskId, task.capability, registryEntry.executorId, "NO_EXECUTOR", `No executor is available for ${task.capability}.`, taskStartedAt, now(), validation.planFingerprint)); continue; }
    try { results.push(await runTextFileTransformExecutor(task, request.workspace.root, registryEntry.executorId, taskStartedAt, now, validation.planFingerprint, options)); }
    catch (error) { const message = error instanceof Error ? error.message : "Executor failed."; results.push(createImmediateResult(task.taskId, task.capability, registryEntry.executorId, message.startsWith("Rejected:") ? "REJECTED" : "FAILED", message, taskStartedAt, now(), validation.planFingerprint)); }
  }

  const finishedAt = now();
  return { executionId, planId: request.planId, planFingerprint: validation.planFingerprint, status: overallStatus(results), startedAt, finishedAt, results };
}

function validateApprovalRequest(value: unknown, allowedWorkspaceRoot: string): { valid: true; request: HarnessExecutionApprovalRequest } | { valid: false; planId: string; message: string } {
  const base = validateBaseRequest(value, allowedWorkspaceRoot);
  if (!base.valid) return base;
  return { valid: true, request: base.request };
}

function validateExecutionRequest(value: unknown, allowedWorkspaceRoot: string, store: HarnessApprovalStore, currentTime: string, ttlMs: number): { valid: true; request: HarnessExecutionRequest; planFingerprint: string } | { valid: false; planId: string; planFingerprint: string | null; message: string } {
  const base = validateBaseRequest(value, allowedWorkspaceRoot);
  if (!base.valid) return { ...base, planFingerprint: null };
  const request = value as Partial<HarnessExecutionRequest>;
  const approval = request.approval;
  if (!approval?.approved || !approval.confirmed || !isText(approval.token) || !isText(approval.approvalId) || !isText(approval.approvedAt) || !isText(approval.expiresAt) || !isText(approval.planFingerprint)) return { valid: false, planId: base.request.planId, planFingerprint: null, message: "Trusted execution approval is required." };
  const stored = store.approvals.get(approval.approvalId);
  if (!stored || stored.token !== approval.token) return { valid: false, planId: base.request.planId, planFingerprint: approval.planFingerprint, message: "Approval token is unknown or does not match trusted state." };
  if (usedApprovalIds.has(approval.approvalId)) return { valid: false, planId: base.request.planId, planFingerprint: stored.planFingerprint, message: "Approval token has already been used." };
  const approvedAtMs = Date.parse(stored.approvedAt), expiresAtMs = Date.parse(stored.expiresAt), currentMs = Date.parse(currentTime);
  if (!Number.isFinite(approvedAtMs) || !Number.isFinite(expiresAtMs) || !Number.isFinite(currentMs) || currentMs > expiresAtMs || currentMs - approvedAtMs > ttlMs) return { valid: false, planId: base.request.planId, planFingerprint: stored.planFingerprint, message: "Approval is stale or expired." };
  const currentFingerprint = createPlanFingerprint(base.request);
  if (currentFingerprint !== stored.planFingerprint || approval.planFingerprint !== stored.planFingerprint) return { valid: false, planId: base.request.planId, planFingerprint: currentFingerprint, message: "Plan fingerprint mismatch; approved task data changed." };
  if (base.request.planId !== base.request.planId || approval.workspaceRoot.toLowerCase() !== path.resolve(base.request.workspace.root).toLowerCase()) return { valid: false, planId: base.request.planId, planFingerprint: currentFingerprint, message: "Approval workspace does not match request workspace." };
  if (approval.selectedTaskIds.join("|") !== [...new Set(base.request.selectedTaskIds)].sort().join("|")) return { valid: false, planId: base.request.planId, planFingerprint: currentFingerprint, message: "Approval selected tasks do not match request." };
  usedApprovalIds.add(approval.approvalId);
  store.approvals.delete(approval.approvalId);
  return { valid: true, request: base.request as HarnessExecutionRequest, planFingerprint: currentFingerprint };
}

function validateBaseRequest(value: unknown, allowedWorkspaceRoot: string): { valid: true; request: HarnessExecutionApprovalRequest } | { valid: false; planId: string; message: string } {
  if (!value || typeof value !== "object") return { valid: false, planId: "invalid-plan", message: "Execution request is missing or invalid." };
  const request = value as Partial<HarnessExecutionApprovalRequest>;
  const planId = isText(request.planId) ? request.planId : "invalid-plan";
  if (!isText(request.planId)) return { valid: false, planId, message: "planId is required." };
  if (!Array.isArray(request.selectedTaskIds) || request.selectedTaskIds.length === 0 || !request.selectedTaskIds.every(isText)) return { valid: false, planId, message: "selectedTaskIds must contain at least one task id." };
  if (!isText(request.source)) return { valid: false, planId, message: "source is required." };
  if (!request.workspace || !isText(request.workspace.root)) return { valid: false, planId, message: "workspace.root is required." };
  if (!samePath(request.workspace.root, allowedWorkspaceRoot)) return { valid: false, planId, message: "Workspace is outside the controlled execution root." };
  if (!Array.isArray(request.tasks) || request.tasks.length === 0) return { valid: false, planId, message: "Approved task payload is required." };
  const selected = new Set(request.selectedTaskIds);
  const taskIds = new Set<string>();
  for (const task of request.tasks) {
    if (!task || typeof task !== "object" || !isText((task as HarnessExecutionApprovedTask).taskId) || !isText((task as HarnessExecutionApprovedTask).capability) || !Array.isArray((task as HarnessExecutionApprovedTask).dependencies)) return { valid: false, planId, message: "Approved task payload contains invalid fields." };
    taskIds.add((task as HarnessExecutionApprovedTask).taskId);
  }
  for (const taskId of selected) if (!taskIds.has(taskId)) return { valid: false, planId, message: `Selected task ${taskId} is not present in approved task payload.` };
  return { valid: true, request: request as HarnessExecutionApprovalRequest };
}

async function runTextFileTransformExecutor(task: HarnessExecutionApprovedTask, workspaceRoot: string, executorId: string, startedAt: string, now: () => string, planFingerprint: string, options: { verificationOverride?: (task: HarnessExecutionApprovedTask, targetPath: string, expectedText: string) => Promise<boolean> | boolean; beforeAtomicWrite?: (targetPath: string) => Promise<void> | void }): Promise<HarnessTaskExecutionResult> {
  const payload = parseTextFileTransformPayload(task.expectedOutputs);
  const targetPath = resolveWorkspacePath(workspaceRoot, payload.path);
  await assertNoSymlinkEscape(workspaceRoot, targetPath);
  const lockKey = path.resolve(targetPath).toLowerCase();
  if (lockedPaths.has(lockKey)) return createImmediateResult(task.taskId, task.capability, executorId, "BLOCKED", "Resource is locked by another execution.", startedAt, now(), planFingerprint);
  lockedPaths.add(lockKey);
  let beforeContent: Buffer | null = null;
  let rollbackAttempted = false, rollbackSucceeded: boolean | null = null;
  try {
    const before = await metadata(targetPath);
    if (before.exists) { await assertExistingFileIsText(targetPath); beforeContent = await readFile(targetPath); }
    const beforeHash = beforeContent ? hashBuffer(beforeContent) : null;
    await mkdir(path.dirname(targetPath), { recursive: true });
    await options.beforeAtomicWrite?.(targetPath);
    await atomicWriteText(targetPath, payload.text);
    const expectedHash = hashText(payload.text);
    const verifiedContent = await readFile(targetPath, "utf8");
    const afterHash = hashText(verifiedContent);
    const verificationPassed = afterHash === expectedHash && verifiedContent === payload.text && (await Promise.resolve(options.verificationOverride?.(task, targetPath, payload.text) ?? true));
    if (!verificationPassed) {
      rollbackAttempted = true;
      rollbackSucceeded = await rollbackFile(targetPath, before.exists, beforeContent);
      const after = await metadata(targetPath);
      return { taskId: task.taskId, capability: task.capability, executorId, status: "FAILED", message: "Post-write verification failed; rollback attempted.", startedAt, finishedAt: now(), changedResources: [changedResource(workspaceRoot, targetPath, before, after)], errorSummary: "Verification failed.", planFingerprint, verificationStatus: "FAILED", rollbackAttempted, rollbackSucceeded, beforeHash, afterHash };
    }
    const after = await metadata(targetPath);
    return { taskId: task.taskId, capability: task.capability, executorId, status: "SUCCESS", message: `Updated ${path.relative(workspaceRoot, targetPath)}.`.replaceAll("\\", "/"), startedAt, finishedAt: now(), changedResources: [changedResource(workspaceRoot, targetPath, before, after)], errorSummary: null, planFingerprint, verificationStatus: "PASSED", rollbackAttempted: false, rollbackSucceeded: null, beforeHash, afterHash };
  } finally { lockedPaths.delete(lockKey); }
}

async function atomicWriteText(targetPath: string, text: string): Promise<void> {
  const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(tempPath, "w", 0o600);
  try { await handle.writeFile(text, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(tempPath, targetPath);
  try { const dir = await open(path.dirname(targetPath), "r"); try { await dir.sync(); } finally { await dir.close(); } } catch { /* directory fsync is best effort on Windows */ }
}

async function rollbackFile(targetPath: string, existed: boolean, beforeContent: Buffer | null): Promise<boolean> {
  try { if (existed && beforeContent) await atomicWriteText(targetPath, beforeContent.toString("utf8")); else await unlink(targetPath).catch((error) => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); return true; }
  catch { return false; }
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
  const root = path.resolve(workspaceRoot), target = path.resolve(root, normalizedRelative);
  if (!isInside(root, target)) throw new Error("Rejected: resolved path escapes the workspace.");
  return target;
}

async function assertNoSymlinkEscape(workspaceRoot: string, targetPath: string): Promise<void> {
  const root = path.resolve(workspaceRoot); let cursor = root;
  for (const part of path.relative(root, targetPath).split(path.sep).filter(Boolean)) { cursor = path.join(cursor, part); try { const info = await lstat(cursor); if (info.isSymbolicLink()) throw new Error("Rejected: symlink paths are not allowed."); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } }
}
async function assertExistingFileIsText(filePath: string): Promise<void> { if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) throw new Error("Rejected: binary overwrite is not allowed."); const buffer = await readFile(filePath); if (buffer.includes(0)) throw new Error("Rejected: existing binary file cannot be overwritten."); }
async function metadata(filePath: string): Promise<{ exists: boolean; sizeBytes: number | null; modifiedAt: string | null }> { try { const info = await stat(filePath); return { exists: true, sizeBytes: info.size, modifiedAt: info.mtime.toISOString() }; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, sizeBytes: null, modifiedAt: null }; throw error; } }
function changedResource(root: string, filePath: string, before: Awaited<ReturnType<typeof metadata>>, after: Awaited<ReturnType<typeof metadata>>): HarnessChangedResource { return { path: path.relative(root, filePath).replaceAll("\\", "/"), beforeExists: before.exists, afterExists: after.exists, beforeSizeBytes: before.sizeBytes, afterSizeBytes: after.sizeBytes, beforeModifiedAt: before.modifiedAt, afterModifiedAt: after.modifiedAt }; }
function createImmediateResult(taskId: string, capability: string, executorId: string | null, status: HarnessExecutionTaskStatus, message: string, startedAt: string, finishedAt: string, planFingerprint: string | null): HarnessTaskExecutionResult { return { taskId, capability, executorId, status, message, startedAt, finishedAt, changedResources: [], errorSummary: status === "SUCCESS" ? null : message, planFingerprint, verificationStatus: "NOT_RUN", rollbackAttempted: false, rollbackSucceeded: null, beforeHash: null, afterHash: null }; }
function overallStatus(results: HarnessTaskExecutionResult[]): HarnessExecutionTaskStatus { if (results.length === 0) return "REJECTED"; if (results.every((result) => result.status === "SUCCESS")) return "SUCCESS"; if (results.some((result) => result.status === "FAILED")) return "FAILED"; if (results.some((result) => result.status === "BLOCKED")) return "BLOCKED"; if (results.some((result) => result.status === "NO_EXECUTOR")) return "NO_EXECUTOR"; return "REJECTED"; }
function stableStringify(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`; }
function normalizeValue(value: unknown): unknown { if (value === undefined) return null; if (value === null || typeof value !== "object") return value; if (Array.isArray(value)) return value.map(normalizeValue); return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalizeValue(item)])); }
function hashText(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function hashBuffer(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function isText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function samePath(left: string, right: string): boolean { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase(); }
function isInside(root: string, target: string): boolean { const relative = path.relative(root, target); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function cloneApproval(approval: HarnessExecutionApproval): HarnessExecutionApproval { return { ...approval, selectedTaskIds: [...approval.selectedTaskIds] }; }
export function resetHarnessExecutionHardeningState(): void { usedApprovalIds.clear(); lockedPaths.clear(); defaultHarnessApprovalStore.approvals.clear(); }