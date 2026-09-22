import type { ElementType, HTMLAttributes, ReactNode } from "react";

export type SurfacePanelVariant = "standard" | "highlight" | "selected" | "kpi-cyan" | "kpi-purple";
export type SurfacePanelState = "default" | "active" | "selected" | "disabled";

interface SurfacePanelProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: SurfacePanelVariant;
  state?: SurfacePanelState;
  children: ReactNode;
}

export function SurfacePanel({ as: Tag = "section", variant = "standard", state = "default", className = "", children, ...props }: SurfacePanelProps) {
  return <Tag className={`ui-surface ui-surface-${variant} ${className}`.trim()} data-state={state} {...props}>{children}</Tag>;
}
