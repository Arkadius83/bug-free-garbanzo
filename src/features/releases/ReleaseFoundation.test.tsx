import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import type { StudioApi, AssetSummary } from "../../../electron/shared/contracts";
import { ReleaseFoundation, ReleaseReadinessCard, ReleaseWorkflowBar } from "./ReleaseFoundation";
import { normalizeInterfacePreferences } from "../../../electron/shared/interface-preferences";
import { configureInterfaceSounds, playInterfaceSound } from "../../ui/interfaceSoundService";

const originalStudio = window.studio;
beforeEach(() => {
  window.studio = { getCurrentReleasePlan: vi.fn().mockResolvedValue(null), listPromoGenerations: vi.fn().mockResolvedValue([]), getAssetPlaybackUrl: vi.fn().mockResolvedValue("studio-media://asset/cover") } as unknown as StudioApi;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); window.studio = originalStudio; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(overrides: Partial<ComponentProps<typeof ReleaseFoundation>> = {}) {
  const props: ComponentProps<typeof ReleaseFoundation> = { releaseId: "r1", title: "Real release", artist: "Real artist", genre: "Psytrance", date: "2026-10-01", story: "Existing story", status: "draft", allowedStatuses: ["draft", "planned"], assets: [], readiness: null, saveMessage: "", assetMessage: "", analyzing: false, onTitle: vi.fn(), onGenre: vi.fn(), onDate: vi.fn(), onStory: vi.fn(), onStatus: vi.fn(), onSave: vi.fn(), onAttach: vi.fn(), onNavigate: vi.fn(), renderAsset: asset => <p key={asset.id}>{asset.fileName} details</p>, ...overrides };
  render(<ReleaseFoundation {...props} />); return props;
}
describe("Release Foundation V3.1", () => {
  it("retains controlled editing and save callbacks", () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText("Track title"), { target: { value: "Updated" } });
    fireEvent.change(screen.getByLabelText("Track story"), { target: { value: "Updated story" } });
    fireEvent.change(screen.getByLabelText("Release date"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(props.onTitle).toHaveBeenCalledWith("Updated"); expect(props.onStory).toHaveBeenCalledWith("Updated story"); expect(props.onDate).toHaveBeenCalledWith("2026-11-01"); expect(props.onSave).toHaveBeenCalledOnce();
  });
  it("preserves allowed release status transitions", () => {
    setup(); expect(screen.getByRole("option", { name: "published" })).toBeDisabled(); expect(screen.getByRole("option", { name: "planned" })).not.toBeDisabled(); expect(screen.getByLabelText("Artist")).toHaveAttribute("readonly");
  });
  it("opens contextual metadata with accessible title and closes on Escape cancellation", () => {
    setup(); const trigger = screen.getByRole("button", { name: "Edit release" }); trigger.focus(); fireEvent.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Edit release metadata" }); expect(drawer).toBeVisible(); fireEvent(drawer, new Event("cancel", { bubbles: true, cancelable: true })); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });
  it("uses the real async cover URL and never invents artwork", async () => {
    setup({ assets: [{ id: "cover", releaseId: "r1", kind: "cover", fileName: "cover.png" } as AssetSummary] });
    expect(await screen.findByRole("img", { name: "Real release cover artwork" })).toHaveAttribute("src", "studio-media://asset/cover"); expect(window.studio!.getAssetPlaybackUrl).toHaveBeenCalledWith("cover");
  });
  it("keeps upload and audio details attached to existing callbacks", () => {
    const props = setup({ assets: [{ id: "audio", releaseId: "r1", kind: "audio", fileName: "track.wav" } as AssetSummary] });
    fireEvent.click(screen.getByRole("button", { name: "Choose audio" })); expect(props.onAttach).toHaveBeenCalledWith("audio");
    fireEvent.click(screen.getByRole("button", { name: "Tracks & audio analysis" })); expect(screen.getByText("track.wav details")).toBeInTheDocument();
  });
  it("keeps navigation delegated and readiness bound to the current release", () => {
    const props = setup({ readiness: { releaseId: "other", score: 100, missing: [], checks: [] } });
    expect(screen.getByText("Save a release to check readiness")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Release plan →" })); expect(props.onNavigate).toHaveBeenCalledWith("release-plan");
  });
  it("shows actual readiness and does not infer completion from opening the screen", () => {
    render(<><ReleaseReadinessCard readiness={{ releaseId: "r1", score: 62, missing: ["Audio missing"], checks: [] }} /><ReleaseWorkflowBar readiness={null} onNavigate={vi.fn()} /></>);
    expect(screen.getByRole("img", { name: "62% release readiness" })).toBeInTheDocument(); expect(screen.queryByText("Complete")).not.toBeInTheDocument();
  });
  it("loads plan evidence without generating or modifying content", async () => {
    setup(); await waitFor(() => expect(window.studio!.getCurrentReleasePlan).toHaveBeenCalledWith("r1")); expect(window.studio!.listPromoGenerations).not.toHaveBeenCalled();
  });
  it("renders analyzing and persisted save feedback", () => {
    setup({ analyzing: true, saveMessage: "Release changes saved locally" }); expect(screen.getByLabelText("Analyzing audio")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Saved ✓" })).toBeInTheDocument();
  });
});
it("announces existing save failures without changing the form values", () => {
  setup({ saveError: true, saveMessage: "A title is required" });
  expect(screen.getByRole("alert")).toHaveTextContent("A title is required");
  expect(screen.getByLabelText("Track title")).toHaveValue("Real release");
  expect(screen.getByText("Basic Information").closest("section")).toHaveAttribute("data-save-error", "true");
});

describe("Interface feedback safety", () => {
  it("normalizes corrupt preferences and clamps volume", () => { expect(normalizeInterfacePreferences(null)).toEqual({ soundsEnabled: false, soundVolume: 0.12, reducedMotion: false }); expect(normalizeInterfacePreferences({ soundVolume: 10 }).soundVolume).toBe(1); expect(normalizeInterfacePreferences({ soundVolume: NaN }).soundVolume).toBe(0.12); });
  it("does not play when disabled", () => { const audio = vi.fn(); vi.stubGlobal("Audio", audio); configureInterfaceSounds({ soundsEnabled: false, soundVolume: 0.12, reducedMotion: false }); playInterfaceSound("success"); expect(audio).not.toHaveBeenCalled(); });
  it("uses only bundled sounds, debounces, and tolerates playback failure", async () => {
    const play = vi.fn().mockRejectedValue(new Error("Audio unavailable")); const audio = vi.fn(function (_url: string) { return { play, pause: vi.fn(), volume: 0, onended: null }; }); vi.stubGlobal("Audio", audio); configureInterfaceSounds({ soundsEnabled: true, soundVolume: 0.12, reducedMotion: false });
    expect(() => { playInterfaceSound("success"); playInterfaceSound("error"); }).not.toThrow(); await Promise.resolve(); expect(audio).toHaveBeenCalledOnce(); expect(audio.mock.calls[0]?.[0]).toMatch(/success\.wav/);
  });
});
