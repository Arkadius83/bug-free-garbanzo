import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { AssetSummary, ReleaseReadiness, ReleaseSummary, TaskSummary } from "../../../../electron/shared/contracts";
import { Dashboard } from "../Dashboard";

const release: ReleaseSummary = { id: "release-1", title: "Different Perspective", artistId: "the-arkadiusz", artistName: "The Arkadiusz", primaryGenre: "Psytrance", story: "A release story", status: "planned", releaseDate: "2026-10-01", createdAt: "2026-09-01T00:00:00.000Z" };
const cover: AssetSummary = { id: "cover-1", releaseId: release.id, trackId: null, kind: "cover", filePath: "C:\\Artwork\\different-perspective.png", fileName: "different-perspective.png", mimeType: "image/png", sizeBytes: 123, modifiedAt: null, createdAt: "2026-09-01T00:00:00.000Z", width: 3000, height: 3000 };
const readiness: ReleaseReadiness = { releaseId: release.id, score: 50, missing: ["Cover artwork"], checks: [{ id: "audio", label: "Audio", complete: true, weight: 50, detail: "Audio attached" }, { id: "cover", label: "Cover", complete: false, weight: 50, detail: "Cover artwork missing" }] };
const tasks: TaskSummary[] = [
  { id: "task-1", releaseId: release.id, releaseTitle: release.title, title: "Review cover", status: "todo", priority: "medium", assignee: "human", dueAt: null, sourceKey: null, agentOutput: null, model: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
  { id: "task-2", releaseId: release.id, releaseTitle: release.title, title: "Metadata", status: "done", priority: "medium", assignee: "human", dueAt: null, sourceKey: null, agentOutput: null, model: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }
];

function renderDashboard({ assets = [], ...overrides }: Partial<React.ComponentProps<typeof Dashboard>> = {}) {
  const props: React.ComponentProps<typeof Dashboard> = { releases: [release], tasks, assets, featuredRelease: release, releaseReadiness: readiness, onCreateRelease: vi.fn(), onOpenRelease: vi.fn(), onOpenTasks: vi.fn(), onOpenCalendar: vi.fn(), ...overrides };
  render(<Dashboard {...props} />);
  return props;
}

describe("Dashboard", () => {
  it("renders a compact operational summary from release and task data", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("Different Perspective")).toHaveLength(1);
    expect(screen.getByText("50% ready")).toBeInTheDocument();
    expect(screen.queryByText(/Ready for the world/i)).not.toBeInTheDocument();
  });

  it("uses the existing cover asset when one is available", () => {
    renderDashboard({ assets: [cover] });
    expect(screen.getByRole("img", { name: "Different Perspective cover artwork" })).toHaveAttribute("src", "file:///C:/Artwork/different-perspective.png");
  });

  it("renders the AI Studio chat panel in place of the old workflow card", () => {
    renderDashboard();
    expect(screen.getByRole("combobox", { name: "AI model" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("keeps quick actions connected to application-owned navigation callbacks", async () => {
    const user = userEvent.setup();
    const props = renderDashboard();
    await user.click(screen.getByRole("button", { name: /New release/i }));
    await user.click(screen.getByRole("button", { name: /Open releases/i }));
    await user.click(screen.getByRole("button", { name: /Content calendar/i }));
    expect(props.onCreateRelease).toHaveBeenCalledOnce(); expect(props.onOpenRelease).toHaveBeenCalledOnce(); expect(props.onOpenCalendar).toHaveBeenCalledOnce();
  });

  it("shows a real empty release state without manufacturing workflow data", () => {
    renderDashboard({ releases: [], tasks: [], assets: [], featuredRelease: undefined, releaseReadiness: null });
    expect(screen.getByText("No release selected")).toBeInTheDocument();
  });
  it("shows honest empty operations states without fabricating campaign analytics", () => {
    renderDashboard({ queue: [], events: [] });
    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No upcoming schedule event.")).toBeInTheDocument();
    expect(screen.getByText("Analytics will appear after connected campaigns begin publishing.")).toBeInTheDocument();
  });

  it("renders derived campaign and schedule information from provided operational records", () => {
    renderDashboard({
      queue: [{ id: "queue-1", status: "approved", platform: "Instagram" } as never],
      events: [{ id: "event-1", status: "READY", scheduledAt: "2099-01-01T12:00:00.000Z", timezone: "UTC", campaignItemTitle: "Release teaser", platform: "Instagram", releaseTitle: release.title } as never]
    });
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByText("Release teaser")).toBeInTheDocument();
  });
});