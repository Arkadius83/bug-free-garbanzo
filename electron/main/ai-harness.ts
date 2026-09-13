import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { AiHarnessError, AiHarnessRequest, AiHarnessResponse, AiHarnessTaskResult, AiHarnessTaskSummary } from "../shared/contracts.js";

const execFileAsync = promisify(execFile);

export type AiHarnessExecutionReport = {
  overallStatus: AiHarnessResponse["status"];
  planOnly: boolean;
  plan: {
    valid: boolean;
    originalTaskOrder: string[];
    resolvedTaskOrder: string[];
    orderedTasks: Array<{
      id: string;
      description?: string;
      capability?: string;
      dependsOn?: string[];
      expectedOutputs?: unknown;
    }>;
  };
  taskResults: AiHarnessTaskResult[];
  errors: AiHarnessError[];
};

export type AiHarnessRunner = (request: AiHarnessRequest) => Promise<AiHarnessExecutionReport>;

export type AiHarnessRuntime = {
  runner?: AiHarnessRunner;
  harnessRoot?: string;
};

function defaultHarnessRoot(): string {
  return process.env.AI_HARNESS_ROOT ?? path.resolve(process.cwd(), "..", "..", "Local AI", "ai-harness", "orchestrator");
}

async function runTsx(scriptPath: string, inputPath: string, cwd: string): Promise<string> {
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync("cmd.exe", ["/d", "/c", "pnpm", "exec", "tsx", scriptPath, inputPath], { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
    return stdout;
  }
  const { stdout } = await execFileAsync("pnpm", ["exec", "tsx", scriptPath, inputPath], { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
  return stdout;
}

export function createAiHarnessProcessRunner(harnessRoot = defaultHarnessRoot()): AiHarnessRunner {
  return async (request) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-manager-harness-"));
    const inputPath = path.join(directory, "request.json");
    const runnerPath = path.join(directory, "runner.ts");
    try {
      await writeFile(inputPath, JSON.stringify({ goal: request.goal, project: request.project, execution: { ...request.execution, planOnly: true } }), "utf8");
      const harnessEntry = pathToFileURL(path.join(harnessRoot, "src", "harness-v12.ts")).href;
      await writeFile(runnerPath, `
        import { readFile } from "node:fs/promises";
        import { executeGoal } from ${JSON.stringify(harnessEntry)};
        async function main() {
          const input = JSON.parse(await readFile(process.argv[2], "utf8"));
          const report = await executeGoal(input.goal, {
            planOnly: true,
            workspaceRoot: input.project?.workspaceRoot,
            stateFile: input.project?.stateFile
          });
          console.log(JSON.stringify(report));
        }
        main().catch((error) => {
          console.error(error);
          process.exitCode = 1;
        });
      `, "utf8");
      const stdout = await runTsx(runnerPath, inputPath, harnessRoot);
      const lastJsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      if (!lastJsonLine) throw new Error("AI Harness returned no execution report");
      return JSON.parse(lastJsonLine) as AiHarnessExecutionReport;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}

function normalizeTasks(report: AiHarnessExecutionReport): AiHarnessTaskSummary[] {
  return report.plan.orderedTasks.map((task) => ({
    id: task.id,
    description: task.description,
    capability: task.capability,
    dependsOn: task.dependsOn ?? [],
    expectedOutputs: task.expectedOutputs
  }));
}

function normalizeResults(report: AiHarnessExecutionReport): AiHarnessTaskResult[] {
  return report.taskResults.map((result) => ({
    taskId: result.taskId,
    capability: result.capability,
    executorId: result.executorId,
    status: result.status,
    planningOnly: result.planningOnly,
    blockedBy: result.blockedBy ?? [],
    dependencyResults: result.dependencyResults ?? [],
    output: result.output,
    errors: result.errors ?? []
  }));
}

export async function runAiHarnessPlanOnly(request: AiHarnessRequest, runtime: AiHarnessRuntime = {}): Promise<AiHarnessResponse> {
  const runner = runtime.runner ?? createAiHarnessProcessRunner(runtime.harnessRoot);
  const safeRequest: AiHarnessRequest = { ...request, execution: { ...request.execution, planOnly: true } };
  const report = await runner(safeRequest);
  return {
    requestId: safeRequest.requestId,
    status: report.overallStatus,
    planOnly: true,
    plan: {
      valid: report.plan.valid,
      originalTaskOrder: report.plan.originalTaskOrder,
      resolvedTaskOrder: report.plan.resolvedTaskOrder,
      tasks: normalizeTasks(report)
    },
    results: normalizeResults(report),
    errors: report.errors ?? []
  };
}



