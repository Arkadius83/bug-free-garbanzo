import { useState } from "react";
import type { CampaignChannel, CampaignItem, ContentLanguage, PromoGeneration, PromoReviewStatus } from "../../../electron/shared/contracts";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { MediaSurface } from "../../ui/MediaSurface";
import { Modal } from "../../ui/Modal";
import { Select } from "../../ui/Select";
import { StatusBadge, type StatusBadgeTone } from "../../ui/StatusBadge";
import { SurfacePanel } from "../../ui/SurfacePanel";
import { Textarea } from "../../ui/Textarea";

type PromoContentReviewProps = { generations: PromoGeneration[]; campaignItems: CampaignItem[]; busy: boolean; onRefresh: () => Promise<void>; onError: (message: string) => void; };
type EditingState = { promoGenerationId: string; content: string; };

function reviewTone(status: PromoReviewStatus): StatusBadgeTone {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "REVIEW_REQUIRED") return "warning";
  return status === "EDITED" ? "cyan" : "neutral";
}

function generationTone(status: PromoGeneration["status"]): StatusBadgeTone {
  return status === "SUCCESS" ? "success" : status === "FAILED" ? "danger" : "warning";
}

function isVisualContent(contentType: PromoGeneration["contentType"]): boolean {
  return contentType === "image-prompt" || contentType === "visualizer-prompt" || contentType === "video-hook" || contentType === "video-script";
}

export function PromoContentReview({ generations, campaignItems, busy, onRefresh, onError }: PromoContentReviewProps) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { platform: CampaignChannel; scheduledAt: string }>>({});
  const [scheduleMessage, setScheduleMessage] = useState<Record<string, string>>({});

  const getCampaignItem = (campaignItemId: string) => campaignItems.find((item) => item.id === campaignItemId);
  const getDisplayContent = (generation: PromoGeneration) => generation.editedContent || generation.generatedContent || generation.error || "";
  const isReadOnly = (generation: PromoGeneration) => generation.reviewStatus === "APPROVED";

  async function handleSaveEdit() {
    if (!window.studio || !editing) return;
    setReviewBusy(true);
    try {
      await window.studio.editPromoContent({ promoGenerationId: editing.promoGenerationId, editedContent: editing.content });
      setEditing(null);
      await onRefresh();
    } catch (error) { onError(error instanceof Error ? error.message : "Could not save edit"); } finally { setReviewBusy(false); }
  }

  async function updateReview(generation: PromoGeneration, reviewStatus: PromoReviewStatus, reviewReason: string) {
    if (!window.studio) return;
    setReviewBusy(true);
    try {
      await window.studio.updatePromoReview({ promoGenerationId: generation.id, reviewStatus, reviewActor: "local-user", reviewReason });
      await onRefresh();
    } catch (error) { onError(error instanceof Error ? error.message : `Could not ${reviewStatus.toLowerCase()}`); } finally { setReviewBusy(false); }
  }

  async function handleSchedule(generation: PromoGeneration, item?: CampaignItem) {
    if (!window.studio) return;
    const draft = scheduleDrafts[generation.id];
    if (!draft?.scheduledAt) { setScheduleMessage((current) => ({ ...current, [generation.id]: "Choose a date and time first." })); return; }
    setReviewBusy(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      await window.studio.createScheduleEvent({ promoGenerationId: generation.id, platform: draft.platform ?? item?.targetPlatforms[0] ?? "Instagram", scheduledAt: new Date(draft.scheduledAt).toISOString(), timezone });
      setScheduleMessage((current) => ({ ...current, [generation.id]: "Added to Content Calendar." }));
      await onRefresh();
    } catch (error) { setScheduleMessage((current) => ({ ...current, [generation.id]: error instanceof Error ? error.message : "Could not schedule content" })); } finally { setReviewBusy(false); }
  }

  async function handleRetry(generation: PromoGeneration) {
    if (!window.studio) return;
    setReviewBusy(true);
    try {
      await window.studio.retryPromoGeneration({ promoGenerationId: generation.id, model: "qwen3.5:9b", language: "en" as ContentLanguage });
      await onRefresh();
    } catch (error) { onError(error instanceof Error ? error.message : "Could not retry generation"); } finally { setReviewBusy(false); }
  }

  const editingGeneration = editing ? generations.find((generation) => generation.id === editing.promoGenerationId) : undefined;

  return <section className="pcr-section" aria-label="Promo Content Review">
    <span className="eyebrow">Promo Content Review</span>
    {generations.length === 0 ? <SurfacePanel className="pcr-empty-panel"><p className="pcr-empty">No promo content generated yet.</p></SurfacePanel> : null}
    {generations.map((generation) => {
      const item = getCampaignItem(generation.campaignItemId);
      const readOnly = isReadOnly(generation);
      const isSkipped = generation.status === "SKIPPED";
      const isFailed = generation.status === "FAILED";
      const isEditing = editing?.promoGenerationId === generation.id;
      const surfaceState = isEditing ? "selected" : readOnly ? "selected" : generation.reviewStatus === "REVIEW_REQUIRED" || generation.reviewStatus === "EDITED" ? "active" : "default";
      const platforms = item?.targetPlatforms ?? ["Instagram" as CampaignChannel];

      return <SurfacePanel as="article" key={generation.id} variant={readOnly ? "selected" : "standard"} state={surfaceState} className={`pcr-item pcr-${generation.status.toLowerCase()} pcr-review-${generation.reviewStatus.toLowerCase()}`}>
        <div className="pcr-item-header">
          <div className="pcr-item-meta">
            {isVisualContent(generation.contentType) ? <MediaSurface aspect="square" className="pcr-media-preview" highlight={surfaceState === "active"} selected={surfaceState === "selected"} emptyLabel="Visual content" /> : null}
            <div><span className="pcr-item-title">{item?.title ?? "Generated content"}</span><span className="pcr-platforms">{platforms.join(", ")}</span></div>
          </div>
          <div className="pcr-item-badges"><StatusBadge label={generation.contentType} tone="cyan" /><StatusBadge label={generation.status} tone={generationTone(generation.status)} state={surfaceState === "active" ? "active" : "default"} /><StatusBadge label={generation.reviewStatus} tone={reviewTone(generation.reviewStatus)} state={surfaceState === "active" ? "active" : "default"} /></div>
        </div>
        {isSkipped && generation.error ? <p className="pcr-skip-reason">{generation.error}</p> : null}
        {isFailed && generation.error ? <p className="pcr-error">{generation.error}</p> : null}
        {!isSkipped && !isFailed ? <div className="pcr-content-area"><p className="pcr-content-text">{getDisplayContent(generation)}</p></div> : null}
        <div className="pcr-item-actions">
          {isFailed ? <Button variant="secondary" disabled={busy || reviewBusy} onClick={() => void handleRetry(generation)}>Retry</Button> : null}
          {!isSkipped && !isFailed && !readOnly && !isEditing ? <><Button variant="ghost" disabled={busy || reviewBusy} onClick={() => setEditing({ promoGenerationId: generation.id, content: getDisplayContent(generation) })}>Edit</Button><Button disabled={busy || reviewBusy} onClick={() => void updateReview(generation, "APPROVED", "Content approved")}>Approve</Button><Button variant="ghost" disabled={busy || reviewBusy} onClick={() => void updateReview(generation, "REJECTED", "Content rejected")}>Reject</Button></> : null}
          {readOnly ? <><div className="pcr-schedule-box"><Select aria-label="Schedule platform" value={scheduleDrafts[generation.id]?.platform ?? platforms[0]} options={platforms.map((platform) => ({ value: platform, label: platform }))} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [generation.id]: { platform: event.target.value as CampaignChannel, scheduledAt: current[generation.id]?.scheduledAt ?? "" } }))} /><Input aria-label="Schedule date and time" type="datetime-local" value={scheduleDrafts[generation.id]?.scheduledAt ?? ""} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [generation.id]: { platform: current[generation.id]?.platform ?? platforms[0], scheduledAt: event.target.value } }))} /><Button disabled={busy || reviewBusy} onClick={() => void handleSchedule(generation, item)}>Add to Calendar</Button></div>{scheduleMessage[generation.id] ? <p className="pcr-schedule-message">{scheduleMessage[generation.id]}</p> : null}<Button variant="ghost" disabled={busy || reviewBusy} onClick={() => void updateReview(generation, "REVIEW_REQUIRED", "Returned to review")}>Return to Review</Button></> : null}
        </div>
      </SurfacePanel>;
    })}
    <Modal open={Boolean(editing)} title="Edit Promo Content" description="Update the generated content before approval." onClose={() => setEditing(null)}>{editing ? <div className="pcr-edit-area"><Textarea label="Promo content" value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} rows={10} disabled={reviewBusy} /><div className="pcr-edit-actions"><Button variant="ghost" disabled={reviewBusy} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={reviewBusy} onClick={() => void handleSaveEdit()}>Save</Button></div></div> : null}</Modal>
  </section>;
}