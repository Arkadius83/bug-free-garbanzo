import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { StudioApi, TikTokConnection } from "../../../../electron/shared/contracts";
import { Dashboard } from "../Dashboard";

const originalStudio = window.studio;
afterEach(() => { cleanup(); window.studio = originalStudio; });
const props = { releases: [], tasks: [], assets: [], featuredRelease: undefined, releaseReadiness: null, onCreateRelease: vi.fn(), onOpenRelease: vi.fn(), onOpenTasks: vi.fn(), onOpenCalendar: vi.fn() };
const connection = (connected: boolean) => ({ connected, configured: true, displayName: connected ? "Artist channel" : null } as TikTokConnection);
const row = (name: string) => screen.getByText(name).closest(".platform-status-list > div") as HTMLElement;

describe("Overview V4", () => {
  it("loads TikTok status from the same IPC used by Settings and refreshes on focus", async () => {
    const getTikTokConnection = vi.fn().mockResolvedValueOnce(connection(false)).mockResolvedValueOnce(connection(true));
    window.studio = { getTikTokConnection } as unknown as StudioApi;
    render(<Dashboard {...props} />);
    await waitFor(() => expect(within(row("TikTok")).getByText("Not connected")).toBeInTheDocument());
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(within(row("TikTok")).getByText("Connected")).toBeInTheDocument());
    expect(getTikTokConnection).toHaveBeenCalledTimes(2);
    expect(within(row("TikTok")).getByText("Artist channel")).toBeInTheDocument();
  });
  it("does not retain a stale connected badge when status refresh fails", async () => {
    const getTikTokConnection = vi.fn().mockResolvedValueOnce(connection(true)).mockRejectedValueOnce(new Error("private backend error"));
    window.studio = { getTikTokConnection } as unknown as StudioApi;
    render(<Dashboard {...props} />);
    await waitFor(() => expect(within(row("TikTok")).getByText("Connected")).toBeInTheDocument());
    act(() => window.dispatchEvent(new Event("focus")));
    await screen.findByText("Connection status could not be refreshed");
    expect(within(row("TikTok")).queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText("private backend error")).not.toBeInTheDocument();
  });
  it("explains genuinely absent Discord integration and uses local brand icons", () => {
    window.studio = undefined;
    const { container } = render(<Dashboard {...props} />);
    expect(within(row("Discord")).getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("No Discord integration is installed")).toBeInTheDocument();
    for (const name of ["Spotify", "SoundCloud", "Instagram", "Facebook", "YouTube", "TikTok", "Discord"]) {
      const icon = row(name).querySelector(".platform-brand");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon?.getAttribute("style")).toContain("--platform-icon:");
      expect(icon?.getAttribute("style")).not.toContain('url("http');
    }
    expect(container.querySelector(".overview-v4")).toBeInTheDocument();
    expect(screen.getByText("Total Reach")).toBeInTheDocument();
    expect(screen.getByText("Analytics not synced yet")).toBeInTheDocument();
  });
  it("ignores late connection results after unmount", async () => {
    let resolve!: (value: TikTokConnection) => void;
    const getTikTokConnection = vi.fn(() => new Promise<TikTokConnection>(done => { resolve = done; }));
    window.studio = { getTikTokConnection } as unknown as StudioApi;
    const view = render(<Dashboard {...props} />);
    view.unmount();
    await act(async () => resolve(connection(true)));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(getTikTokConnection).toHaveBeenCalledOnce();
  });
});
