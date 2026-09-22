import assert from "node:assert/strict";
import test from "node:test";
import { buildProviderTraceViewModel } from "../shared/provider-trace-view-model.js";
import type { ProviderExecutionTrace } from "../shared/contracts.js";

function trace(overrides: Partial<ProviderExecutionTrace> = {}): ProviderExecutionTrace {
  return {
    startTimestamp: "1970-01-01T00:00:01.000Z",
    endTimestamp: "1970-01-01T00:00:01.120Z",
    durationMs: 120,
    finalStatus: "success",
    fallbackUsed: false,
    diagnostics: [
      {
        providerId: "opencode-http",
        providerName: "OpenCode Free",
        startTimestamp: "1970-01-01T00:00:01.000Z",
        endTimestamp: "1970-01-01T00:00:01.120Z",
        durationMs: 120,
        finalStatus: "success",
        exitCode: 0,
        exitSignal: null,
        validResultReceived: true,
        fallbackUsed: false
      }
    ],
    ...overrides
  };
}

test("provider trace view model is hidden when trace is absent", () => {
  assert.equal(buildProviderTraceViewModel(undefined).visible, false);
  assert.equal(buildProviderTraceViewModel(null).visible, false);
  assert.equal(buildProviderTraceViewModel(trace({ diagnostics: [] })).visible, false);
});

test("provider trace view model exposes successful trace data for the renderer", () => {
  const model = buildProviderTraceViewModel(trace());
  assert.equal(model.visible, true);
  assert.equal(model.finalStatus, "success");
  assert.equal(model.statusTone, "success");
  assert.equal(model.duration, "120 ms");
  assert.equal(model.fallbackUsed, "No");
  assert.equal(model.attempts[0]?.providerId, "opencode-http");
  assert.equal(model.attempts[0]?.exitCode, "0");
  assert.equal(model.attempts[0]?.exitSignal, "none");
  assert.equal(model.attempts[0]?.validResultReceived, "Yes");
});

test("provider trace view model preserves fallback attempt ordering", () => {
  const model = buildProviderTraceViewModel(trace({
    fallbackUsed: true,
    diagnostics: [
      {
        providerId: "opencode-http",
        providerName: "OpenCode Free",
        startTimestamp: "1970-01-01T00:00:01.000Z",
        endTimestamp: "1970-01-01T00:00:01.030Z",
        durationMs: 30,
        finalStatus: "crash",
        exitCode: 1,
        exitSignal: null,
        validResultReceived: false,
        fallbackUsed: false,
        errorCode: "PROVIDER_FAILED",
        errorMessage: "unavailable"
      },
      {
        providerId: "ollama",
        providerName: "Local Qwen",
        startTimestamp: "1970-01-01T00:00:01.030Z",
        endTimestamp: "1970-01-01T00:00:01.120Z",
        durationMs: 90,
        finalStatus: "success",
        exitCode: 0,
        exitSignal: null,
        validResultReceived: true,
        fallbackUsed: true
      }
    ]
  }));
  assert.deepEqual(model.attempts.map((attempt) => attempt.providerId), ["opencode-http", "ollama"]);
  assert.equal(model.fallbackUsed, "Yes");
  assert.equal(model.attempts[0]?.error, "PROVIDER_FAILED: unavailable");
  assert.equal(model.attempts[1]?.fallbackUsed, "Yes");
});

test("provider trace view model renders crash and timeout states distinctly", () => {
  const crash = buildProviderTraceViewModel(trace({ finalStatus: "crash", diagnostics: [{ ...trace().diagnostics[0]!, finalStatus: "crash", exitCode: 1, errorMessage: "exited" }] }));
  const timeout = buildProviderTraceViewModel(trace({ finalStatus: "timeout", diagnostics: [{ ...trace().diagnostics[0]!, finalStatus: "timeout", exitCode: null, exitSignal: "SIGTERM", errorCode: "TIMEOUT" }] }));
  assert.equal(crash.statusTone, "danger");
  assert.equal(crash.attempts[0]?.statusTone, "danger");
  assert.equal(timeout.statusTone, "warning");
  assert.equal(timeout.attempts[0]?.exitSignal, "SIGTERM");
  assert.equal(timeout.attempts[0]?.error, "TIMEOUT");
});

test("renderer model exposes selected route and attempt models", () => {
  const model = buildProviderTraceViewModel(trace({ selectedProvider: "ollama", selectedModel: "qwen3.5:9b", routingMode: "auto", diagnostics: [{ ...trace().diagnostics[0], model: "qwen3.5:9b" }] }));
  assert.match(model.routingDecision, /Auto selected ollama \/ qwen3.5:9b/);
  assert.equal(model.attempts[0].model, "qwen3.5:9b");
});
