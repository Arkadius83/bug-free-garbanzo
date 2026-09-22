export interface TabDefinition { id: string; label: string; disabled?: boolean; }
interface TabsProps { tabs: TabDefinition[]; activeTab: string; onChange: (id: string) => void; ariaLabel: string; className?: string; }

export function Tabs({ tabs, activeTab, onChange, ariaLabel, className = "" }: TabsProps) {
  return <div className={`ui-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeTab} aria-controls={`${tab.id}-panel`} data-state={tab.id === activeTab ? "active" : "default"} disabled={tab.disabled} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</div>;
}
