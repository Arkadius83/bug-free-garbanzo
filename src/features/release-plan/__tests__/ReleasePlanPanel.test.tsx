import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ReleasePlanPanel } from "../ReleasePlanPanel";
import {
  createMockStudio,
  installMockStudio,
  removeMockStudio,
  mockRelease,
  mockPlan,
  mockItem,
  mockApprovalRecord,
  resetIdCounter,
  type MockStudio
} from "./test-helpers";

let studio: MockStudio;
const release = mockRelease();

beforeEach(() => {
  resetIdCounter();
  studio = createMockStudio();
  installMockStudio(studio);
});

afterEach(() => {
  removeMockStudio();
});

describe("ReleasePlanPanel", () => {
  describe("Empty state", () => {
    it("shows empty state when no plan exists", async () => {
      render(<ReleasePlanPanel release={release} />);
      expect(await screen.findByText("No Release Plan yet")).toBeInTheDocument();
    });

    it("shows generate button when no plan exists", async () => {
      render(<ReleasePlanPanel release={release} />);
      expect(await screen.findByRole("button", { name: /Generate Release Plan/i })).toBeInTheDocument();
    });

    it("does not show generate button when plan exists", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Generate Release Plan/i })).not.toBeInTheDocument();
      });
    });
  });

  describe("Generate flow", () => {
    it("calls generateReleasePlan when generate button is clicked", async () => {
      const user = userEvent.setup();
      const generateSpy = vi.fn(studio.generateReleasePlan);
      studio.generateReleasePlan = generateSpy;

      render(<ReleasePlanPanel release={release} />);
      await screen.findByText("No Release Plan yet");
      await user.click(screen.getByRole("button", { name: /Generate Release Plan/i }));

      expect(generateSpy).toHaveBeenCalledWith({ releaseId: "release-1", actor: "local-user" });
    });

    it("renders generated plan after success", async () => {
      const plan = mockPlan({ title: "Generated Plan" });
      studio.generateReleasePlan = async () => plan;

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await screen.findByText("No Release Plan yet");
      await user.click(screen.getByRole("button", { name: /Generate Release Plan/i }));

      await waitFor(() => {
        expect(screen.getByText("Generated Plan")).toBeInTheDocument();
      });
    });

    it("shows generating text during request", async () => {
      let resolveGenerate: (v: unknown) => void;
      studio.generateReleasePlan = () => new Promise((resolve) => { resolveGenerate = resolve; }) as never;

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await screen.findByText("No Release Plan yet");
      await user.click(screen.getByRole("button", { name: /Generate Release Plan/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Generating\.\.\./i })).toBeInTheDocument();
      });

      resolveGenerate!(mockPlan());
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Generating\.\.\./i })).not.toBeInTheDocument();
      });
    });

    it("shows error state on failure", async () => {
      studio.generateReleasePlan = async () => { throw new Error("AI provider unavailable"); };

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await screen.findByText("No Release Plan yet");
      await user.click(screen.getByRole("button", { name: /Generate Release Plan/i }));

      await waitFor(() => {
        expect(screen.getByText("AI provider unavailable")).toBeInTheDocument();
      });
    });

    it("shows generic error for non-Error throws", async () => {
      studio.generateReleasePlan = async () => { throw "raw string error"; };

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await screen.findByText("No Release Plan yet");
      await user.click(screen.getByRole("button", { name: /Generate Release Plan/i }));

      await waitFor(() => {
        expect(screen.getByText("Generation failed")).toBeInTheDocument();
      });
    });
  });

  describe("DRAFT behavior", () => {
    const draftPlan = () => mockPlan({
      status: "DRAFT",
      campaignItems: [
        mockItem({ id: "item-1", title: "Instagram post", sortOrder: 0 }),
        mockItem({ id: "item-2", title: "TikTok teaser", sortOrder: 1 }),
        mockItem({ id: "item-3", title: "YouTube short", sortOrder: 2 })
      ]
    });

    it("renders campaign items in sort order", async () => {
      studio.getCurrentReleasePlan = async () => draftPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByText("Instagram post")).toBeInTheDocument();
      });
      expect(screen.getByText("TikTok teaser")).toBeInTheDocument();
      expect(screen.getByText("YouTube short")).toBeInTheDocument();

      const cards = document.querySelectorAll(".rp-card");
      expect(cards.length).toBe(3);
      expect(cards[0]).toHaveTextContent("Instagram post");
      expect(cards[1]).toHaveTextContent("TikTok teaser");
      expect(cards[2]).toHaveTextContent("YouTube short");
    });

    it("shows add item button in DRAFT", async () => {
      studio.getCurrentReleasePlan = async () => draftPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /\+ Add item/i })).toBeInTheDocument();
      });
    });

    it("shows mark as reviewed button in DRAFT", async () => {
      studio.getCurrentReleasePlan = async () => draftPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Mark as Reviewed/i })).toBeInTheDocument();
      });
    });

    it("shows regenerate button in DRAFT", async () => {
      studio.getCurrentReleasePlan = async () => draftPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Regenerate/i })).toBeInTheDocument();
      });
    });

    it("add item calls createCampaignItem", async () => {
      const createSpy = vi.fn(studio.createCampaignItem);
      studio.createCampaignItem = createSpy;
      studio.getCurrentReleasePlan = async () => draftPlan();

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("Instagram post"));

      await user.click(screen.getByRole("button", { name: /\+ Add item/i }));
      expect(screen.getByText("Add to Release Plan")).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Title/i), "New caption");
      await user.type(screen.getByLabelText(/^Purpose/i), "Drive streams");
      await user.click(screen.getByRole("button", { name: /^Add item$/i }));

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalled();
      });
    });

    it("delete item calls deleteCampaignItem and removes from list", async () => {
      const deleteSpy = vi.fn(studio.deleteCampaignItem);
      studio.deleteCampaignItem = deleteSpy;
      studio.getCurrentReleasePlan = async () => draftPlan();

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("Instagram post"));

      const deleteButton = screen.getAllByTitle("Delete")[0];
      await user.click(deleteButton);

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith("item-1");
      });
    });

    it("reorder up calls reorderCampaignItems", async () => {
      const reorderSpy = vi.fn(studio.reorderCampaignItems);
      studio.reorderCampaignItems = reorderSpy;
      studio.getCurrentReleasePlan = async () => draftPlan();

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("TikTok teaser"));

      const moveUpButtons = screen.getAllByTitle("Move up");
      await user.click(moveUpButtons[1]);

      await waitFor(() => {
        expect(reorderSpy).toHaveBeenCalled();
      });
    });

    it("mark as reviewed calls changeReleasePlanStatus", async () => {
      const statusSpy = vi.fn(studio.changeReleasePlanStatus);
      studio.changeReleasePlanStatus = statusSpy;
      studio.getCurrentReleasePlan = async () => draftPlan();

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("Instagram post"));

      await user.click(screen.getByRole("button", { name: /Mark as Reviewed/i }));

      await waitFor(() => {
        expect(statusSpy).toHaveBeenCalledWith(
          expect.objectContaining({ status: "REVIEWED" })
        );
      });
    });
  });

  describe("REVIEWED behavior", () => {
    const reviewedPlan = () => mockPlan({ status: "REVIEWED" });

    it("shows approve button", async () => {
      studio.getCurrentReleasePlan = async () => reviewedPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Approve Release Plan/i })).toBeInTheDocument();
      });
    });

    it("shows return to draft button", async () => {
      studio.getCurrentReleasePlan = async () => reviewedPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Return to Draft/i })).toBeInTheDocument();
      });
    });

    it("shows regenerate button", async () => {
      studio.getCurrentReleasePlan = async () => reviewedPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Regenerate/i })).toBeInTheDocument();
      });
    });

    it("approve calls approveReleasePlan", async () => {
      const approveSpy = vi.fn(studio.approveReleasePlan);
      studio.approveReleasePlan = approveSpy;
      studio.getCurrentReleasePlan = async () => reviewedPlan();

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByRole("button", { name: /Approve Release Plan/i }));

      await user.click(screen.getByRole("button", { name: /Approve Release Plan/i }));

      await waitFor(() => {
        expect(approveSpy).toHaveBeenCalled();
      });
    });
  });

  describe("APPROVED behavior", () => {
    const approvedPlan = () => mockPlan({ status: "APPROVED" });

    it("shows locked message", async () => {
      studio.getCurrentReleasePlan = async () => approvedPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByText("Approved revision – locked")).toBeInTheDocument();
      });
    });

    it("shows regenerate as new revision button", async () => {
      studio.getCurrentReleasePlan = async () => approvedPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Regenerate as New Revision/i })).toBeInTheDocument();
      });
    });

    it("does not show add item or edit buttons", async () => {
      studio.getCurrentReleasePlan = async () => approvedPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByText("Approved revision – locked")).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /\+ Add item/i })).not.toBeInTheDocument();
    });

    it("displays status badge as APPROVED", async () => {
      studio.getCurrentReleasePlan = async () => approvedPlan();
      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByText("APPROVED")).toBeInTheDocument();
      });
    });
  });

  describe("Revision history", () => {
    it("shows revision history button when multiple plans exist", async () => {
      const plan1 = mockPlan({ id: "plan-1", revisionNumber: 2 });
      const plan2 = mockPlan({ id: "plan-2", revisionNumber: 1 });
      studio.getCurrentReleasePlan = async () => plan1;
      studio.listReleasePlans = async () => [plan1, plan2];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Revision history/i })).toBeInTheDocument();
      });
    });

    it("does not show revision history button for single plan", async () => {
      const plan = mockPlan();
      studio.getCurrentReleasePlan = async () => plan;
      studio.listReleasePlans = async () => [plan];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText(plan.title));
      expect(screen.queryByRole("button", { name: /Revision history/i })).not.toBeInTheDocument();
    });

    it("shows current revision badge", async () => {
      const plan1 = mockPlan({ id: "plan-1", revisionNumber: 2 });
      const plan2 = mockPlan({ id: "plan-2", revisionNumber: 1 });
      studio.getCurrentReleasePlan = async () => plan1;
      studio.listReleasePlans = async () => [plan1, plan2];

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByRole("button", { name: /Revision history/i }));

      await user.click(screen.getByRole("button", { name: /Revision history/i }));

      await waitFor(() => {
        expect(screen.getByText("CURRENT")).toBeInTheDocument();
      });
    });

    it("historical revision selection changes displayed plan", async () => {
      const plan1 = mockPlan({ id: "plan-1", revisionNumber: 2, title: "Revision 2" });
      const plan2 = mockPlan({ id: "plan-2", revisionNumber: 1, title: "Revision 1" });
      studio.getCurrentReleasePlan = async () => plan1;
      studio.listReleasePlans = async () => [plan1, plan2];

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("Revision 2"));

      await user.click(screen.getByRole("button", { name: /Revision history/i }));
      await waitFor(() => screen.getByText("Revision 1"));

      await user.click(screen.getByText("Revision 1"));

      await waitFor(() => {
        expect(screen.getByText("Revision 1")).toBeInTheDocument();
      });
    });
  });

  describe("Approval history", () => {
    it("renders approval records with action, actor, and reason", async () => {
      const plan1 = mockPlan({ id: "plan-1", revisionNumber: 2 });
      const plan2 = mockPlan({ id: "plan-2", revisionNumber: 1 });
      const record = mockApprovalRecord({
        action: "APPROVED",
        actor: "Arkadiusz",
        reason: "Looks great",
        previousStatus: "REVIEWED",
        newStatus: "APPROVED"
      });
      studio.getCurrentReleasePlan = async () => plan1;
      studio.listReleasePlans = async () => [plan1, plan2];
      studio.listApprovalRecords = async () => [record];

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText(plan1.title));

      await user.click(screen.getByRole("button", { name: /Revision history/i }));

      await waitFor(() => {
        expect(screen.getByText("Approved")).toBeInTheDocument();
      });
      expect(screen.getByText("Arkadiusz")).toBeInTheDocument();
      expect(screen.getByText("Looks great")).toBeInTheDocument();
    });

    it("displays status transition", async () => {
      const plan1 = mockPlan({ id: "plan-1", revisionNumber: 2 });
      const plan2 = mockPlan({ id: "plan-2", revisionNumber: 1 });
      const record = mockApprovalRecord({
        previousStatus: "REVIEWED",
        newStatus: "APPROVED"
      });
      studio.getCurrentReleasePlan = async () => plan1;
      studio.listReleasePlans = async () => [plan1, plan2];
      studio.listApprovalRecords = async () => [record];

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText(plan1.title));

      await user.click(screen.getByRole("button", { name: /Revision history/i }));

      await waitFor(() => {
        expect(screen.getByText("REVIEWED → APPROVED")).toBeInTheDocument();
      });
    });

    it("does not render approval history when records are empty", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan();
      studio.listApprovalRecords = async () => [];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("Release Plan"));

      expect(screen.queryByText("Approval History")).not.toBeInTheDocument();
    });
  });

  describe("Regeneration", () => {
    it("calls regenerateReleasePlan when regenerate is clicked", async () => {
      const plan = mockPlan({ status: "DRAFT" });
      const regenerated = mockPlan({ id: "plan-new", revisionNumber: 2, status: "DRAFT" });
      studio.getCurrentReleasePlan = async () => plan;
      studio.regenerateReleasePlan = async () => regenerated;

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText(plan.title));

      await user.click(screen.getByRole("button", { name: /^Regenerate$/i }));

      await waitFor(() => {
        expect(screen.getByText(regenerated.title)).toBeInTheDocument();
      });
    });

    it("shows error on regeneration failure", async () => {
      const plan = mockPlan({ status: "DRAFT" });
      studio.getCurrentReleasePlan = async () => plan;
      studio.regenerateReleasePlan = async () => { throw new Error("Regeneration failed"); };

      const user = userEvent.setup();
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText(plan.title));

      await user.click(screen.getByRole("button", { name: /^Regenerate$/i }));

      await waitFor(() => {
        expect(screen.getByText("Regeneration failed")).toBeInTheDocument();
      });
    });
  });

  describe("Error handling", () => {
    it("API failure does not crash the UI", async () => {
      studio.getCurrentReleasePlan = async () => { throw new Error("SQLITE_CONSTRAINT"); };

      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByText("SQLITE_CONSTRAINT")).toBeInTheDocument();
      });
      expect(screen.getByText("◎")).toBeInTheDocument();
    });

    it("user-friendly error is shown, not raw internal details", async () => {
      studio.getCurrentReleasePlan = async () => { throw new Error("Could not load Release Plan"); };

      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByText("Could not load Release Plan")).toBeInTheDocument();
      });
    });

    it("non-Error throws show generic message", async () => {
      studio.getCurrentReleasePlan = async () => { throw "internal error"; };

      render(<ReleasePlanPanel release={release} />);

      await waitFor(() => {
        expect(screen.getByText("Could not load Release Plan")).toBeInTheDocument();
      });
    });
  });

  describe("Terminology", () => {
    it("does not contain Harness Plan in empty state", async () => {
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("No Release Plan yet"));

      const body = document.body.textContent ?? "";
      expect(body).not.toContain("Harness Plan");
    });

    it("does not contain Harness Plan in DRAFT state", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "DRAFT" });
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("Release Plan"));

      const body = document.body.textContent ?? "";
      expect(body).not.toContain("Harness Plan");
    });

    it("does not contain Harness Plan in APPROVED state", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("APPROVED"));

      const body = document.body.textContent ?? "";
      expect(body).not.toContain("Harness Plan");
    });

    it("uses Release Plan terminology for generate button", async () => {
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("No Release Plan yet"));

      expect(screen.getByRole("button", { name: /Generate Release Plan/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Generate Harness/i })).not.toBeInTheDocument();
    });

    it("uses Release Plan terminology for approve button", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "REVIEWED" });
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("REVIEWED"));

      expect(screen.getByRole("button", { name: /Approve Release Plan/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Approve Harness/i })).not.toBeInTheDocument();
    });
  });

  describe("Promo content generation", () => {
    it("shows Generate Promo Content button for APPROVED plans", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("APPROVED"));
      expect(screen.getByRole("button", { name: /Generate Promo Content/i })).toBeInTheDocument();
    });

    it("does not show Generate Promo Content button for DRAFT plans", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "DRAFT" });
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("DRAFT"));
      expect(screen.queryByRole("button", { name: /Generate Promo Content/i })).not.toBeInTheDocument();
    });

    it("does not show Generate Promo Content button for REVIEWED plans", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "REVIEWED" });
      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("REVIEWED"));
      expect(screen.queryByRole("button", { name: /Generate Promo Content/i })).not.toBeInTheDocument();
    });

    it("calls generatePromoContent and displays result", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      studio.generatePromoContent = async () => ({
        runId: "plan-1",
        totalItems: 3,
        generated: 2,
        failed: 1,
        skipped: 0,
        items: [
          { campaignItemId: "item-1", title: "Caption", contentType: "caption", status: "SUCCESS", error: null, promoGenerationId: "pg-1" },
          { campaignItemId: "item-2", title: "Hook", contentType: "video-hook", status: "FAILED", error: "Ollama timeout", promoGenerationId: "pg-2" },
          { campaignItemId: "item-3", title: "Script", contentType: "video-script", status: "SUCCESS", error: null, promoGenerationId: "pg-3" }
        ]
      });
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Beautiful sunset vibes", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" },
        { id: "pg-2", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-2", contentType: "video-hook", generatedContent: "", campaignPackItemId: null, status: "FAILED" as const, error: "Ollama timeout", model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" },
        { id: "pg-3", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-3", contentType: "video-script", generatedContent: "Open with wide drone shot", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("APPROVED"));

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Generate Promo Content/i }));

      await waitFor(() => {
        expect(screen.getByText("2 generated")).toBeInTheDocument();
        expect(screen.getByText("1 failed")).toBeInTheDocument();
        expect(screen.getByText("0 skipped")).toBeInTheDocument();
      });
    });

    it("shows promo generation status badges after generation", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Amazing sunset", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" },
        { id: "pg-2", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-2", contentType: "video-hook", generatedContent: "", campaignPackItemId: null, status: "FAILED" as const, error: "Connection refused", model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => screen.getByText("APPROVED"));

      expect(screen.getByText("SUCCESS")).toBeInTheDocument();
      expect(screen.getByText("FAILED")).toBeInTheDocument();
      expect(screen.getByText("Connection refused")).toBeInTheDocument();
    });

    it("shows existing promo generations on load", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Content here", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.getByText("Promo Content Review")).toBeInTheDocument();
        expect(screen.getByText("caption")).toBeInTheDocument();
        expect(screen.getByText("Content here")).toBeInTheDocument();
      });
    });

    it("shows review status badges for each promo item", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Content", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "APPROVED" as const, originalContent: null, editedContent: null, reviewActor: "admin", reviewReason: "Good", reviewedAt: "2026-09-15T12:00:00Z", createdAt: "2026-09-15T12:00:00Z" },
        { id: "pg-2", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-2", contentType: "video-hook", generatedContent: "Hook", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "REJECTED" as const, originalContent: null, editedContent: null, reviewActor: "admin", reviewReason: "Bad", reviewedAt: "2026-09-15T12:00:00Z", createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.getAllByText("APPROVED").length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText("REJECTED")).toBeInTheDocument();
      });
    });

    it("shows Edit and Approve buttons for GENERATED items", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Content", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Reject/i })).toBeInTheDocument();
      });
    });

    it("shows Return to Review button for APPROVED items", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Content", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "APPROVED" as const, originalContent: null, editedContent: null, reviewActor: "admin", reviewReason: "Good", reviewedAt: "2026-09-15T12:00:00Z", createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Return to Review/i })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
      });
    });

    it("shows Retry button for FAILED items", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "", campaignPackItemId: null, status: "FAILED" as const, error: "Ollama timeout", model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
        expect(screen.getByText("Ollama timeout")).toBeInTheDocument();
      });
    });

    it("shows skip reason for SKIPPED items", async () => {
      studio.getCurrentReleasePlan = async () => mockPlan({ status: "APPROVED" });
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "other", generatedContent: "", campaignPackItemId: null, status: "SKIPPED" as const, error: "Content type \"other\" is not supported", model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.getByText("Content type \"other\" is not supported")).toBeInTheDocument();
      });
    });

    it("shows campaign item title and platforms for promo items", async () => {
      studio.getCurrentReleasePlan = async () => {
        const p = mockPlan({ status: "APPROVED" });
        p.campaignItems = [mockItem({ id: "item-1", title: "Instagram Caption", contentType: "caption", targetPlatforms: ["Instagram", "Facebook"] })];
        return p;
      };
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Content", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      await waitFor(() => {
        expect(screen.getAllByText("Instagram Caption").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Instagram, Facebook")).toBeInTheDocument();
      });
    });
    it("schedules approved promo content from review", async () => {
      const createSchedule = vi.fn(studio.createScheduleEvent);
      studio.createScheduleEvent = createSchedule;
      studio.getCurrentReleasePlan = async () => {
        const p = mockPlan({ id: "plan-1", status: "APPROVED" });
        p.campaignItems = [mockItem({ id: "item-1", title: "Instagram Caption", targetPlatforms: ["Instagram", "Facebook"] })];
        return p;
      };
      studio.listPromoGenerations = async () => [
        { id: "pg-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Content", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "APPROVED" as const, originalContent: null, editedContent: null, reviewActor: "admin", reviewReason: "Good", reviewedAt: "2026-09-15T12:00:00Z", createdAt: "2026-09-15T12:00:00Z" }
      ];

      render(<ReleasePlanPanel release={release} />);
      const user = userEvent.setup();
      await user.type(await screen.findByLabelText("Schedule date and time"), "2026-10-01T18:00");
      await user.click(screen.getByRole("button", { name: /Add to Calendar/i }));

      await waitFor(() => expect(createSchedule).toHaveBeenCalledWith(expect.objectContaining({ promoGenerationId: "pg-1", platform: "Instagram" })));
      expect(screen.getByText("Added to Content Calendar.")).toBeInTheDocument();
    });
  });
});