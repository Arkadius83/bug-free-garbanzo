import type { HTMLAttributes, ReactNode } from "react";
import { SurfacePanel } from "./SurfacePanel";
import type { SurfacePanelState, SurfacePanelVariant } from "./SurfacePanel";

export interface SectionCardProps extends Omit<HTMLAttributes<HTMLElement>, "children" | "title"> {
  eyebrow?: string;
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  variant?: SurfacePanelVariant;
  state?: SurfacePanelState;
  children?: ReactNode;
}

export function SectionCard({ eyebrow, title, meta, actions, variant = "standard", state = "default", className = "", children, ...props }: SectionCardProps) {
  return (
    <SurfacePanel variant={variant} state={state} className={`v4-card ${className}`.trim()} {...props}>
      {title ? (
        <div className="v4-card-header">
          <div className="v4-card-heading">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          {meta ? <div className="v4-card-meta">{meta}</div> : null}
          {actions ? <div className="v4-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </SurfacePanel>
  );
}
