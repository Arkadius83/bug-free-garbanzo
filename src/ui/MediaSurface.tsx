import type { ReactNode } from "react";

export type MediaSurfaceAspect = "square" | "portrait" | "landscape";
interface MediaSurfaceProps { aspect?: MediaSurfaceAspect; selected?: boolean; highlight?: boolean; emptyLabel?: string; children?: ReactNode; className?: string; }

export function MediaSurface({ aspect = "square", selected = false, highlight = false, emptyLabel = "No media", children, className = "" }: MediaSurfaceProps) {
  return <div className={`ui-media-surface ui-media-${aspect} ${selected ? "ui-media-selected" : ""} ${highlight ? "ui-media-highlight" : ""} ${className}`.trim()} data-state={selected ? "selected" : highlight ? "active" : "default"}>{children ?? <span className="ui-media-empty">{emptyLabel}</span>}</div>;
}
