import type { ReleasePlan } from "../../../electron/shared/contracts";
import { Button } from "../../ui/Button";
import { StatusBadge, type StatusBadgeTone } from "../../ui/StatusBadge";
import { SurfacePanel } from "../../ui/SurfacePanel";

type ReleasePlanRevisionHistoryProps = { plans: ReleasePlan[]; currentPlanId: string; onSelect: (plan: ReleasePlan) => void; };
function tone(status: ReleasePlan["status"]): StatusBadgeTone { return status === "APPROVED" ? "success" : status === "REVIEWED" ? "warning" : status === "COMPLETED" ? "purple" : status === "FAILED" || status === "CANCELLED" ? "danger" : "neutral"; }

export function ReleasePlanRevisionHistory({ plans, currentPlanId, onSelect }: ReleasePlanRevisionHistoryProps) {
  if (plans.length <= 1) return null;
  return <SurfacePanel variant="standard" className="rp-revision-history"><span className="eyebrow">Revision History</span><h3>{plans.length} revisions</h3><div className="rp-revision-list">{plans.map((plan) => <SurfacePanel as="article" key={plan.id} variant={plan.id === currentPlanId ? "selected" : "standard"} state={plan.id === currentPlanId ? "selected" : "default"} className="rp-revision-item"><div className="rp-revision-head"><StatusBadge label={plan.status} tone={tone(plan.status)} /><strong>Rev. {plan.revisionNumber}</strong>{plan.id === currentPlanId ? <StatusBadge label="CURRENT" tone="success" /> : null}<Button variant="ghost" disabled={plan.id === currentPlanId} onClick={() => onSelect(plan)}>Open</Button></div><p>{plan.title}</p><div className="rp-revision-meta"><span>{plan.campaignItems.length} items</span><span>{new Date(plan.createdAt).toLocaleDateString()}</span>{plan.createdBy ? <span>by {plan.createdBy}</span> : null}</div></SurfacePanel>)}</div></SurfacePanel>;
}
