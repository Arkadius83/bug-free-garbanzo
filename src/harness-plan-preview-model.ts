import type { AiHarnessRequest, AiHarnessResponse, ArtistAlias, ReleaseSummary } from "../electron/shared/contracts";

type BuildHarnessPlanRequestInput = {
  requestId: string;
  goalId: string;
  instruction: string;
  release?: ReleaseSummary | null;
  artistId?: ArtistAlias;
  artistName?: string;
};

export type HarnessPlanMetrics = {
  totalTasks: number;
  executableTasks: number;
  noExecutorTasks: number;
  blockedTasks: number;
  failedTasks: number;
};

export function buildHarnessPlanRequest(input: BuildHarnessPlanRequestInput): AiHarnessRequest {
  return {
    requestId: input.requestId,
    goal: {
      id: input.goalId,
      instruction: input.instruction.trim(),
      constraints: {
        source: "ai-studio-manager",
        releaseId: input.release?.id ?? null,
        releaseTitle: input.release?.title ?? null,
        artistId: input.release?.artistId ?? input.artistId ?? null,
        artistName: input.release?.artistName ?? input.artistName ?? null,
        primaryGenre: input.release?.primaryGenre ?? null,
        planOnly: true
      },
      preferredExecutionMode: "AUTO"
    },
    project: {
      id: "ai-studio-manager",
      name: "AI Studio Manager"
    },
    execution: {
      planOnly: true
    },
    capabilities: {
      availableExecutors: []
    }
  };
}

export function summarizeHarnessPlan(response: AiHarnessResponse | null): HarnessPlanMetrics {
  const results = response?.results ?? [];
  return {
    totalTasks: response?.plan.tasks.length ?? 0,
    executableTasks: results.filter((result) => result.status === "READY" || result.status === "EXECUTED").length,
    noExecutorTasks: results.filter((result) => result.status === "NO_EXECUTOR").length,
    blockedTasks: results.filter((result) => result.status === "BLOCKED_BY_DEPENDENCY").length,
    failedTasks: results.filter((result) => result.status === "EXECUTION_FAILED" || result.status === "UNSUPPORTED_CAPABILITY").length
  };
}
