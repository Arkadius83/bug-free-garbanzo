import type { ReactNode } from "react";

export interface ToolbarProps {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  ariaLabel?: string;
}

export function Toolbar({ children, align = "start", className = "", ariaLabel }: ToolbarProps) {
  return (
    <div className={`v4-toolbar ${align === "end" ? "v4-toolbar-end" : ""} ${className}`.trim()} role={ariaLabel ? "group" : undefined} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
