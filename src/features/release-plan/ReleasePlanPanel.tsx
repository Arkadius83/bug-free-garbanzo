import { useCallback, useEffect, useState } from "react";
import type { ApprovalRecord, CampaignItem, CampaignItemContentType, CampaignChannel, ContentLanguage, PromoGeneration, ReleasePlan, ReleasePlanStatus, ReleaseSummary } from "../../../electron/shared/contracts";
import { CampaignItemList } from "./CampaignItemList";
import { CampaignItemEditor } from "./CampaignItemEditor";
import { ReleasePlanRevisionHistory } from "./ReleasePlanRevisionHistory";
import { ReleasePlanApprovalHistory } from "./ReleasePlanApprovalHistory";
import { PromoContentReview } from "./PromoContentReview";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { StatusBadge, type StatusBadgeTone } from "../../ui/StatusBadge";
import { SurfacePanel } from "../../ui/SurfacePanel";
import { Tabs } from "../../ui/Tabs";
import { Toolbar } from "../../ui/Toolbar";

type ReleasePlanPanelProps = {
  release: ReleaseSummary;
};

type EditingItem = { mode: "add" } | { mode: "edit"; item: CampaignItem };

function planTone(status: ReleasePlanStatus): StatusBadgeTone { return status === "APPROVED" ? "success" : status === "REVIEWED" ? "warning" : status === "COMPLETED" ? "purple" : status === "FAILED" || status === "CANCELLED" ? "danger" : "neutral"; }

export function ReleasePlanPanel({ release }: ReleasePlanPanelProps) {
  const [plan, setPlan] = useState<ReleasePlan | null>(null);
  const [allPlans, setAllPlans] = useState<ReleasePlan[]>([]);
  const [approvalRecords, setApprovalRecords] = useState<ApprovalRecord[]>([]);
  const [promoGenerations, setPromoGenerations] = useState<PromoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EditingItem | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoResult, setPromoResult] = useState<{ generated: number; failed: number; skipped: number } | null>(null);

  const loadPlan = useCallback(async () => {
    if (!window.studio) return;
    setLoading(true);
    setError("");
    try {
      const [current, plans] = await Promise.all([
        window.studio.getCurrentReleasePlan(release.id),
        window.studio.listReleasePlans(release.id)
      ]);
      setPlan(current);
      setAllPlans(plans);
      if (current) {
        const [records, promos] = await Promise.all([
          window.studio.listApprovalRecords("release_plan", current.id),
          window.studio.listPromoGenerations(current.id)
        ]);
        setApprovalRecords(records);
        setPromoGenerations(promos);
      } else {
        setApprovalRecords([]);
        setPromoGenerations([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Release Plan");
    } finally {
      setLoading(false);
    }
  }, [release.id]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  async function handleGenerate() {
    if (!window.studio) return;
    setBusy(true); setError("");
    try {
      const generated = await window.studio.generateReleasePlan({ releaseId: release.id, actor: "local-user" });
      setPlan(generated);
      setAllPlans((prev) => [generated, ...prev]);
      const records = await window.studio.listApprovalRecords("release_plan", generated.id);
      setApprovalRecords(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally { setBusy(false); }
  }

  async function handleRegenerate() {
    if (!window.studio || !plan) return;
    setBusy(true); setError("");
    try {
      const regenerated = await window.studio.regenerateReleasePlan({ releaseId: release.id, actor: "local-user", reason: "User requested regeneration" });
      setPlan(regenerated);
      setAllPlans((prev) => [regenerated, ...prev]);
      const records = await window.studio.listApprovalRecords("release_plan", regenerated.id);
      setApprovalRecords(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed");
    } finally { setBusy(false); }
  }

  async function handleStatusChange(status: ReleasePlanStatus) {
    if (!window.studio || !plan) return;
    setBusy(true); setError("");
    try {
      const updated = await window.studio.changeReleasePlanStatus({ id: plan.id, status, actor: "local-user" });
      setPlan(updated);
      const records = await window.studio.listApprovalRecords("release_plan", plan.id);
      setApprovalRecords(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not change status to ${status}`);
    } finally { setBusy(false); }
  }

  async function handleApprove() {
    if (!window.studio || !plan) return;
    setBusy(true); setError("");
    try {
      const approved = await window.studio.approveReleasePlan({ id: plan.id, actor: "local-user", reason: "Approved from Release Plan UI" });
      setPlan(approved);
      const records = await window.studio.listApprovalRecords("release_plan", plan.id);
      setApprovalRecords(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally { setBusy(false); }
  }

  async function handleGeneratePromo() {
    if (!window.studio || !plan) return;
    setPromoBusy(true); setPromoResult(null); setError("");
    try {
      const result = await window.studio.generatePromoContent({
        releasePlanId: plan.id,
        model: "qwen3.5:9b",
        language: "en" as ContentLanguage
      });
      setPromoResult({ generated: result.generated, failed: result.failed, skipped: result.skipped });
      const promos = await window.studio.listPromoGenerations(plan.id);
      setPromoGenerations(promos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promo generation failed");
    } finally { setPromoBusy(false); }
  }

  async function handleAddItem(data: { title: string; purpose: string; contentType: CampaignItemContentType; targetPlatforms: CampaignChannel[]; plannedDate?: string | null; plannedTime?: string | null; cta?: string; notes?: string; assetRequirements?: string[]; copyRequirements?: string[] }) {
    if (!window.studio || !plan) return;
    setBusy(true); setError("");
    try {
      const item = await window.studio.createCampaignItem({ releasePlanId: plan.id, ...data });
      setPlan((prev) => prev ? { ...prev, campaignItems: [...prev.campaignItems, item] } : prev);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add item");
    } finally { setBusy(false); }
  }

  async function handleUpdateItem(id: string, data: Partial<{ title: string; purpose: string; contentType: CampaignItemContentType; targetPlatforms: CampaignChannel[]; plannedDate: string | null; plannedTime: string | null; cta: string; notes: string; assetRequirements: string[]; copyRequirements: string[] }>) {
    if (!window.studio || !plan) return;
    setBusy(true); setError("");
    try {
      const updated = await window.studio.updateCampaignItem({ id, ...data });
      setPlan((prev) => prev ? { ...prev, campaignItems: prev.campaignItems.map((i) => i.id === id ? updated : i) } : prev);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update item");
    } finally { setBusy(false); }
  }

  async function handleDeleteItem(id: string) {
    if (!window.studio || !plan) return;
    setBusy(true); setError("");
    try {
      await window.studio.deleteCampaignItem(id);
      setPlan((prev) => prev ? { ...prev, campaignItems: prev.campaignItems.filter((i) => i.id !== id) } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete item");
    } finally { setBusy(false); }
  }

  async function handleReorder(itemIds: string[]) {
    if (!window.studio || !plan) return;
    setBusy(true); setError("");
    try {
      const reordered = await window.studio.reorderCampaignItems({ releasePlanId: plan.id, itemIds });
      setPlan((prev) => prev ? { ...prev, campaignItems: reordered } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder items");
    } finally { setBusy(false); }
  }

  const isMutable = plan?.status === "DRAFT" || plan?.status === "REVIEWED";
  const isHistorical = plan ? allPlans.length > 0 && allPlans[0]?.id !== plan.id : false;

  if (loading) return <div className="rp-loading">Loading Release Plan...</div>;

  if (!plan) return <SurfacePanel variant="standard" className="v4-card rp-empty"><span className="rp-empty-icon">◎</span><strong>No Release Plan yet</strong><p>Generate an AI-powered Release Plan for "{release.title}".</p><Button disabled={busy} onClick={() => void handleGenerate()}>{busy ? "Generating..." : "Generate Release Plan"}</Button>{error ? <p className="rp-error">{error}</p> : null}</SurfacePanel>;

  return <SurfacePanel as="div" variant={isHistorical ? "selected" : "highlight"} state={isHistorical ? "disabled" : "default"} className={`v4-card rp-panel ${isHistorical ? "rp-historical" : ""}`}>
    <div className="v4-card-header rp-header"><div className="rp-header-left"><span className="eyebrow">Release Plan</span><h2>{plan.title}</h2><p className="rp-summary">{plan.summary}</p></div><div className="rp-header-right"><div className="rp-meta"><StatusBadge label={plan.status} tone={planTone(plan.status)} state={plan.status === "APPROVED" ? "active" : "default"} /><span className="rp-revision">Rev. {plan.revisionNumber}</span><span className="rp-date">{new Date(plan.createdAt).toLocaleDateString()}</span><span className="rp-items-count">{plan.campaignItems.length} items</span></div><Toolbar align="end" className="rp-actions">{plan.status === "DRAFT" ? <><Button variant="secondary" disabled={busy} onClick={() => setEditing({ mode: "add" })}>+ Add item</Button><Button variant="ghost" disabled={busy} onClick={() => void handleRegenerate()}>Regenerate</Button><Button disabled={busy} onClick={() => void handleStatusChange("REVIEWED")}>Mark as Reviewed</Button></> : null}{plan.status === "REVIEWED" ? <><Button disabled={busy} onClick={() => void handleApprove()}>Approve Release Plan</Button><Button variant="ghost" disabled={busy} onClick={() => void handleStatusChange("DRAFT")}>Return to Draft</Button><Button variant="ghost" disabled={busy} onClick={() => void handleRegenerate()}>Regenerate</Button></> : null}{plan.status === "APPROVED" ? <><span className="rp-locked">Approved revision – locked</span><Button disabled={promoBusy} onClick={() => void handleGeneratePromo()}>{promoBusy ? "Generating promo content..." : "Generate Promo Content"}</Button><Button variant="secondary" disabled={busy} onClick={() => void handleRegenerate()}>Regenerate as New Revision</Button></> : null}{!["DRAFT", "REVIEWED", "APPROVED"].includes(plan.status) ? <span className="rp-locked">Plan is {plan.status.toLowerCase()} – read only</span> : null}{allPlans.length > 1 ? <Button variant="ghost" onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Hide history" : "Revision history"}</Button> : null}</Toolbar></div></div>
    {allPlans.length > 1 ? <Tabs ariaLabel="Release plan sections" activeTab={showHistory ? "history" : "plan"} onChange={(tab) => setShowHistory(tab === "history")} tabs={[{ id: "plan", label: "Plan" }, { id: "history", label: "History" }]} /> : null}
    {error ? <p className="rp-error">{error}</p> : null}
    {promoResult ? <SurfacePanel variant="standard" className="rp-promo-result"><span className="eyebrow">Promo Generation Result</span><div className="rp-promo-summary"><StatusBadge label={`${promoResult.generated} generated`} tone="success" /><StatusBadge label={`${promoResult.failed} failed`} tone="danger" /><StatusBadge label={`${promoResult.skipped} skipped`} /></div></SurfacePanel> : null}
    {promoGenerations.length > 0 ? <PromoContentReview generations={promoGenerations} campaignItems={plan.campaignItems} busy={busy} onRefresh={async () => { if (!window.studio) return; setPromoGenerations(await window.studio.listPromoGenerations(plan.id)); }} onError={setError} /> : null}
    {editing ? <Modal open title={editing.mode === "edit" ? "Edit Campaign Item" : "Add to Release Plan"} description="Campaign items remain editable only in mutable plan revisions." onClose={() => setEditing(null)}><CampaignItemEditor item={editing.mode === "edit" ? editing.item : undefined} onSave={editing.mode === "add" ? handleAddItem : (data) => handleUpdateItem(editing.mode === "edit" ? editing.item.id : "", data)} onCancel={() => setEditing(null)} busy={busy} /></Modal> : null}
    {!showHistory ? <CampaignItemList items={plan.campaignItems} mutable={isMutable && !isHistorical} onEdit={(item) => setEditing({ mode: "edit", item })} onDelete={handleDeleteItem} onReorder={handleReorder} /> : <div className="rp-history-section"><ReleasePlanRevisionHistory plans={allPlans} currentPlanId={plan.id} onSelect={(selectedPlan) => { setPlan(selectedPlan); setShowHistory(false); }} /><ReleasePlanApprovalHistory records={approvalRecords} /></div>}
  </SurfacePanel>;
}