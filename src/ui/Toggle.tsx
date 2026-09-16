import type { ChangeEvent } from "react";

interface ToggleProps { checked: boolean; onChange: (checked: boolean) => void; label?: string; disabled?: boolean; id?: string; className?: string; }

export function Toggle({ checked, onChange, label, disabled = false, id, className = "" }: ToggleProps) {
  return <label className={`ui-toggle ${className}`.trim()} data-state={checked ? "active" : "default"} data-disabled={disabled || undefined}><input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)} /><span aria-hidden="true" className="ui-toggle-track"><i /></span>{label ? <span className="ui-toggle-label">{label}</span> : null}</label>;
}
