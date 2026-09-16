import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ConversationProviderAttempt, ConversationProviderRouteResult, ConversationProviderRouter } from "./conversation-runtime.js";
import type { ProviderExecutionDiagnostic, ProviderExecutionFinalStatus, ProviderExecutionTrace } from "../shared/contracts.js";

export type ProviderState = "CONNECTING" | "RUNNING" | "DONE" | "ERROR" | "CANCELLED";

export type AiHarnessProviderRouterOptions = {
  harnessRoot?: string;
  allowPremiumFallback?: boolean;
  startupTimeoutMs?: number;
  hardLimitMs?: number;
  localQwenNumPredict?: number;
};

const STARTUP_TIMEOUT_MS = 30_000;
const HARD_LIMIT_MS = 5 * 60_000;
const DEFAULT_LOCAL_QWEN_NUM_PREDICT = 4096;
const LOCAL_QWEN_ENDPOINT = "http://127.0.0.1:11434/api/generate";
const LOCAL_QWEN_MODEL = "qwen3.5:9b";

function defaultHarnessRoot(): string {
  return process.env.AI_HARNESS_ROOT ?? path.resolve(process.cwd(), "..", "..", "Local AI", "ai-harness", "orchestrator");
}

function numericEnvironmentValue(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function logStateTransition(from: ProviderState, to: ProviderState, detail?: string): void {
  const detailInfo = detail ? ` ${detail}` : "";
  console.log(`[provider-router] ${from} -> ${to}${detailInfo}`);
}

export function localQwenFallbackSource(): string {
  return `
    async function runAiStudioLocalQwen(prompt) {
      const startedAt = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), input.localQwenTimeoutMs);
      try {
        const response = await fetch(${JSON.stringify(LOCAL_QWEN_ENDPOINT)}, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: ${JSON.stringify(LOCAL_QWEN_MODEL)},
            prompt,
            stream: false,
            think: false,
            keep_alive: -1,
            options: {
              num_ctx: 8192,
              num_predict: input.localQwenNumPredict,
              temperature: 0
            }
          })
        });
        const raw = await response.text();
        if (!response.ok) {
          return { ok: false, output: "", durationMs: performance.now() - startedAt, errorType: "OLLAMA_HTTP_ERROR", errorMessage: "HTTP " + response.status + ": " + raw };
        }
        const data = JSON.parse(raw);
        const output = String(data.response ?? "").trim();
        if (!output) {
          const thinkingLength = typeof data.thinking === "string" ? data.thinking.length : 0;
          return { ok: false, output: "", durationMs: performance.now() - startedAt, errorType: data.done_reason === "length" ? "LENGTH" : "EMPTY_OUTPUT", errorMessage: thinkingLength ? "Qwen returned no final response after " + thinkingLength + " thinking characters." : "Qwen returned empty output." };
        }
        return { ok: true, output, durationMs: performance.now() - startedAt };
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        return { ok: false, output: "", durationMs: performance.now() - startedAt, errorType: isAbort ? "TIMEOUT" : "OLLAMA_UNAVAILABLE", errorMessage: error instanceof Error ? error.message : String(error) };
      } finally {
        clearTimeout(timeout);
      }
    }
  `;
}

type ProcessResult = { stdout: string; finalState: ProviderState; diagnostic: ProviderExecutionDiagnostic };

type CompiledProviderEntry = { providerEntry: string; diagnostic: ProviderExecutionDiagnostic };

export type ProviderProcessCloseDecision = {
  action: "resolve" | "reject" | "cancel" | "timeout";
  detail: string;
};

function timestamp(ms: number): string {
  return new Date(ms).toISOString();
}

function parseLastJsonLine(stdout: string): unknown {
  const lastJsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!lastJsonLine) return null;
  try { return JSON.parse(lastJsonLine) as unknown; } catch { return null; }
}

function hasSuccessfulProviderResult(stdout: string): boolean {
  const parsed = parseLastJsonLine(stdout);
  return typeof parsed === "object" && parsed !== null && (parsed as { ok?: unknown }).ok === true;
}

export function classifyProviderProcessClose(input: { code: number | null; signal: NodeJS.Signals | null; stdout: string; signalAborted: boolean; timedOut: boolean; label: string }): ProviderProcessCloseDecision {
  const exit = `exit code ${input.code === null ? "null" : input.code} signal ${input.signal ?? "none"}`;
  if (input.signalAborted) return { action: "cancel", detail: `user abort; ${exit}` };
  if (input.timedOut) return { action: "timeout", detail: `hard limit reached; ${exit}` };
  if (input.code === 0) return { action: "resolve", detail: exit };
  if (input.code === null && hasSuccessfulProviderResult(input.stdout)) return { action: "resolve", detail: `${exit}; valid result already received` };
  return { action: "reject", detail: exit };
}

function statusForDecision(decision: ProviderProcessCloseDecision): ProviderExecutionFinalStatus {
  if (decision.action === "resolve") return "success";
  if (decision.action === "cancel") return "cancelled";
  if (decision.action === "timeout") return "timeout";
  return "crash";
}

export function createProviderExecutionDiagnostic(input: {
  providerId: string;
  providerName: string;
  startMs: number;
  endMs: number;
  finalStatus: ProviderExecutionFinalStatus;
  exitCode?: number | null;
  exitSignal?: string | null;
  validResultReceived?: boolean;
  fallbackUsed?: boolean;
  errorCode?: string;
  errorMessage?: string;
}): ProviderExecutionDiagnostic {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    startTimestamp: timestamp(input.startMs),
    endTimestamp: timestamp(input.endMs),
    durationMs: Math.max(0, input.endMs - input.startMs),
    finalStatus: input.finalStatus,
    exitCode: input.exitCode ?? null,
    exitSignal: input.exitSignal ?? null,
    validResultReceived: Boolean(input.validResultReceived),
    fallbackUsed: Boolean(input.fallbackUsed),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {})
  };
}

export function buildProviderExecutionTrace(input: {
  startMs: number;
  endMs: number;
  diagnostics: ProviderExecutionDiagnostic[];
  finalStatus?: ProviderExecutionFinalStatus;
  fallbackUsed?: boolean;
}): ProviderExecutionTrace {
  const finalStatus = input.finalStatus ?? input.diagnostics.at(-1)?.finalStatus ?? "invalid_result";
  const fallbackUsed = input.fallbackUsed ?? input.diagnostics.some((diagnostic) => diagnostic.fallbackUsed);
  return {
    startTimestamp: timestamp(input.startMs),
    endTimestamp: timestamp(input.endMs),
    durationMs: Math.max(0, input.endMs - input.startMs),
    finalStatus,
    fallbackUsed,
    diagnostics: input.diagnostics
  };
}

export function providerAttemptDiagnostics(attempts: ConversationProviderAttempt[], routeEndMs: number): ProviderExecutionDiagnostic[] {
  const firstSuccessfulIndex = attempts.findIndex((attempt) => attempt.ok);
  const fallbackWasUsed = firstSuccessfulIndex > 0 || (firstSuccessfulIndex === -1 && attempts.length > 1);
  return attempts.map((attempt, index) => {
    const endMs = routeEndMs;
    const startMs = Math.max(0, endMs - Math.max(0, Math.round(attempt.durationMs)));
    const finalStatus: ProviderExecutionFinalStatus = attempt.ok ? "success" : attempt.errorType === "TIMEOUT" ? "timeout" : "crash";
    return createProviderExecutionDiagnostic({
      providerId: attempt.provider,
      providerName: attempt.label || attempt.provider,
      startMs,
      endMs,
      finalStatus,
      exitCode: null,
      exitSignal: null,
      validResultReceived: attempt.ok,
      fallbackUsed: fallbackWasUsed && index > 0,
      errorCode: attempt.errorType,
      errorMessage: attempt.errorMessage
    });
  });
}

async function runProcessWithStateTracking(
  command: string,
  args: string[],
  cwd: string,
  options: { signal?: AbortSignal; hardLimitMs: number; label: string; providerId?: string; providerName?: string }
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let state: ProviderState = "CONNECTING";
    let stdout = "";
    let stderr = "";
    let hardLimitTimer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    function clearTimers(): void {
      if (hardLimitTimer) { clearTimeout(hardLimitTimer); hardLimitTimer = null; }
    }
    function transitionTo(newState: ProviderState, detail?: string): void {
      const from = state;
      state = newState;
      logStateTransition(from, newState, `${options.label}${detail ? `: ${detail}` : ""}`);
    }
    function diagnosticFor(decision: ProviderProcessCloseDecision, code: number | null, signal: NodeJS.Signals | null, errorMessage?: string): ProviderExecutionDiagnostic {
      const finalStatus = statusForDecision(decision);
      return createProviderExecutionDiagnostic({
        providerId: options.providerId ?? options.label,
        providerName: options.providerName ?? options.label,
        startMs,
        endMs: Date.now(),
        finalStatus,
        exitCode: code,
        exitSignal: signal,
        validResultReceived: hasSuccessfulProviderResult(stdout),
        fallbackUsed: false,
        errorCode: finalStatus === "success" ? undefined : finalStatus.toUpperCase(),
        errorMessage
      });
    }

    transitionTo("RUNNING", "process spawned");
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimers();
      transitionTo("ERROR", error.message);
      const decision: ProviderProcessCloseDecision = { action: "reject", detail: error.message };
      const diagnostic = diagnosticFor(decision, null, null, error.message);
      reject(Object.assign(error, { diagnostic }));
    });
    child.on("close", (code, signal) => {
      clearTimers();
      const decision = classifyProviderProcessClose({ code, signal, stdout, signalAborted: Boolean(options.signal?.aborted), timedOut, label: options.label });
      const diagnostic = diagnosticFor(decision, code, signal, decision.action === "resolve" ? undefined : decision.detail);
      if (decision.action === "cancel") {
        transitionTo("CANCELLED", decision.detail);
        reject(Object.assign(new DOMException("Aborted", "AbortError"), { diagnostic }));
        return;
      }
      if (decision.action === "timeout") {
        transitionTo("ERROR", decision.detail);
        reject(Object.assign(new Error(`${options.label} exceeded the hard limit. ${decision.detail}. stdout: ${stdout.slice(0, 1200)} stderr: ${stderr.slice(0, 800)}`), { diagnostic }));
        return;
      }
      if (decision.action === "reject") {
        transitionTo("ERROR", decision.detail);
        reject(Object.assign(new Error(`${options.label} exited unexpectedly. ${decision.detail}. stdout: ${stdout.slice(0, 1200)} stderr: ${stderr.slice(0, 800)}`), { diagnostic }));
        return;
      }
      transitionTo("DONE", decision.detail);
      resolve({ stdout, finalState: state, diagnostic });
    });
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        clearTimers();
        transitionTo("CANCELLED", "signal abort");
        child.kill("SIGTERM");
      }, { once: true });
    }
    hardLimitTimer = setTimeout(() => {
      timedOut = true;
      console.error(`[provider-router] Hard limit ${options.hardLimitMs}ms reached - killing ${options.label}`);
      transitionTo("ERROR", `hard limit ${options.hardLimitMs}ms reached`);
      child.kill("SIGTERM");
    }, options.hardLimitMs);
  });
}

function diagnosticFromError(error: unknown): ProviderExecutionDiagnostic | null {
  if (typeof error === "object" && error !== null && "diagnostic" in error) {
    const diagnostic = (error as { diagnostic?: unknown }).diagnostic;
    if (typeof diagnostic === "object" && diagnostic !== null) return diagnostic as ProviderExecutionDiagnostic;
  }
  return null;
}

async function compileHarnessProviders(tempDirectory: string, harnessRoot: string, signal: AbortSignal | undefined, hardLimitMs: number): Promise<CompiledProviderEntry> {
  const compiledDirectory = path.join(tempDirectory, "compiled");
  const tsconfigPath = path.join(tempDirectory, "tsconfig.provider.json");
  const harnessSrc = path.join(harnessRoot, "src");
  await writeFile(tsconfigPath, JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ["node"],
      typeRoots: [path.join(harnessRoot, "node_modules", "@types")],
      noEmit: false,
      outDir: compiledDirectory,
      rootDir: harnessSrc,
      declaration: false,
      sourceMap: false,
      incremental: false
    },
    files: [
      path.join(harnessSrc, "providers", "provider-manager-v8.ts"),
      path.join(harnessSrc, "providers", "opencode-provider.ts"),
      path.join(harnessSrc, "providers", "codex-provider.ts")
    ]
  }, null, 2), "utf8");
  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const args = process.platform === "win32" ? ["/d", "/c", "pnpm.cmd", "exec", "tsc", "-p", tsconfigPath] : ["exec", "tsc", "-p", tsconfigPath];
  const processResult = await runProcessWithStateTracking(command, args, harnessRoot, { signal, hardLimitMs, label: "provider compile", providerId: "provider-compile", providerName: "Harness provider compile" });
  return { providerEntry: path.join(compiledDirectory, "providers", "provider-manager-v8.js"), diagnostic: processResult.diagnostic };
}

export function createAiHarnessProviderRouter(options: AiHarnessProviderRouterOptions = {}): ConversationProviderRouter {
  const harnessRoot = options.harnessRoot ?? defaultHarnessRoot();
  const allowPremiumFallback = options.allowPremiumFallback ?? process.env.AI_STUDIO_ALLOW_PREMIUM_TEXT_FALLBACK === "1";
  const startupTimeoutMs = options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;
  const hardLimitMs = options.hardLimitMs ?? HARD_LIMIT_MS;
  const localQwenNumPredict = options.localQwenNumPredict ?? numericEnvironmentValue("AI_STUDIO_AUTO_LOCAL_NUM_PREDICT", DEFAULT_LOCAL_QWEN_NUM_PREDICT);

  return async (prompt, runtimeOptions = {}) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-studio-provider-route-"));
    const inputPath = path.join(directory, "request.json");
    const runnerPath = path.join(directory, "provider-router.mjs");
    const startMs = Date.now();
    const diagnostics: ProviderExecutionDiagnostic[] = [];
    try {
      await writeFile(inputPath, JSON.stringify({ prompt, allowPremiumFallback, localQwenNumPredict, localQwenTimeoutMs: 300_000 }), "utf8");
      const compiled = await compileHarnessProviders(directory, harnessRoot, runtimeOptions.signal, hardLimitMs);
      diagnostics.push(compiled.diagnostic);
      const providerEntry = pathToFileURL(compiled.providerEntry).href;
      await writeFile(runnerPath, `
        import { readFile } from "node:fs/promises";
        import { runProviderTask } from ${JSON.stringify(providerEntry)};
        async function main() {
          const input = JSON.parse(await readFile(process.argv[2], "utf8"));
          console.log("[provider-router] Starting provider routing for prompt length=" + input.prompt.length);
          ${localQwenFallbackSource()}
          const dependencies = {
            runLocalQwen: runAiStudioLocalQwen,
            ...(input.allowPremiumFallback ? {} : {
              runCodex: async () => {
                console.log("[provider-router] Premium fallback (codex) blocked by Auto mode");
                return { ok: false, provider: "codex-cli", model: "codex-cli-default", output: "", durationMs: 0, errorType: "EXECUTION_ERROR", errorMessage: "Premium fallback is disabled by AI Studio Auto mode." };
              }
            })
          };
          console.log("[provider-router] Calling runProviderTask with premiumAllowed=" + input.allowPremiumFallback + " localQwenNumPredict=" + input.localQwenNumPredict + " think=false");
          const result = await runProviderTask(input.prompt, dependencies);
          console.log("[provider-router] Routing complete: ok=" + result.ok + " provider=" + (result.provider ?? "none") + " model=" + (result.model ?? "none") + " durationMs=" + result.durationMs);
          if (result.attempts) {
            for (const attempt of result.attempts) {
              console.log("[provider-router] Attempt: " + attempt.label + " provider=" + attempt.provider + " model=" + attempt.model + " ok=" + attempt.ok + " durationMs=" + attempt.durationMs + (attempt.errorType ? " error=" + attempt.errorType : ""));
            }
          }
          console.log(JSON.stringify(result));
        }
        main().catch((error) => {
          console.error("[provider-router] Fatal error:", error.message ?? error);
          process.exitCode = 1;
        });
      `, "utf8");

      const processResult = await runProcessWithStateTracking(process.execPath, [runnerPath, inputPath], harnessRoot, { signal: runtimeOptions.signal, hardLimitMs, label: "provider runner", providerId: "provider-runner", providerName: "Harness provider runner" });
      diagnostics.push(processResult.diagnostic);
      const endMs = Date.now();
      const lastJsonLine = processResult.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      if (!lastJsonLine) {
        const trace = buildProviderExecutionTrace({ startMs, endMs, diagnostics, finalStatus: "invalid_result" });
        console.error(`[provider-router] No JSON result in stdout. state=${processResult.finalState} totalMs=${endMs - startMs} lines=${processResult.stdout.trim().split(/\r?\n/).length} trace=${JSON.stringify(trace)}`);
        throw new Error("AI Harness provider router returned no result");
      }
      let result: ConversationProviderRouteResult;
      try {
        result = JSON.parse(lastJsonLine) as ConversationProviderRouteResult;
      } catch (error) {
        const trace = buildProviderExecutionTrace({ startMs, endMs, diagnostics, finalStatus: "invalid_result" });
        console.error(`[provider-router] Invalid provider JSON after ${endMs - startMs}ms: ${error instanceof Error ? error.message : String(error)} trace=${JSON.stringify(trace)}`);
        throw new Error("AI Harness provider router returned invalid JSON");
      }
      const attemptDiagnostics = providerAttemptDiagnostics(result.attempts ?? [], endMs);
      const fallbackUsed = attemptDiagnostics.some((diagnostic) => diagnostic.fallbackUsed);
      const finalStatus: ProviderExecutionFinalStatus = result.ok ? "success" : "crash";
      result.trace = buildProviderExecutionTrace({ startMs, endMs, diagnostics: [...diagnostics, ...attemptDiagnostics], finalStatus, fallbackUsed });
      console.log(`[provider-router] Parsed: ok=${result.ok} provider=${result.provider ?? "none"} model=${result.model ?? "none"} attempts=${result.attempts.length} totalMs=${endMs - startMs} finalState=${processResult.finalState} traceStatus=${result.trace.finalStatus} fallbackUsed=${result.trace.fallbackUsed}`);
      return result;
    } catch (error) {
      const endMs = Date.now();
      const diagnostic = diagnosticFromError(error);
      const traceDiagnostics = diagnostic ? [...diagnostics, diagnostic] : diagnostics;
      if (error instanceof DOMException && error.name === "AbortError") {
        const trace = buildProviderExecutionTrace({ startMs, endMs, diagnostics: traceDiagnostics, finalStatus: "cancelled" });
        console.error(`[provider-router] Cancelled after ${endMs - startMs}ms trace=${JSON.stringify(trace)}`);
        return { ok: false, durationMs: endMs - startMs, attempts: [], errorMessage: "Provider routing was cancelled.", trace };
      }
      if (error instanceof Error && /startup timeout|failed to start/i.test(error.message)) {
        const trace = buildProviderExecutionTrace({ startMs, endMs, diagnostics: traceDiagnostics, finalStatus: "timeout" });
        console.error(`[provider-router] Startup timeout after ${endMs - startMs}ms trace=${JSON.stringify(trace)}`);
        return { ok: false, durationMs: endMs - startMs, attempts: [], errorMessage: `Provider routing failed to start within ${Math.round(startupTimeoutMs / 1000)}s. The providers may be unavailable.`, trace };
      }
      if (error instanceof Error && /hard limit/i.test(error.message)) {
        const trace = buildProviderExecutionTrace({ startMs, endMs, diagnostics: traceDiagnostics, finalStatus: "timeout" });
        console.error(`[provider-router] Hard limit reached after ${endMs - startMs}ms trace=${JSON.stringify(trace)}`);
        return { ok: false, durationMs: endMs - startMs, attempts: [], errorMessage: `Provider routing exceeded the ${Math.round(hardLimitMs / 1000)}s hard limit. The providers may be unavailable.`, trace };
      }
      console.error(`[provider-router] Failed after ${endMs - startMs}ms: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
