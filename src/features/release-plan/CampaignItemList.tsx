import type { CampaignItem } from "../../../electron/shared/contracts";
import { SurfacePanel } from "../../ui/SurfacePanel";
import { CampaignItemCard } from "./CampaignItemCard";

type CampaignItemListProps = { items: CampaignItem[]; mutable: boolean; onEdit: (item: CampaignItem) => void; onDelete: (id: string) => void; onReorder: (itemIds: string[]) => void; };

export function CampaignItemList({ items, mutable, onEdit, onDelete, onReorder }: CampaignItemListProps) {
  function handleMoveUp(index: number) { if (index === 0) return; const ids = items.map((item) => item.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; onReorder(ids); }
  function handleMoveDown(index: number) { if (index >= items.length - 1) return; const ids = items.map((item) => item.id); [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]; onReorder(ids); }

  if (items.length === 0) return <SurfacePanel className="rp-items-empty"><span className="eyebrow">Campaign</span><p>No campaign items in this plan.</p></SurfacePanel>;

  return <section className="rp-campaign-section" aria-label="Campaign items"><header className="rp-section-header"><div><span className="eyebrow">Campaign sequence</span><h3>Planned content</h3></div><span className="rp-section-count">{items.length} items</span></header><div className="rp-item-list">{items.map((item, index) => <CampaignItemCard key={item.id} item={item} index={index} mutable={mutable} canMoveUp={mutable && index > 0} canMoveDown={mutable && index < items.length - 1} onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} onMoveUp={() => handleMoveUp(index)} onMoveDown={() => handleMoveDown(index)} />)}</div></section>;
}