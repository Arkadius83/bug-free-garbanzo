import assert from "node:assert/strict";
import test from "node:test";
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
