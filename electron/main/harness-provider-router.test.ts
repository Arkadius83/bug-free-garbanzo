import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { spawn } from "node:child_process";
import { runProcessWithStateTracking } from "./harness-provider-router.js";
import { buildProviderExecutionTrace, classifyProviderProcessClose, createProviderExecutionDiagnostic, localQwenFallbackSource, providerAttemptDiagnostics } from "./harness-provider-router.js";

test("AI Studio local Qwen fallback override disables thinking", () => {
  const source = localQwenFallbackSource();
  assert.match(source, /think:\s*false/);
});

test("AI Studio local Qwen fallback override sets explicit output budget", () => {
  const source = localQwenFallbackSource();
  assert.match(source, /num_predict:\s*input\.localQwenNumPredict/);
  assert.match(source, /num_ctx:\s*8192/);
});

test("AI Studio local Qwen fallback override keeps deterministic generation settings", () => {
  const source = localQwenFallbackSource();
  assert.match(source, /temperature:\s*0/);
  assert.match(source, /stream:\s*false/);
});

test("AI Studio local Qwen fallback reports reasoning-only length failures clearly", () => {
  const source = localQwenFallbackSource();
  assert.match(source, /Qwen returned no final response/);
  assert.match(source, /data\.done_reason === "length"/);
});

test("provider runner treats valid JSON result followed by null exit code as success", () => {
  const stdout = [
    "[provider-router] Routing complete: ok=true provider=ollama model=qwen3.5:9b",
    JSON.stringify({ ok: true, provider: "ollama", model: "qwen3.5:9b", output: "OK", durationMs: 10, attempts: [] })
  ].join("\n");
  const decision = classifyProviderProcessClose({ code: null, signal: "SIGTERM", stdout, signalAborted: false, timedOut: false, label: "provider runner" });
  assert.equal(decision.action, "resolve");
  assert.match(decision.detail, /exit code null signal SIGTERM/);
  assert.match(decision.detail, /valid result already received/);
});

test("provider runner rejects null exit without a valid result", () => {
  const decision = classifyProviderProcessClose({ code: null, signal: "SIGTERM", stdout: "not-json", signalAborted: false, timedOut: false, label: "provider runner" });
  assert.equal(decision.action, "reject");
  assert.match(decision.detail, /exit code null signal SIGTERM/);
});

test("provider runner keeps user cancellation distinct from cleanup success", () => {
  const stdout = JSON.stringify({ ok: true, provider: "ollama", model: "qwen3.5:9b", output: "OK", durationMs: 10, attempts: [] });
  const decision = classifyProviderProcessClose({ code: null, signal: "SIGTERM", stdout, signalAborted: true, timedOut: false, label: "provider runner" });
  assert.equal(decision.action, "cancel");
  assert.match(decision.detail, /user abort/);
});

test("provider runner keeps timeout distinct from cleanup success", () => {
  const stdout = JSON.stringify({ ok: true, provider: "ollama", model: "qwen3.5:9b", output: "OK", durationMs: 10, attempts: [] });
  const decision = classifyProviderProcessClose({ code: null, signal: "SIGTERM", stdout, signalAborted: false, timedOut: true, label: "provider runner" });
  assert.equal(decision.action, "timeout");
  assert.match(decision.detail, /hard limit reached/);
});

test("provider diagnostics records normal success", () => {
  const diagnostic = createProviderExecutionDiagnostic({
    providerId: "provider-runner",
    providerName: "Harness provider runner",
    startMs: 1_000,
    endMs: 1_250,
    finalStatus: "success",
    exitCode: 0,
    exitSignal: null,
    validResultReceived: true,
    fallbackUsed: false
  });
  assert.equal(diagnostic.finalStatus, "success");
  assert.equal(diagnostic.durationMs, 250);
  assert.equal(diagnostic.exitCode, 0);
  assert.equal(diagnostic.validResultReceived, true);
});

test("provider diagnostics records invalid JSON as invalid_result trace", () => {
  const diagnostic = createProviderExecutionDiagnostic({
    providerId: "provider-runner",
    providerName: "Harness provider runner",
    startMs: 1_000,
    endMs: 1_100,
    finalStatus: "success",
    exitCode: 0,
    validResultReceived: false
  });
  const trace = buildProviderExecutionTrace({ startMs: 1_000, endMs: 1_110, diagnostics: [diagnostic], finalStatus: "invalid_result" });
  assert.equal(trace.finalStatus, "invalid_result");
  assert.equal(trace.diagnostics[0]?.validResultReceived, false);
});

test("provider diagnostics records crash status", () => {
  const decision = classifyProviderProcessClose({ code: 1, signal: null, stdout: "", signalAborted: false, timedOut: false, label: "provider runner" });
  const diagnostic = createProviderExecutionDiagnostic({
    providerId: "provider-runner",
    providerName: "Harness provider runner",
    startMs: 2_000,
    endMs: 2_010,
    finalStatus: "crash",
    exitCode: 1,
    exitSignal: null,
    errorMessage: decision.detail
  });
  assert.equal(decision.action, "reject");
  assert.equal(diagnostic.finalStatus, "crash");
  assert.match(diagnostic.errorMessage ?? "", /exit code 1/);
});

test("provider diagnostics records cancellation status", () => {
  const decision = classifyProviderProcessClose({ code: null, signal: "SIGTERM", stdout: "", signalAborted: true, timedOut: false, label: "provider runner" });
  const diagnostic = createProviderExecutionDiagnostic({
    providerId: "provider-runner",
    providerName: "Harness provider runner",
    startMs: 3_000,
    endMs: 3_010,
    finalStatus: "cancelled",
    exitCode: null,
    exitSignal: "SIGTERM",
    errorCode: "CANCELLED",
    errorMessage: decision.detail
  });
  assert.equal(decision.action, "cancel");
  assert.equal(diagnostic.finalStatus, "cancelled");
  assert.match(diagnostic.errorMessage ?? "", /user abort/);
});

test("provider diagnostics records timeout status", () => {
  const decision = classifyProviderProcessClose({ code: null, signal: "SIGTERM", stdout: "", signalAborted: false, timedOut: true, label: "provider runner" });
  const diagnostic = createProviderExecutionDiagnostic({
    providerId: "provider-runner",
    providerName: "Harness provider runner",
    startMs: 4_000,
    endMs: 4_500,
    finalStatus: "timeout",
    exitCode: null,
    exitSignal: "SIGTERM",
    errorCode: "TIMEOUT",
    errorMessage: decision.detail
  });
  assert.equal(decision.action, "timeout");
  assert.equal(diagnostic.finalStatus, "timeout");
  assert.equal(diagnostic.durationMs, 500);
});

test("provider diagnostics records fallback provider execution", () => {
  const diagnostics = providerAttemptDiagnostics([
    { provider: "opencode-http", model: "free-model", label: "Free Cloud", ok: false, durationMs: 25, errorType: "SERVER_UNAVAILABLE", errorMessage: "offline" },
    { provider: "ollama", model: "qwen3.5:9b", label: "Qwen Local", ok: true, durationMs: 75 }
  ], 10_000);
  const trace = buildProviderExecutionTrace({ startMs: 9_800, endMs: 10_000, diagnostics, finalStatus: "success" });
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0]?.fallbackUsed, false);
  assert.equal(diagnostics[1]?.fallbackUsed, true);
  assert.equal(trace.fallbackUsed, true);
  assert.equal(trace.finalStatus, "success");
});

test("successful result survives trailing cleanup logs", () => {
  const stdout = JSON.stringify({ ok: true, output: "answer", durationMs: 1, attempts: [] }) + "\ncleanup complete";
  assert.equal(classifyProviderProcessClose({ code: null, signal: "SIGTERM", stdout, signalAborted: false, timedOut: false, label: "provider runner" }).action, "resolve");
});
test("incomplete JSON cannot mask a crashed process", () => {
  assert.equal(classifyProviderProcessClose({ code: null, signal: "SIGTERM", stdout: JSON.stringify({ ok: true }), signalAborted: false, timedOut: false, label: "provider runner" }).action, "reject");
});
test("fallback diagnostics preserve model and sequential timing", () => {
  const diagnostics = providerAttemptDiagnostics([
    { provider: "opencode-http", model: "free", label: "Free", ok: false, durationMs: 25 },
    { provider: "ollama", model: "qwen3.5:9b", label: "Local", ok: true, durationMs: 75 }
  ], 1000);
  assert.equal(diagnostics[0].model, "free");
  assert.equal(diagnostics[1].model, "qwen3.5:9b");
  assert.equal(diagnostics[0].endTimestamp, diagnostics[1].startTimestamp);
});

function fakeRunner(stdout: string, code: number | null, signal: NodeJS.Signals | null, controller?: AbortController, waitForKill = false): typeof spawn {
  return (() => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: (_signal: string) => { queueMicrotask(() => child.emit("close", null, "SIGTERM")); return true; } });
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(stdout));
      if (controller) controller.abort();
      else if (!waitForKill) child.emit("close", code, signal);
    });
    return child;
  }) as unknown as typeof spawn;
}
const successfulJson = JSON.stringify({ ok: true, provider: "ollama", model: "qwen3.5:9b", output: "answer", durationMs: 1, attempts: [] });

test("process wiring retains successful JSON after SIGTERM and null exit", async () => {
  const result = await runProcessWithStateTracking("mock", [], ".", { hardLimitMs: 1000, label: "provider runner", providerId: "provider-runner", spawnProcess: fakeRunner(successfulJson + "\ncleanup", null, "SIGTERM") });
  assert.equal(result.finalState, "DONE");
  assert.equal(result.diagnostic.finalStatus, "success");
  assert.equal(result.diagnostic.exitSignal, "SIGTERM");
  assert.equal(result.diagnostic.validResultReceived, true);
});
test("process wiring reports invalid JSON despite exit zero", async () => {
  const result = await runProcessWithStateTracking("mock", [], ".", { hardLimitMs: 1000, label: "provider runner", providerId: "provider-runner", spawnProcess: fakeRunner("invalid-json", 0, null) });
  assert.equal(result.diagnostic.finalStatus, "invalid_result");
});
test("process wiring cancellation wins over valid output", async () => {
  const controller = new AbortController();
  await assert.rejects(runProcessWithStateTracking("mock", [], ".", { signal: controller.signal, hardLimitMs: 1000, label: "provider runner", spawnProcess: fakeRunner(successfulJson, null, "SIGTERM", controller) }), (error: unknown) => {
    assert.equal((error as { diagnostic: { finalStatus: string } }).diagnostic.finalStatus, "cancelled"); return true;
  });
});
test("process wiring hard timeout wins over valid output", async () => {
  await assert.rejects(runProcessWithStateTracking("mock", [], ".", { hardLimitMs: 0, label: "provider runner", spawnProcess: fakeRunner(successfulJson, null, "SIGTERM", undefined, true) }), (error: unknown) => {
    assert.equal((error as { diagnostic: { finalStatus: string } }).diagnostic.finalStatus, "timeout"); return true;
  });
});
test("process wiring reports crash metadata", async () => {
  await assert.rejects(runProcessWithStateTracking("mock", [], ".", { hardLimitMs: 1000, label: "provider runner", spawnProcess: fakeRunner("", 1, null) }), (error: unknown) => {
    assert.equal((error as { diagnostic: { finalStatus: string; exitCode: number } }).diagnostic.finalStatus, "crash");
    assert.equal((error as { diagnostic: { exitCode: number } }).diagnostic.exitCode, 1); return true;
  });
});
