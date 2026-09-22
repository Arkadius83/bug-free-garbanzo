import type { ApprovalRecord } from "../../../electron/shared/contracts";
import { DataTableRow, DataTableShell } from "../../ui/DataTableShell";
import { StatusBadge, type StatusBadgeTone } from "../../ui/StatusBadge";

type ReleasePlanApprovalHistoryProps = { records: ApprovalRecord[]; };
function actionLabel(action: ApprovalRecord["action"]): string { return ({ SUBMITTED: "Submitted", APPROVED: "Approved", REJECTED: "Rejected", REVISION_REQUESTED: "Revision requested" } as Record<string, string>)[action] ?? action; }
function actionTone(action: ApprovalRecord["action"]): StatusBadgeTone { return action === "APPROVED" ? "success" : action === "REJECTED" ? "danger" : action === "REVISION_REQUESTED" ? "warning" : "neutral"; }

export function ReleasePlanApprovalHistory({ records }: ReleasePlanApprovalHistoryProps) {
  if (records.length === 0) return null;
  return <section className="rp-approval-history"><span className="eyebrow">Approval History</span><h3>{records.length} record{records.length === 1 ? "" : "s"}</h3><DataTableShell ariaLabel="Release Plan approval history" columns={["Action", "Actor", "Transition", "Reason", "Date"]}>{records.map((record) => <DataTableRow key={record.id} selected={record.action === "APPROVED"}><td><StatusBadge label={actionLabel(record.action)} tone={actionTone(record.action)} /></td><td>{record.actor}</td><td>{record.previousStatus && record.newStatus ? `${record.previousStatus} → ${record.newStatus}` : "-"}</td><td>{record.reason ?? "-"}</td><td>{new Date(record.createdAt).toLocaleString()}</td></DataTableRow>)}</DataTableShell></section>;
}
