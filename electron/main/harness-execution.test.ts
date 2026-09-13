import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { HarnessExecutionApprovedTask, HarnessExecutionRequest, HarnessExecutionResponse } from "../shared/harness-execution.js";
import {
  appendHarnessExecutionHistory,
  createHarnessExecutionHistoryItem,
  deserializeHarnessExecutionHistory,
  serializeHarnessExecutionHistory
} from "../shared/harness-execution.js";
import { createHarnessExecutorRegistry, executeApprovedHarnessTasks, getHarnessExecutor } from "./harness-execution.js";

async function withWorkspace<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-studio-harness-exec-"));
  try { return await fn(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

function fileTask(overrides: Partial<HarnessExecutionApprovedTask> = {}): HarnessExecutionApprovedTask {
  return {
    taskId: "T1",
    title: "Write local text file",
    capability: "file.transform",
    readinessStatus: "READY",
    dependencies: [],
    expectedOutputs: { fileTransform: { path: "notes/output.txt", text: "hello harness" } },
    ...overrides
  };
}

function request(root: string, overrides: Partial<HarnessExecutionRequest> = {}): HarnessExecutionRequest {
  return {
    planId: "plan-1",
    selectedTaskIds: ["T1"],
    source: "harness-plan-preview",
    approval: { approved: true, confirmed: true, approvedAt: "2026-01-01T00:00:00.000Z", token: "EXECUTE:plan-1" },
    workspace: { root },
    tasks: [fileTask()],
    ...overrides
  };
}

test("execution IPC validation rejects missing approval", async () => withWorkspace(async (root) => {
  const result = await executeApprovedHarnessTasks(request(root, { approval: { approved: false, confirmed: false, approvedAt: "", token: "" } }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /Explicit user approval/);
}));

test("unknown capability is hard rejected", async () => withWorkspace(async (root) => {
  const result = await executeApprovedHarnessTasks(request(root, { tasks: [fileTask({ capability: "unknown.magic" })] }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.results[0].executorId, null);
  assert.match(result.results[0].message, /Unknown capability/);
}));

test("non-READY task is rejected before executor run", async () => withWorkspace(async (root) => {
  const result = await executeApprovedHarnessTasks(request(root, { tasks: [fileTask({ readinessStatus: "NO_EXECUTOR" })] }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /not READY/);
}));

test("unapproved selected task is rejected", async () => withWorkspace(async (root) => {
  const result = await executeApprovedHarnessTasks(request(root, { selectedTaskIds: ["T2"] }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /not included/);
}));

test("invalid workspace is rejected", async () => withWorkspace(async (root) => {
  const other = path.join(root, "other");
  const result = await executeApprovedHarnessTasks(request(other), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /Workspace is outside/);
}));

test("path traversal is rejected", async () => withWorkspace(async (root) => {
  const result = await executeApprovedHarnessTasks(request(root, { tasks: [fileTask({ expectedOutputs: { fileTransform: { path: "../escape.txt", text: "no" } } })] }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /path traversal/);
}));

test("registry lookup exposes exactly one available executor", () => {
  const registry = createHarnessExecutorRegistry();
  assert.equal(registry.filter((executor) => executor.available).length, 1);
  assert.equal(getHarnessExecutor("file.transform")?.executorId, "local.text-file-transform.v1");
  assert.equal(getHarnessExecutor("image.generate")?.available, false);
  assert.equal(getHarnessExecutor("alien")?.available, undefined);
});

test("safe text-file executor writes inside workspace", async () => withWorkspace(async (root) => {
  const result = await executeApprovedHarnessTasks(request(root), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "SUCCESS");
  assert.equal(await readFile(path.join(root, "notes", "output.txt"), "utf8"), "hello harness");
  assert.deepEqual(result.results[0].changedResources.map((resource) => [resource.path, resource.beforeExists, resource.afterExists]), [["notes/output.txt", false, true]]);
}));

test("executor failure is normalized", async () => withWorkspace(async (root) => {
  await writeFile(path.join(root, "blocked"), "not a directory", "utf8");
  const result = await executeApprovedHarnessTasks(request(root, { tasks: [fileTask({ expectedOutputs: { fileTransform: { path: "blocked/output.txt", text: "hello" } } })] }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "FAILED");
  assert.equal(result.results[0].status, "FAILED");
  assert.ok(result.results[0].errorSummary);
}));

test("NO_EXECUTOR is returned for known unavailable capability", async () => withWorkspace(async (root) => {
  const result = await executeApprovedHarnessTasks(request(root, { tasks: [fileTask({ capability: "image.generate" })] }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "NO_EXECUTOR");
  assert.equal(result.results[0].status, "NO_EXECUTOR");
}));

test("result model includes timing and changed resources", async () => withWorkspace(async (root) => {
  const ticks = ["2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z", "2026-01-01T00:00:02.000Z"];
  const result = await executeApprovedHarnessTasks(request(root), { allowedWorkspaceRoot: root, now: () => ticks.shift() ?? "2026-01-01T00:00:03.000Z" });
  assert.equal(result.startedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(result.results[0].startedAt, "2026-01-01T00:00:01.000Z");
  assert.equal(result.results[0].changedResources.length, 1);
}));

test("execution history serialize and deserialize safely", () => {
  const response: HarnessExecutionResponse = { executionId: "exec-1", planId: "plan-1", status: "SUCCESS", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z", results: [{ taskId: "T1", capability: "file.transform", executorId: "local.text-file-transform.v1", status: "SUCCESS", message: "ok", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z", changedResources: [], errorSummary: null }] };
  const item = createHarnessExecutionHistoryItem(response);
  const parsed = deserializeHarnessExecutionHistory(serializeHarnessExecutionHistory([item]));
  assert.equal(parsed[0].executionId, "exec-1");
  assert.equal(parsed[0].taskSummaries[0].capability, "file.transform");
});

test("corrupt execution history does not crash", () => {
  assert.deepEqual(deserializeHarnessExecutionHistory("{bad"), []);
  assert.deepEqual(deserializeHarnessExecutionHistory(JSON.stringify({ nope: true })), []);
});

test("execution history is bounded", () => {
  const items = Array.from({ length: 5 }, (_, index) => ({ executionId: `exec-${index}`, planId: "plan", timestamp: "2026-01-01T00:00:00.000Z", selectedTaskIds: [`T${index}`], status: "SUCCESS" as const, taskSummaries: [] }));
  const next = appendHarnessExecutionHistory(items, { ...items[2], status: "FAILED" }, 3);
  assert.deepEqual(next.map((item) => item.executionId), ["exec-2", "exec-0", "exec-1"]);
  assert.equal(next[0].status, "FAILED");
});

test("absolute paths are rejected", async () => withWorkspace(async (root) => {
  const result = await executeApprovedHarnessTasks(request(root, { tasks: [fileTask({ expectedOutputs: { fileTransform: { path: path.join(root, "absolute.txt"), text: "no" } } })] }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /must be relative/);
}));

test("symlink workspace paths are rejected when available", async (context) => withWorkspace(async (root) => {
  if (process.platform === "win32") { context.skip("Windows symlink privileges are environment-dependent"); return; }
  await mkdir(path.join(root, "real"));
  await import("node:fs/promises").then((fs) => fs.symlink(path.join(root, "real"), path.join(root, "link")));
  const result = await executeApprovedHarnessTasks(request(root, { tasks: [fileTask({ expectedOutputs: { fileTransform: { path: "link/output.txt", text: "no" } } })] }), { allowedWorkspaceRoot: root });
  assert.equal(result.status, "REJECTED");
  assert.match(result.results[0].message, /symlink/);
}));