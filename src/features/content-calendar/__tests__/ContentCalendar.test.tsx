import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ContentCalendar } from "../ContentCalendar";
import { createMockStudio, installMockStudio, removeMockStudio, mockScheduleEvent, resetIdCounter, type MockStudio } from "../../release-plan/__tests__/test-helpers";

let studio: MockStudio;

beforeEach(() => {
  resetIdCounter();
  studio = createMockStudio();
  installMockStudio(studio);
});

afterEach(() => {
  removeMockStudio();
});

describe("ContentCalendar", () => {
  it("renders persisted schedule events", async () => {
    studio.listScheduleEvents = async () => [mockScheduleEvent({ campaignItemTitle: "Launch caption", platform: "Instagram", status: "READY", scheduledAt: new Date().toISOString() })];
    render(<ContentCalendar />);
    expect(await screen.findByText("Launch caption")).toBeInTheDocument();
    expect(screen.getByText(/Instagram · Different Perspective/)).toBeInTheDocument();
  });

  it("switches week, month and list views", async () => {
    studio.listScheduleEvents = async () => [mockScheduleEvent({ scheduledAt: new Date().toISOString() })];
    render(<ContentCalendar />);
    await screen.findByLabelText("Content Calendar");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Month" }));
    expect(screen.getByRole("tab", { name: "Month" })).toHaveAttribute("data-state", "active");
    await user.click(screen.getByRole("tab", { name: "List" }));
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("data-state", "active");
    await user.click(screen.getByRole("tab", { name: "Week" }));
    expect(screen.getByRole("tab", { name: "Week" })).toHaveAttribute("data-state", "active");
  });

  it("opens the compact month view and keeps calendar controls interactive", async () => {
    studio.listScheduleEvents = async () => [mockScheduleEvent({ scheduledAt: new Date().toISOString() })];
    render(<ContentCalendar />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Month" }));
    expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("button", { name: "Today" })).toBeEnabled();
  });

  it("opens the existing approval queue from the primary schedule action", async () => {
    render(<ContentCalendar campaignPackItems={[]} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Schedule content" }));
    expect(screen.getByText("All items requiring review")).toBeInTheDocument();
  });

  it("opens details and updates an event without publishing", async () => {
    const update = vi.fn(studio.updateScheduleEvent);
    const publish = vi.fn();
    studio.updateScheduleEvent = update;
    studio.publishMetaQueueItem = publish as never;
    studio.listScheduleEvents = async () => [mockScheduleEvent({ scheduledAt: new Date().toISOString() })];
    render(<ContentCalendar />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Instagram announcement"));
    await user.selectOptions(screen.getByLabelText("Platform"), "Facebook");
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ platform: "Facebook" })));
    expect(publish).not.toHaveBeenCalled();
  });

  it("cancels a schedule event", async () => {
    const cancel = vi.fn(studio.cancelScheduleEvent);
    studio.cancelScheduleEvent = cancel;
    studio.listScheduleEvents = async () => [mockScheduleEvent({ scheduledAt: new Date().toISOString() })];
    render(<ContentCalendar />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Instagram announcement"));
    await user.click(screen.getByRole("button", { name: "Cancel schedule" }));
    await waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  it("shows the queue action only for a READY supported event and displays the linked queue", async () => {
    const queue = vi.fn(studio.sendScheduleEventToPublishingQueue);
    const publish = vi.fn();
    studio.sendScheduleEventToPublishingQueue = queue;
    studio.publishMetaQueueItem = publish as never;
    studio.listScheduleEvents = async () => [mockScheduleEvent({ status: "READY", scheduledAt: new Date().toISOString() })];
    render(<ContentCalendar />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Instagram announcement"));
    await user.click(screen.getByRole("button", { name: "Send to Publishing Queue" }));
    await waitFor(() => expect(queue).toHaveBeenCalled());
    expect(await screen.findByText(/In Publishing Queue/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to Publishing Queue" })).not.toBeInTheDocument();
  });

  it("does not offer queueing for non-ready or unsupported events", async () => {
    studio.listScheduleEvents = async () => [mockScheduleEvent({ status: "SCHEDULED", platform: "Instagram", scheduledAt: new Date().toISOString() })];
    render(<ContentCalendar />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Instagram announcement"));
    expect(screen.queryByRole("button", { name: "Send to Publishing Queue" })).not.toBeInTheDocument();
  });
  it("explains when a READY platform is not supported by the Publishing Queue", async () => {
    studio.listScheduleEvents = async () => [mockScheduleEvent({ status: "READY", platform: "TikTok", scheduledAt: new Date().toISOString() })];
    render(<ContentCalendar />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Instagram announcement"));
    expect(screen.getByText("TikTok publishing is not available yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to Publishing Queue" })).not.toBeInTheDocument();
  });});
