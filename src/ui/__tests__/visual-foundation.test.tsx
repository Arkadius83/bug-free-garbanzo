import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Button } from "../Button";
import { DataTableRow, DataTableShell } from "../DataTableShell";
import { Input } from "../Input";
import { MediaSurface } from "../MediaSurface";
import { Modal } from "../Modal";
import { Select } from "../Select";
import { StatusBadge } from "../StatusBadge";
import { SurfacePanel } from "../SurfacePanel";
import { Tabs } from "../Tabs";
import { Textarea } from "../Textarea";
import { Toggle } from "../Toggle";

describe("V3 visual foundation", () => {
  it("renders dynamic button labels across default and active states", () => {
    render(<><Button variant="primary">Create release</Button><Button variant="secondary" state="active">Review plan</Button></>);
    expect(screen.getByRole("button", { name: "Create release" })).toHaveAttribute("data-state", "default");
    expect(screen.getByRole("button", { name: "Review plan" })).toHaveAttribute("data-state", "active");
  });

  it("supports disabled controls without embedding content in a shell", () => {
    render(<Button disabled>Schedule content</Button>);
    expect(screen.getByRole("button", { name: "Schedule content" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Schedule content" })).toHaveAttribute("data-state", "disabled");
  });

  it("renders status and panel content through supplied props and children", () => {
    render(<SurfacePanel variant="highlight" state="active"><StatusBadge label="Approved" tone="success" state="active" /><strong>Dynamic panel content</strong></SurfacePanel>);
    expect(screen.getByText("Approved")).toHaveClass("ui-status-badge-success");
    expect(screen.getByText("Dynamic panel content").parentElement).toHaveAttribute("data-state", "active");
  });

  it("keeps input and textarea native while exposing helper and error state", () => {
    render(<><Input id="title" label="Title" required helperText="Visible to your team" value="Release" readOnly /><Textarea id="story" label="Story" error="Story is required" defaultValue="Draft" /></>);
    expect(screen.getByLabelText("Title")).toHaveValue("Release");
    expect(screen.getByLabelText("Title")).toHaveAttribute("readonly");
    expect(screen.getByText("Visible to your team")).toBeInTheDocument();
    expect(screen.getByLabelText("Story")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Story is required")).toBeInTheDocument();
  });

  it("supports controlled select changes and disabled options", () => {
    function SelectHarness() { const [value, setValue] = useState("instagram"); return <Select label="Platform" value={value} onChange={(event) => setValue(event.target.value)} options={[{ value: "instagram", label: "Instagram" }, { value: "youtube", label: "YouTube", disabled: true }]} />; }
    render(<SelectHarness />);
    const select = screen.getByLabelText("Platform");
    expect(select).toHaveValue("instagram");
    fireEvent.change(select, { target: { value: "youtube" } });
    expect(select).toHaveValue("youtube");
    expect(screen.getByRole("option", { name: "YouTube" })).toBeDisabled();
  });

  it("changes controlled tabs and respects disabled tabs", () => {
    const onChange = vi.fn();
    render(<Tabs ariaLabel="Views" activeTab="week" onChange={onChange} tabs={[{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "list", label: "List", disabled: true }]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));
    fireEvent.click(screen.getByRole("tab", { name: "List" }));
    expect(onChange).toHaveBeenCalledWith("month");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
  });

  it("uses a controlled, accessible native toggle", () => {
    function ToggleHarness() { const [checked, setChecked] = useState(false); return <Toggle label="Enable notifications" checked={checked} onChange={setChecked} />; }
    render(<ToggleHarness />);
    const toggle = screen.getByRole("switch", { name: "Enable notifications" });
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("opens, closes, and handles Escape in the modal", () => {
    const onClose = vi.fn();
    render(<Modal open title="Review release" description="Confirm this change" footer={<Button>Approve</Button>} onClose={onClose}>Dynamic modal content</Modal>);
    expect(screen.getByRole("dialog", { name: "Review release" })).toBeInTheDocument();
    expect(screen.getByText("Dynamic modal content")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders media and data shells with selected and empty states", () => {
    render(<><MediaSurface selected emptyLabel="Artwork pending" /><DataTableShell ariaLabel="Queue" columns={["Platform", "Status"]}><DataTableRow selected><td>Instagram</td><td>Draft</td></DataTableRow></DataTableShell><DataTableShell ariaLabel="Empty queue" columns={["Platform"]} /></>);
    expect(screen.getByText("Artwork pending").parentElement).toHaveAttribute("data-state", "selected");
    expect(screen.getByRole("row", { name: "Instagram Draft" })).toHaveAttribute("data-state", "selected");
    expect(screen.getByText("No rows to show.")).toBeInTheDocument();
  });
});
