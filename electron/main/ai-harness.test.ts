import assert from "node:assert/strict";
import test from "node:test";
import { runAiHarnessPlanOnly, type AiHarnessExecutionReport } from "./ai-harness.js";
import type { AiHarnessRequest } from "../shared/contracts.js";

test("normalizes a plan-only AI Harness V12 report for AI Manager", async () => {
  let observedPlanOnly: boolean | undefined;
  const report: AiHarnessExecutionReport = {
    overallStatus: "PLANNING_ONLY",
    planOnly: true,
    plan: {
      valid: true,
      originalTaskOrder: ["T1", "T2", "T3"],
      resolvedTaskOrder: ["T1", "T2", "T3"],
      orderedTasks: [
        { id: "T1", description: "Generate the requested image asset.", capability: "image.generate", dependsOn: [], expectedOutputs: { image: true } },
        { id: "T2", description: "Analyze the generated image asset.", capability: "image.analyze", dependsOn: ["T1"] },
        { id: "T3", description: "Upscale the image asset.", capability: "image.upscale", dependsOn: ["T2"] }
      ]
    },
    taskResults: [
      { taskId: "T1", capability: "image.generate", executorId: null, status: "NO_EXECUTOR", planningOnly: true, blockedBy: [], dependencyResults: [], errors: [] },
      { taskId: "T2", capability: "image.analyze", executorId: null, status: "BLOCKED_BY_DEPENDENCY", planningOnly: true, blockedBy: ["T1"], dependencyResults: [], errors: [] },
      { taskId: "T3", capability: "image.upscale", executorId: null, status: "BLOCKED_BY_DEPENDENCY", planningOnly: true, blockedBy: ["T2"], dependencyResults: [], errors: [] }
    ],
    errors: []
  };

  const response = await runAiHarnessPlanOnly({
    requestId: "request-1",
    goal: { id: "goal-1", instruction: "Create album artwork, analyze it and upscale it." },
    project: { id: "project-1", name: "AI Studio Manager", workspaceRoot: "E:/example", stateFile: "E:/example/state.json" },
    execution: { planOnly: false }
  }, {
    runner: async (request) => {
      observedPlanOnly = request.execution?.planOnly;
      return report;
    }
  });

  assert.equal(observedPlanOnly, true);
  assert.equal(response.requestId, "request-1");
  assert.equal(response.status, "PLANNING_ONLY");
  assert.equal(response.planOnly, true);
  assert.deepEqual(response.plan.originalTaskOrder, ["T1", "T2", "T3"]);
  assert.deepEqual(response.plan.resolvedTaskOrder, ["T1", "T2", "T3"]);
  assert.deepEqual(response.plan.tasks.map((task) => [task.id, task.capability, task.dependsOn]), [
    ["T1", "image.generate", []],
    ["T2", "image.analyze", ["T1"]],
    ["T3", "image.upscale", ["T2"]]
  ]);
  assert.deepEqual(response.results.map((result) => [result.taskId, result.status, result.blockedBy]), [
    ["T1", "NO_EXECUTOR", []],
    ["T2", "BLOCKED_BY_DEPENDENCY", ["T1"]],
    ["T3", "BLOCKED_BY_DEPENDENCY", ["T2"]]
  ]);
});

