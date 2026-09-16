import { Button } from "../../ui/Button";
import { SurfacePanel } from "../../ui/SurfacePanel";

interface QuickActionsPanelProps { onCreateRelease: () => void; onOpenRelease: () => void; onOpenCalendar: () => void; }

function ActionTile({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return <Button variant="ghost" className="quick-action-tile" onClick={onClick}><span className="quick-action-icon" aria-hidden="true">{icon}</span><span className="quick-action-copy"><strong>{title}</strong><small>{subtitle}</small></span><b aria-hidden="true">&gt;</b></Button>;
}

export function QuickActionsPanel({ onCreateRelease, onOpenRelease, onOpenCalendar }: QuickActionsPanelProps) {
  return <SurfacePanel variant="highlight" className="dashboard-panel quick-actions-panel"><div className="dashboard-panel-heading"><span className="dashboard-eyebrow">Quick actions</span></div><div className="quick-actions-list">
    <ActionTile icon="+" title="New release" subtitle="Create a release workspace" onClick={onCreateRelease} />
    <ActionTile icon="R" title="Open releases" subtitle="Manage release details" onClick={onOpenRelease} />
    <ActionTile icon="C" title="Content calendar" subtitle="Review scheduled content" onClick={onOpenCalendar} />
  </div></SurfacePanel>;
}
