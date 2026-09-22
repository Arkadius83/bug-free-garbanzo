import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ConversationProviderRouteResult, ConversationProviderRouter } from "./conversation-runtime.js";

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

type ProcessResult = { stdout: string; finalState: ProviderState };

async function runProcessWithStateTracking(
  command: string,
  args: string[],
  cwd: string,
  options: { signal?: AbortSignal; hardLimitMs: number; label: string }
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let state: ProviderState = "CONNECTING";
    let stdout = "";
    let stderr = "";
    let hardLimitTimer: ReturnType<typeof setTimeout> | null = null;

    function clearTimers(): void {
      if (hardLimitTimer) { clearTimeout(hardLimitTimer); hardLimitTimer = null; }
    }
    function transitionTo(newState: ProviderState, detail?: string): void {
      const from = state;
      state = newState;
      logStateTransition(from, newState, `${options.label}${detail ? `: ${detail}` : ""}`);
    }

    transitionTo("RUNNING", "process spawned");
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => { clearTimers(); transitionTo("ERROR", error.message); reject(error); });
    child.on("close", (code) => {
      clearTimers();
      if (options.signal?.aborted) {
        transitionTo("CANCELLED", "user abort");
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      if (code !== 0) {
        transitionTo("ERROR", `exit code ${code}`);
        reject(new Error(`${options.label} exited with code ${code}. stdout: ${stdout.slice(0, 1200)} stderr: ${stderr.slice(0, 800)}`));
        return;
      }
      transitionTo("DONE", `exit code ${code}`);
      resolve({ stdout, finalState: state });
    });
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        clearTimers();
        transitionTo("CANCELLED", "signal abort");
        child.kill("SIGTERM");
      }, { once: true });
    }
    hardLimitTimer = setTimeout(() => {
      console.error(`[provider-router] Hard limit ${options.hardLimitMs}ms reached - killing ${options.label}`);
      transitionTo("ERROR", `hard limit ${options.hardLimitMs}ms reached`);
      child.kill("SIGTERM");
    }, options.hardLimitMs);
  });
}

async function compileHarnessProviders(tempDirectory: string, harnessRoot: string, signal: AbortSignal | undefined, hardLimitMs: number): Promise<string> {
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
  await runProcessWithStateTracking(command, args, harnessRoot, { signal, hardLimitMs, label: "provider compile" });
  return path.join(compiledDirectory, "providers", "provider-manager-v8.js");
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
    const startTime = Date.now();
    try {
      await writeFile(inputPath, JSON.stringify({ prompt, allowPremiumFallback, localQwenNumPredict, localQwenTimeoutMs: 300_000 }), "utf8");
      const providerEntry = pathToFileURL(await compileHarnessProviders(directory, harnessRoot, runtimeOptions.signal, hardLimitMs)).href;
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

      const { stdout, finalState } = await runProcessWithStateTracking(process.execPath, [runnerPath, inputPath], harnessRoot, { signal: runtimeOptions.signal, hardLimitMs, label: "provider runner" });
      const totalMs = Date.now() - startTime;
      const lastJsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      if (!lastJsonLine) {
        console.error(`[provider-router] No JSON result in stdout. state=${finalState} totalMs=${totalMs} lines=${stdout.trim().split(/\r?\n/).length}`);
        throw new Error("AI Harness provider router returned no result");
      }
      const result = JSON.parse(lastJsonLine) as ConversationProviderRouteResult;
      console.log(`[provider-router] Parsed: ok=${result.ok} provider=${result.provider ?? "none"} model=${result.model ?? "none"} attempts=${result.attempts.length} totalMs=${totalMs} finalState=${finalState}`);
      return result;
    } catch (error) {
      const totalMs = Date.now() - startTime;
      if (error instanceof DOMException && error.name === "AbortError") {
        console.error(`[provider-router] Cancelled after ${totalMs}ms`);
        return { ok: false, durationMs: totalMs, attempts: [], errorMessage: "Provider routing was cancelled." };
      }
      if (error instanceof Error && /startup timeout|failed to start/i.test(error.message)) {
        console.error(`[provider-router] Startup timeout after ${totalMs}ms`);
        return { ok: false, durationMs: totalMs, attempts: [], errorMessage: `Provider routing failed to start within ${Math.round(startupTimeoutMs / 1000)}s. The providers may be unavailable.` };
      }
      if (error instanceof Error && /hard limit/i.test(error.message)) {
        console.error(`[provider-router] Hard limit reached after ${totalMs}ms`);
        return { ok: false, durationMs: totalMs, attempts: [], errorMessage: `Provider routing exceeded the ${Math.round(hardLimitMs / 1000)}s hard limit. The providers may be unavailable.` };
      }
      console.error(`[provider-router] Failed after ${totalMs}ms: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
