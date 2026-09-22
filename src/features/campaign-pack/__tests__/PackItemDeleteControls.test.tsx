import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PackItemDeleteControls, lockLabelFor, deleteTitleFor } from "../PackItemDeleteControls";
import type { CampaignPackItemDependencyStatus } from "../../../../electron/shared/contracts";

function status(overrides?: Partial<CampaignPackItemDependencyStatus>): CampaignPackItemDependencyStatus {
  return {
    canDelete: true,
    deleteMode: "normal",
    dependencies: { publishingQueue: 0, promoGenerations: 0, mediaGenerations: 0 },
    ...overrides
  };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PackItemDeleteControls lock states", () => {
  it("shows no lock label and enables Delete when there are no dependencies", () => {
    render(<PackItemDeleteControls dependencyStatus={status()} onDelete={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
    const button = screen.getByRole("button", { name: /^Delete$/i });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("title", "Delete");
  });

  it("disables Delete and shows publishing-queue lock with tooltip", () => {
    const onDelete = vi.fn();
    render(
      <PackItemDeleteControls
        dependencyStatus={status({ canDelete: false, deleteMode: "blocked", dependencies: { publishingQueue: 1, promoGenerations: 0, mediaGenerations: 0 } })}
        onDelete={onDelete}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Locked: publishing queue");
    const button = screen.getByRole("button", { name: /^Delete$/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("Publishing Queue"));
  });

  it("disables Delete and shows media-generation lock with tooltip", () => {
    render(
      <PackItemDeleteControls
        dependencyStatus={status({ canDelete: false, deleteMode: "blocked", dependencies: { publishingQueue: 0, promoGenerations: 0, mediaGenerations: 2 } })}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Locked: media generation");
    const button = screen.getByRole("button", { name: /^Delete$/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("media generation"));
  });

  it("keeps Delete enabled for promo-only detach and explains the detach in the tooltip", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <PackItemDeleteControls
        dependencyStatus={status({ deleteMode: "detach-promo", dependencies: { publishingQueue: 0, promoGenerations: 1, mediaGenerations: 0 } })}
        onDelete={onDelete}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Linked to approved promo");
    const button = screen.getByRole("button", { name: /^Delete$/i });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("source reference is detached"));
    await user.click(button);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("derives lock labels and titles from dependency status", () => {
    expect(lockLabelFor(null)).toBeNull();
    expect(lockLabelFor(status())).toBeNull();
    expect(lockLabelFor(status({ canDelete: false, deleteMode: "blocked", dependencies: { publishingQueue: 1, promoGenerations: 0, mediaGenerations: 0 } }))).toBe("Locked: publishing queue");
    expect(lockLabelFor(status({ canDelete: false, deleteMode: "blocked", dependencies: { publishingQueue: 0, promoGenerations: 0, mediaGenerations: 1 } }))).toBe("Locked: media generation");
    expect(lockLabelFor(status({ deleteMode: "detach-promo", dependencies: { publishingQueue: 0, promoGenerations: 1, mediaGenerations: 0 } }))).toBe("Linked to approved promo");
    expect(deleteTitleFor(status({ canDelete: false, deleteMode: "blocked", dependencies: { publishingQueue: 1, promoGenerations: 0, mediaGenerations: 0 } }))).toContain("Publishing Queue");
    expect(deleteTitleFor(status({ deleteMode: "detach-promo", dependencies: { publishingQueue: 0, promoGenerations: 1, mediaGenerations: 0 } }))).toContain("unchanged");
  });
});
