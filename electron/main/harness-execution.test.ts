import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { HarnessExecutionApprovedTask, HarnessExecutionApprovalRequest, HarnessExecutionRequest, HarnessExecutionResponse } from "../shared/harness-execution.js";
import { appendHarnessExecutionHistory, createHarnessExecutionHistoryItem, deserializeHarnessExecutionHistory, serializeHarnessExecutionHistory } from "../shared/harness-execution.js";
import { appendHarnessAuditLog, createHarnessApprovalStore, createHarnessExecutionApproval, createHarnessExecutionReview, createHarnessExecutorRegistry, createPersistentHarnessExecutionApproval, createPlanFingerprint, executePersistentApprovedHarnessTasks, executeApprovedHarnessTasks, getHarnessExecutor, loadHarnessApprovalStore, readHarnessAuditLog, resetHarnessExecutionHardeningState } from "./harness-execution.js";

async function withWorkspace<T>(fn: (root: string) => Promise<T>): Promise<T> { const root = await mkdtemp(path.join(os.tmpdir(), "ai-studio-harness-exec-")); try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); } }
function fileTask(overrides: Partial<HarnessExecutionApprovedTask> = {}): HarnessExecutionApprovedTask { return { taskId: "T1", title: "Write local text file", capability: "file.transform", readinessStatus: "READY", dependencies: [], expectedOutputs: { fileTransform: { path: "notes/output.txt", text: "hello harness" } }, ...overrides }; }
function approvalRequest(root: string, overrides: Partial<HarnessExecutionApprovalRequest> = {}): HarnessExecutionApprovalRequest { return { planId: "plan-1", selectedTaskIds: ["T1"], source: "harness-plan-preview", workspace: { root }, tasks: [fileTask()], ...overrides }; }
function approved(root: string, overrides: Partial<HarnessExecutionApprovalRequest> = {}, options: { now?: () => string; ttlMs?: number } = {}): { request: HarnessExecutionRequest; store: ReturnType<typeof createHarnessApprovalStore> } { const store = createHarnessApprovalStore(); const base = approvalRequest(root, overrides); const approval = createHarnessExecutionApproval(base, { allowedWorkspaceRoot: root, store, ...options }); return { request: { ...base, approval }, store }; }

test("fingerprint is stable across task and selected id ordering", async () => withWorkspace(async (root) => {
  const a = approvalRequest(root, { selectedTaskIds: ["B", "A"], tasks: [fileTask({ taskId: "B", dependencies: ["A"] }), fileTask({ taskId: "A" })] });
  const b = approvalRequest(root, { selectedTaskIds: ["A", "B"], tasks: [fileTask({ taskId: "A" }), fileTask({ taskId: "B", dependencies: ["A"] })] });
  assert.equal(createPlanFingerprint(a), createPlanFingerprint(b));
}));

test("payload tampering is rejected by fingerprint", async () => withWorkspace(async (root) => {
  const { request, store } = approved(root);
  request.tasks[0].expectedOutputs = { fileTransform: { path: "notes/output.txt", text: "tampered" } };
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /fingerprint mismatch/i);
}));

test("forged task id is rejected before approval", async () => withWorkspace(async (root) => {
  assert.throws(() => createHarnessExecutionApproval(approvalRequest(root, { selectedTaskIds: ["FORGED"] }), { allowedWorkspaceRoot: root }), /not present/);
}));

test("stale approval is rejected", async () => withWorkspace(async (root) => {
  const store = createHarnessApprovalStore();
  const base = approvalRequest(root);
  const approval = createHarnessExecutionApproval(base, { allowedWorkspaceRoot: root, store, now: () => "2026-01-01T00:00:00.000Z", ttlMs: 1000 });
  const result = await executeApprovedHarnessTasks({ ...base, approval }, { allowedWorkspaceRoot: root, store, now: () => "2026-01-01T00:00:02.000Z", ttlMs: 1000 });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /stale|expired/i);
}));

test("workspace mismatch is rejected", async () => withWorkspace(async (root) => {
  const other = path.join(root, "other");
  assert.throws(() => createHarnessExecutionApproval(approvalRequest(other), { allowedWorkspaceRoot: root }), /Workspace is outside/);
}));

test("token mismatch is rejected", async () => withWorkspace(async (root) => {
  const { request, store } = approved(root);
  request.approval.token = "wrong";
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /token/i);
}));

test("approval token is single-use", async () => withWorkspace(async (root) => {
  resetHarnessExecutionHardeningState();
  const { request, store } = approved(root);
  assert.equal((await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store })).status, "SUCCESS");
  const second = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.equal(second.status, "REJECTED");
  assert.match(second.results[0].message, /token/i);
}));

test("atomic success writes and verifies content", async () => withWorkspace(async (root) => {
  const { request, store } = approved(root);
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.results[0].verificationStatus, "PASSED");
  assert.equal(await readFile(path.join(root, "notes", "output.txt"), "utf8"), "hello harness");
}));

test("verification failure rolls back existing file", async () => withWorkspace(async (root) => {
  await mkdir(path.join(root, "notes")); await writeFile(path.join(root, "notes", "output.txt"), "before", "utf8");
  const { request, store } = approved(root);
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store, verificationOverride: () => false });
  assert.equal(result.status, "FAILED");
  assert.equal(result.results[0].verificationStatus, "FAILED");
  assert.equal(result.results[0].rollbackAttempted, true);
  assert.equal(result.results[0].rollbackSucceeded, true);
  assert.equal(await readFile(path.join(root, "notes", "output.txt"), "utf8"), "before");
}));

test("verification failure removes newly-created file", async () => withWorkspace(async (root) => {
  const { request, store } = approved(root);
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store, verificationOverride: () => false });
  assert.equal(result.status, "FAILED");
  await assert.rejects(() => readFile(path.join(root, "notes", "output.txt"), "utf8"), /ENOENT/);
}));

test("concurrent same-path execution is blocked", async () => withWorkspace(async (root) => {
  const first = approved(root); const second = approved(root);
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const firstRun = executeApprovedHarnessTasks(first.request, { allowedWorkspaceRoot: root, store: first.store, beforeAtomicWrite: async () => gate });
  await new Promise((resolve) => setTimeout(resolve, 25));
  const secondRun = await executeApprovedHarnessTasks(second.request, { allowedWorkspaceRoot: root, store: second.store });
  release(); await firstRun;
  assert.equal(secondRun.status, "BLOCKED");
  assert.match(secondRun.results[0].message, /locked/);
}));

test("before and after hashes are captured", async () => withWorkspace(async (root) => {
  await mkdir(path.join(root, "notes")); await writeFile(path.join(root, "notes", "output.txt"), "before", "utf8");
  const { request, store } = approved(root);
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.match(result.results[0].beforeHash ?? "", /^[a-f0-9]{64}$/);
  assert.match(result.results[0].afterHash ?? "", /^[a-f0-9]{64}$/);
  assert.notEqual(result.results[0].beforeHash, result.results[0].afterHash);
}));

test("history serialization includes fingerprint verification and rollback summary only", async () => withWorkspace(async (root) => {
  const { request, store } = approved(root);
  const response = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  const parsed = deserializeHarnessExecutionHistory(serializeHarnessExecutionHistory([createHarnessExecutionHistoryItem(response)]));
  assert.equal(parsed[0].planFingerprint, response.planFingerprint);
  assert.equal(parsed[0].taskSummaries[0].verificationStatus, "PASSED");
  assert.equal(parsed[0].taskSummaries[0].rollbackAttempted, false);
  assert.equal(JSON.stringify(parsed).includes("hello harness"), false);
}));

test("corrupt execution history does not crash", () => {
  assert.deepEqual(deserializeHarnessExecutionHistory("{bad"), []);
  assert.deepEqual(deserializeHarnessExecutionHistory(JSON.stringify({ nope: true })), []);
});

test("execution history is bounded", () => {
  const items = Array.from({ length: 5 }, (_, index) => ({ executionId: `exec-${index}`, planId: "plan", planFingerprint: `fp-${index}`, timestamp: "2026-01-01T00:00:00.000Z", selectedTaskIds: [`T${index}`], status: "SUCCESS" as const, taskSummaries: [] }));
  const next = appendHarnessExecutionHistory(items, { ...items[2], status: "FAILED" }, 3);
  assert.deepEqual(next.map((item) => item.executionId), ["exec-2", "exec-0", "exec-1"]);
});

test("path traversal is rejected", async () => withWorkspace(async (root) => {
  const { request, store } = approved(root, { tasks: [fileTask({ expectedOutputs: { fileTransform: { path: "../escape.txt", text: "no" } } })] });
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /path traversal/);
}));

test("registry still exposes exactly one available executor", () => {
  const registry = createHarnessExecutorRegistry();
  assert.equal(registry.filter((executor) => executor.available).length, 1);
  assert.equal(getHarnessExecutor("file.transform")?.executorId, "local.text-file-transform.v1");
  assert.equal(getHarnessExecutor("image.generate")?.available, false);
});

test("known unavailable capability returns NO_EXECUTOR", async () => withWorkspace(async (root) => {
  const { request, store } = approved(root, { tasks: [fileTask({ capability: "image.generate" })] });
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.equal(result.status, "NO_EXECUTOR");
}));

test("absolute paths are rejected", async () => withWorkspace(async (root) => {
  const { request, store } = approved(root, { tasks: [fileTask({ expectedOutputs: { fileTransform: { path: path.join(root, "absolute.txt"), text: "no" } } })] });
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /must be relative/);
}));

test("symlink workspace paths are rejected when available", async (context) => withWorkspace(async (root) => {
  if (process.platform === "win32") { context.skip("Windows symlink privileges are environment-dependent"); return; }
  await mkdir(path.join(root, "real")); await import("node:fs/promises").then((fs) => fs.symlink(path.join(root, "real"), path.join(root, "link")));
  const { request, store } = approved(root, { tasks: [fileTask({ expectedOutputs: { fileTransform: { path: "link/output.txt", text: "no" } } })] });
  const result = await executeApprovedHarnessTasks(request, { allowedWorkspaceRoot: root, store });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /symlink/);
}));
test("persistent approval is saved as validation metadata", async () => withWorkspace(async (root) => {
  const approvalPath = path.join(root, "governance", "approvals.json");
  const approval = await createPersistentHarnessExecutionApproval(approvalRequest(root), { allowedWorkspaceRoot: root, approvalStorePath: approvalPath, now: () => "2026-01-01T00:00:00.000Z" });
  const raw = await readFile(approvalPath, "utf8");
  assert.match(raw, new RegExp(approval.approvalId));
  assert.equal(raw.includes("hello harness"), false);
}));

test("persistent approval reloads and can execute once", async () => withWorkspace(async (root) => {
  const approvalPath = path.join(root, "governance", "approvals.json");
  const auditPath = path.join(root, "governance", "audit.jsonl");
  const base = approvalRequest(root);
  const approval = await createPersistentHarnessExecutionApproval(base, { allowedWorkspaceRoot: root, approvalStorePath: approvalPath });
  const reloaded = await loadHarnessApprovalStore(approvalPath);
  assert.equal(reloaded.approvals.has(approval.approvalId), true);
  const result = await executePersistentApprovedHarnessTasks({ ...base, approval }, { allowedWorkspaceRoot: root, approvalStorePath: approvalPath, auditLogPath: auditPath });
  assert.equal(result.status, "SUCCESS");
  assert.equal((await loadHarnessApprovalStore(approvalPath)).approvals.size, 0);
}));

test("expired approval cleanup removes stale entries", async () => withWorkspace(async (root) => {
  const approvalPath = path.join(root, "approvals.json");
  await createPersistentHarnessExecutionApproval(approvalRequest(root), { allowedWorkspaceRoot: root, approvalStorePath: approvalPath, now: () => "2026-01-01T00:00:00.000Z", ttlMs: 1000 });
  const store = await loadHarnessApprovalStore(approvalPath, { now: "2026-01-01T00:00:02.000Z", ttlMs: 1000 });
  assert.equal(store.approvals.size, 0);
}));

test("corrupt approval store recovers as empty", async () => withWorkspace(async (root) => {
  const approvalPath = path.join(root, "approvals.json");
  await writeFile(approvalPath, "{bad", "utf8");
  const store = await loadHarnessApprovalStore(approvalPath);
  assert.equal(store.approvals.size, 0);
}));

test("execution review exposes exact metadata and diff preview", async () => withWorkspace(async (root) => {
  await mkdir(path.join(root, "notes")); await writeFile(path.join(root, "notes", "output.txt"), "old\nline", "utf8");
  const review = await createHarnessExecutionReview(approvalRequest(root, { tasks: [fileTask({ expectedOutputs: { fileTransform: { path: "notes/output.txt", text: "new\nline" } } })] }), { allowedWorkspaceRoot: root, now: () => "2026-01-01T00:00:00.000Z" });
  assert.equal(review.tasks[0].targetRelativePath, "notes/output.txt");
  assert.equal(review.tasks[0].fileExists, true);
  assert.match(review.tasks[0].beforeHash ?? "", /^[a-f0-9]{64}$/);
  assert.match(review.tasks[0].expectedAfterHash ?? "", /^[a-f0-9]{64}$/);
  assert.match(review.tasks[0].diffPreview, /-old/);
  assert.match(review.tasks[0].diffPreview, /\+new/);
}));

test("audit append persists summary only", async () => withWorkspace(async (root) => {
  const approvalPath = path.join(root, "approvals.json"); const auditPath = path.join(root, "audit.jsonl"); const base = approvalRequest(root);
  const approval = await createPersistentHarnessExecutionApproval(base, { allowedWorkspaceRoot: root, approvalStorePath: approvalPath });
  const result = await executePersistentApprovedHarnessTasks({ ...base, approval }, { allowedWorkspaceRoot: root, approvalStorePath: approvalPath, auditLogPath: auditPath });
  const entries = await readHarnessAuditLog(auditPath);
  assert.equal(entries[0].executionId, result.executionId);
  assert.equal(entries[0].targetPath, "notes/output.txt");
  assert.equal((await readFile(auditPath, "utf8")).includes("hello harness"), false);
}));

test("audit corruption recovery skips invalid lines", async () => withWorkspace(async (root) => {
  const auditPath = path.join(root, "audit.jsonl");
  await writeFile(auditPath, "{bad\n{\"executionId\":\"e\",\"planId\":\"p\",\"taskId\":\"t\",\"capability\":\"file.transform\",\"outcome\":\"SUCCESS\",\"verificationStatus\":\"PASSED\"}\n", "utf8");
  const entries = await readHarnessAuditLog(auditPath);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].executionId, "e");
}));

test("audit retention is bounded and rotated", async () => withWorkspace(async (root) => {
  const auditPath = path.join(root, "audit.jsonl");
  const entries = Array.from({ length: 5 }, (_, index) => ({ executionId: `e${index}`, approvalId: null, planId: "p", fingerprint: null, taskId: `t${index}`, capability: "file.transform", executorId: "local.text-file-transform.v1", workspaceIdentifier: "w", targetPath: `f${index}.txt`, startedAt: "s", finishedAt: "f", outcome: "SUCCESS" as const, verificationStatus: "PASSED" as const, rollbackAttempted: false, rollbackSucceeded: null, beforeHash: null, afterHash: null, reason: null }));
  await appendHarnessAuditLog(auditPath, entries, 3);
  assert.deepEqual((await readHarnessAuditLog(auditPath, 10)).map((entry) => entry.executionId), ["e4", "e3", "e2"]);
}));

test("renderer cannot forge audit records through execution request", async () => withWorkspace(async (root) => {
  const approvalPath = path.join(root, "approvals.json"); const auditPath = path.join(root, "audit.jsonl"); const base = approvalRequest(root);
  const approval = await createPersistentHarnessExecutionApproval(base, { allowedWorkspaceRoot: root, approvalStorePath: approvalPath });
  await executePersistentApprovedHarnessTasks({ ...base, approval, fakeAudit: { outcome: "SUCCESS", taskId: "forged" } }, { allowedWorkspaceRoot: root, approvalStorePath: approvalPath, auditLogPath: auditPath });
  const entries = await readHarnessAuditLog(auditPath);
  assert.equal(entries.some((entry) => entry.taskId === "forged"), false);
  assert.equal(entries[0].taskId, "T1");
}));
