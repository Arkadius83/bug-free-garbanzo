import type { ReactNode } from "react";

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, lead, actions, children, className = "" }: PageHeaderProps) {
  return (
    <header className={`v4-page-header ${className}`.trim()}>
      <div className="v4-page-header-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {lead ? <p className="v4-page-lead">{lead}</p> : null}
      </div>
      {actions ? <div className="v4-page-actions">{actions}</div> : null}
      {children ? <div className="v4-page-header-children">{children}</div> : null}
    </header>
  );
}
