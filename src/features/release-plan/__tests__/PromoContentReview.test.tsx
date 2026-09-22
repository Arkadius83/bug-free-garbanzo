import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PromoContentReview } from "../PromoContentReview";
import type { CampaignItem, PromoGeneration } from "../../../../electron/shared/contracts";
import {
  createMockStudio,
  installMockStudio,
  removeMockStudio,
  mockItem,
  resetIdCounter,
  type MockStudio
} from "./test-helpers";

let studio: MockStudio;

function generation(overrides?: Partial<PromoGeneration>): PromoGeneration {
  return {
    id: "pg-1",
    releaseId: "release-1",
    releasePlanId: "plan-1",
    campaignItemId: "item-1",
    contentType: "caption",
    generatedContent: "Generated caption content",
    campaignPackItemId: null,
    status: "SUCCESS",
    error: null,
    model: "test",
    reviewStatus: "GENERATED",
    originalContent: "Generated caption content",
    editedContent: null,
    reviewActor: null,
    reviewReason: null,
    reviewedAt: null,
    createdAt: "2026-09-15T12:00:00Z",
    ...overrides
  };
}

const campaignItems: CampaignItem[] = [mockItem({ id: "item-1", title: "Instagram caption" })];

beforeEach(() => {
  resetIdCounter();
  studio = createMockStudio();
  installMockStudio(studio);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  removeMockStudio();
});

describe("PromoContentReview delete action", () => {
  it("asks for confirmation, deletes the item, and refreshes the list", async () => {
    const deleteSpy = vi.fn(studio.deletePromoGeneration).mockResolvedValue(undefined);
    studio.deletePromoGeneration = deleteSpy;
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    const user = userEvent.setup();
    render(<PromoContentReview generations={[generation()]} campaignItems={campaignItems} busy={false} onRefresh={onRefresh} onError={onError} />);

    await user.click(screen.getByRole("button", { name: /^Delete$/i }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("pg-1"));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(await screen.findByRole("status")).toHaveTextContent("Promo item deleted.");
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not delete when confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const deleteSpy = vi.fn(studio.deletePromoGeneration);
    studio.deletePromoGeneration = deleteSpy;
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<PromoContentReview generations={[generation()]} campaignItems={campaignItems} busy={false} onRefresh={onRefresh} onError={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^Delete$/i }));

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("shows the dependency error and does not refresh when deletion is blocked", async () => {
    studio.deletePromoGeneration = async () => { throw new Error("Cannot delete: this generated promo item is referenced by a ScheduleEvent (READY); delete the ScheduleEvent separately first"); };
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    const user = userEvent.setup();
    render(<PromoContentReview generations={[generation()]} campaignItems={campaignItems} busy={false} onRefresh={onRefresh} onError={onError} />);

    await user.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("ScheduleEvent")));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByText("Generated caption content")).toBeInTheDocument();
  });

  it("strips the Electron IPC prefix from blocked deletion errors", async () => {
    studio.deletePromoGeneration = async () => { throw new Error("Error invoking remote method 'studio:delete-promo-generation': Error: Cannot delete: this promotion format is referenced by a Publishing Queue record"); };
    const onError = vi.fn();

    const user = userEvent.setup();
    render(<PromoContentReview generations={[generation()]} campaignItems={campaignItems} busy={false} onRefresh={vi.fn().mockResolvedValue(undefined)} onError={onError} />);

    await user.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Cannot delete: this promotion format is referenced by a Publishing Queue record"));
  });

  it("does not show a delete action for locked APPROVED content", async () => {
    studio.getCurrentReleasePlan = async () => null;
    render(<PromoContentReview generations={[generation({ reviewStatus: "APPROVED" })]} campaignItems={campaignItems} busy={false} onRefresh={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()} />);

    await screen.findByText("APPROVED");
    expect(screen.queryByRole("button", { name: /^Delete$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Return to Review/i })).toBeInTheDocument();
  });

  it("deletes only the selected item and keeps unrelated items after refresh", async () => {
    const remaining = [generation({ id: "pg-2", campaignItemId: "item-1", generatedContent: "Keep this content" })];
    studio.deletePromoGeneration = async () => undefined;
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const user = userEvent.setup();
    const view = render(<PromoContentReview generations={[generation(), ...remaining]} campaignItems={campaignItems} busy={false} onRefresh={onRefresh} onError={vi.fn()} />);

    await user.click(screen.getAllByRole("button", { name: /^Delete$/i })[0]);
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());

    view.rerender(<PromoContentReview generations={remaining} campaignItems={campaignItems} busy={false} onRefresh={onRefresh} onError={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Keep this content")).toBeInTheDocument();
      expect(screen.queryByText("Generated caption content")).not.toBeInTheDocument();
    });
  });
});
