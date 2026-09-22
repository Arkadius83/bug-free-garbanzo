import type { CampaignPackItemDependencyStatus } from "../../../electron/shared/contracts";

export interface PackItemDeleteControlsProps {
  dependencyStatus: CampaignPackItemDependencyStatus | null;
  busy?: boolean;
  onDelete: () => void;
}

export function lockLabelFor(status: CampaignPackItemDependencyStatus | null): string | null {
  if (!status) return null;
  if (status.dependencies.publishingQueue > 0) return "Locked: publishing queue";
  if (status.dependencies.mediaGenerations > 0) return "Locked: media generation";
  if (status.deleteMode === "detach-promo") return "Linked to approved promo";
  return null;
}

export function deleteTitleFor(status: CampaignPackItemDependencyStatus | null): string {
  if (!status) return "Delete";
  if (status.dependencies.publishingQueue > 0) return "Cannot delete: referenced by the Publishing Queue; remove the queue record first";
  if (status.dependencies.mediaGenerations > 0) return "Cannot delete: referenced by a media generation; clean or remove the media generation first";
  if (status.deleteMode === "detach-promo") return "Delete: promo content stays unchanged; only the source reference is detached";
  return "Delete";
}

export function PackItemDeleteControls({ dependencyStatus, busy, onDelete }: PackItemDeleteControlsProps) {
  const locked = Boolean(dependencyStatus && !dependencyStatus.canDelete);
  const label = lockLabelFor(dependencyStatus);
  return (
    <>
      {label ? <span className="pack-lock-label" role="status">{label}</span> : null}
      <button
        className="danger-button"
        title={deleteTitleFor(dependencyStatus)}
        disabled={locked || busy}
        onClick={onDelete}
      >
        Delete
      </button>
    </>
  );
}
