export type StatusBadgeTone = "neutral" | "cyan" | "purple" | "success" | "warning" | "danger";
export type StatusBadgeState = "default" | "active";

interface StatusBadgeProps {
  label?: string;
  children?: string;
  tone?: StatusBadgeTone;
  state?: StatusBadgeState;
  className?: string;
}

export function StatusBadge({ label, children, tone = "neutral", state = "default", className = "" }: StatusBadgeProps) {
  return <span className={`ui-status-badge ui-status-badge-${tone} ${className}`.trim()} data-state={state}>{label ?? children}</span>;
}
