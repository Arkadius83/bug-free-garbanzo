import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { AssetSummary, ReleaseReadiness, ReleaseSummary, StudioApi, TaskSummary, YouTubeChannelDataSnapshot, YouTubeConnection } from "../../../../electron/shared/contracts";
import { Dashboard } from "../Dashboard";

const release: ReleaseSummary = { id: "release-1", title: "Different Perspective", artistId: "the-arkadiusz", artistName: "The Arkadiusz", primaryGenre: "Psytrance", story: "A release story", status: "planned", releaseDate: "2026-10-01", createdAt: "2026-09-01T00:00:00.000Z" };
const cover: AssetSummary = { id: "cover-1", releaseId: release.id, trackId: null, kind: "cover", filePath: "C:\\Artwork\\different-perspective.png", fileName: "different-perspective.png", mimeType: "image/png", sizeBytes: 123, modifiedAt: null, createdAt: "2026-09-01T00:00:00.000Z", width: 3000, height: 3000 };
const readiness: ReleaseReadiness = { releaseId: release.id, score: 50, missing: ["Cover artwork"], checks: [{ id: "audio", label: "Audio", complete: true, weight: 50, detail: "Audio attached" }, { id: "cover", label: "Cover", complete: false, weight: 50, detail: "Cover artwork missing" }] };
const tasks: TaskSummary[] = [
  { id: "task-1", releaseId: release.id, releaseTitle: release.title, title: "Review cover", status: "todo", priority: "medium", assignee: "human", dueAt: null, sourceKey: null, agentOutput: null, model: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
  { id: "task-2", releaseId: release.id, releaseTitle: release.title, title: "Metadata", status: "done", priority: "medium", assignee: "human", dueAt: null, sourceKey: null, agentOutput: null, model: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }
];

function renderDashboard({ assets = [], ...overrides }: Partial<React.ComponentProps<typeof Dashboard>> = {}) {
  const props: React.ComponentProps<typeof Dashboard> = { releases: [release], tasks, assets, featuredRelease: release, releaseReadiness: readiness, onCreateRelease: vi.fn(), onOpenRelease: vi.fn(), onOpenTasks: vi.fn(), onOpenCalendar: vi.fn(), playerPlaying: false, onPlayFeatured: vi.fn(), featuredAudioSource: undefined, ...overrides };
  render(<Dashboard {...props} />);
  return props;
}

describe("Dashboard", () => {
  it("renders a compact operational summary from release and task data", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("Different Perspective").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("50% ready")).toBeInTheDocument();
    expect(screen.queryByText(/Ready for the world/i)).not.toBeInTheDocument();
  });

  it("uses the existing cover asset when one is available", async () => {
    const previousStudio = window.studio;
    window.studio = { getAssetPlaybackUrl: vi.fn().mockResolvedValue("file:///C:/Artwork/different-perspective.png") } as unknown as StudioApi;
    try {
      renderDashboard({ assets: [cover] });
      expect(await screen.findByRole("img", { name: "Different Perspective cover artwork" })).toHaveAttribute("src", "file:///C:/Artwork/different-perspective.png");
      expect(window.studio.getAssetPlaybackUrl).toHaveBeenCalledWith(cover.id);
    } finally {
      window.studio = previousStudio;
    }
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
    expect(screen.getByLabelText(/^Scheduled Posts:/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Approvals Pending:/)).toBeInTheDocument();
    expect(screen.getByText("No upcoming schedule event.")).toBeInTheDocument();
    expect(screen.getByText("Analytics will appear after connected campaigns begin publishing.")).toBeInTheDocument();
  });

  it("renders derived campaign and schedule information from provided operational records", () => {
    renderDashboard({
      queue: [{ id: "queue-1", status: "approved", platform: "Instagram" } as never],
      events: [{ id: "event-1", status: "READY", scheduledAt: "2099-01-01T12:00:00.000Z", timezone: "UTC", campaignItemTitle: "Release teaser", platform: "Instagram", releaseTitle: release.title } as never]
    });
    expect(screen.getByLabelText("Scheduled Posts: 0. 1 in queue")).toBeInTheDocument();
    expect(screen.getByText("Release teaser")).toBeInTheDocument();
  });

  it("shows YouTube as Unavailable when not configured", () => {
    renderDashboard({ youTube: null });
    const youTubeRow = screen.getByText("YouTube").closest("div")!.parentElement!;
    expect(youTubeRow).toHaveTextContent("Unavailable");
    expect(youTubeRow.querySelector(".ui-status-badge-neutral")).not.toBeNull();
    expect(screen.queryByText("Metrics not synced yet")).not.toBeInTheDocument();
  });

  it("shows YouTube as Unavailable when YouTubeConnection is unconfigured", () => {
    const youTube: YouTubeConnection = { configured: false, connected: false, channelId: null, channelTitle: null, callbackUrl: "http://127.0.0.1:43822/callback", scopes: [], error: null };
    renderDashboard({ youTube });
    const youTubeRow = screen.getByText("YouTube").closest("div")!.parentElement!;
    expect(youTubeRow).toHaveTextContent("Unavailable");
    expect(youTubeRow.querySelector(".ui-status-badge-neutral")).not.toBeNull();
  });

  it("shows YouTube as Not connected when configured but not connected", () => {
    const youTube: YouTubeConnection = { configured: true, connected: false, channelId: null, channelTitle: null, callbackUrl: "http://127.0.0.1:43822/callback", scopes: [], error: null };
    renderDashboard({ youTube });
    const youTubeRow = screen.getByText("YouTube").closest("div")!.parentElement!;
    expect(youTubeRow).toHaveTextContent("Not connected");
    expect(youTubeRow).toHaveTextContent("Configured");
    expect(youTubeRow.querySelector(".ui-status-badge-warning")).not.toBeNull();
  });

  it("shows YouTube as Connected with channel title and channel ID and healthy styling", () => {
    const youTube: YouTubeConnection = { configured: true, connected: true, channelId: "UC123", channelTitle: "Sonic Ark Official", callbackUrl: "http://127.0.0.1:43822/callback", scopes: [], error: null };
    renderDashboard({ youTube });
    const youTubeRow = screen.getByText("YouTube").closest("div")!.parentElement!;
    expect(youTubeRow).toHaveTextContent("Connected");
    expect(youTubeRow).toHaveTextContent("Sonic Ark Official");
    expect(youTubeRow).toHaveTextContent("UC123");
    expect(youTubeRow.querySelector(".ui-status-badge-success")).not.toBeNull();
    expect(screen.getByText("Metrics not synced yet")).toBeInTheDocument();
  });

  it("refreshes YouTube connection status when prop changes without restart", async () => {
    const disconnected: YouTubeConnection = { configured: true, connected: false, channelId: null, channelTitle: null, callbackUrl: "http://127.0.0.1:43822/callback", scopes: [], error: null };
    const connected: YouTubeConnection = { configured: true, connected: true, channelId: "UC999", channelTitle: "Refreshed Channel", callbackUrl: "http://127.0.0.1:43822/callback", scopes: [], error: null };
    const { rerender } = render(<Dashboard releases={[release]} tasks={tasks} assets={[]} featuredRelease={release} releaseReadiness={readiness} onCreateRelease={vi.fn()} onOpenRelease={vi.fn()} onOpenTasks={vi.fn()} onOpenCalendar={vi.fn()} playerPlaying={false} onPlayFeatured={vi.fn()} featuredAudioSource={undefined} youTube={disconnected} />);
    expect(screen.getByText("YouTube").closest("div")!.parentElement!).toHaveTextContent("Not connected");
    rerender(<Dashboard releases={[release]} tasks={tasks} assets={[]} featuredRelease={release} releaseReadiness={readiness} onCreateRelease={vi.fn()} onOpenRelease={vi.fn()} onOpenTasks={vi.fn()} onOpenCalendar={vi.fn()} playerPlaying={false} onPlayFeatured={vi.fn()} featuredAudioSource={undefined} youTube={connected} />);
    const refreshedRow = screen.getByText("YouTube").closest("div")!.parentElement!;
    expect(refreshedRow).toHaveTextContent("Connected");
    expect(refreshedRow).toHaveTextContent("Refreshed Channel");
    expect(screen.getByText("Metrics not synced yet")).toBeInTheDocument();
  });
  it("uses cached YouTube metrics and the latest upload only for the connected channel", () => {
    const youTube: YouTubeConnection = { configured: true, connected: true, channelId: "UC123", channelTitle: "Sonic Ark Official", callbackUrl: "http://127.0.0.1:43822/callback", scopes: [], error: null };
    const youTubeData: YouTubeChannelDataSnapshot = { schemaVersion: 1, channelId: "UC123", lastSuccessfulSyncAt: "2026-09-18T10:00:00.000Z", lastAttemptAt: "2026-09-18T10:00:00.000Z", channel: { channelId: "UC123", title: "Sonic Ark Official", description: null, customUrl: null, publishedAt: null, country: null, thumbnails: null, subscriberCount: 1234, hiddenSubscriberCount: false, viewCount: 98765, videoCount: 12, uploadsPlaylistId: "UU123" }, videos: [{ videoId: "latest", channelId: "UC123", title: "Latest sonic transmission", description: null, publishedAt: "2026-09-17T10:00:00.000Z", tags: null, categoryId: null, thumbnails: null, duration: null, definition: null, caption: null, licensedContent: null, privacyStatus: "public", uploadStatus: null, embeddable: null, madeForKids: null, viewCount: 456, likeCount: 12, commentCount: 3 }] };
    renderDashboard({ youTube, youTubeData });
    expect(screen.getByText(/Latest sonic transmission/)).toBeInTheDocument();
  });

  it("does not render cached YouTube data from another channel", () => {
    const youTube: YouTubeConnection = { configured: true, connected: true, channelId: "UC123", channelTitle: "Sonic Ark Official", callbackUrl: "http://127.0.0.1:43822/callback", scopes: [], error: null };
    const youTubeData = { schemaVersion: 1, channelId: "UC-other", lastSuccessfulSyncAt: "2026-09-18T10:00:00.000Z", lastAttemptAt: null, channel: null, videos: [] } as YouTubeChannelDataSnapshot;
    renderDashboard({ youTube, youTubeData });
    expect(screen.getByText("Metrics not synced yet")).toBeInTheDocument();
  });  it("renders real selected-period YouTube analytics and empty state", () => {
    const youTube = { configured:true, connected:true, channelId:"UC123", channelTitle:"Channel", callbackUrl:"", scopes:[], error:null } as YouTubeConnection;
    const analytics = { schemaVersion:1, channelId:"UC123", range:"7d", lastSuccessfulSyncAt:"2026-09-18T00:00:00.000Z", lastAttemptAt:null, timeSeries:[{day:"2026-09-17",views:10,estimatedMinutesWatched:5,averageViewDuration:30,likes:2,comments:1}], videos:[{videoId:"v",title:"Top video",thumbnailUrl:null,views:10,estimatedMinutesWatched:5,averageViewDuration:30,likes:2,comments:1}], trafficSources:[{source:"SEARCH",views:4,estimatedMinutesWatched:2}], countries:[{country:"DE",views:3,estimatedMinutesWatched:1}], devices:[{device:"MOBILE",views:8,estimatedMinutesWatched:4}] } as never;
    renderDashboard({youTube,youTubeAnalytics:analytics,youTubeAnalyticsRange:"7d"});
    expect(screen.getByText(/Views · 7d/)).toBeInTheDocument(); expect(screen.getByLabelText("views over time")).toBeInTheDocument(); expect(screen.getByText("Traffic sources")).toBeInTheDocument(); expect(screen.getByText("SEARCH · 4")).toBeInTheDocument();
  });
});