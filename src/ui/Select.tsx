import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";

export interface SelectOption { value: string; label: string; disabled?: boolean; }
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; helperText?: string; error?: string; options?: SelectOption[]; children?: ReactNode; }

export function Select({ id, label, helperText, error, options, children, className = "", required, disabled, ...props }: SelectProps) {
  const generatedId = useId(); const controlId = id ?? (label ? `ui-select-${generatedId}` : undefined); const descriptionId = controlId && (error || helperText) ? `${controlId}-description` : undefined;
  return <div className={`ui-field ${className}`.trim()}>{label ? <label className="ui-field-label" htmlFor={controlId} data-required={required || undefined}>{label}</label> : null}<select id={controlId} className={`ui-select ${error ? "ui-input-error" : ""}`} aria-invalid={Boolean(error)} aria-describedby={descriptionId} required={required} disabled={disabled} {...props}>{options?.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}{children}</select>{error ? <small id={descriptionId} className="ui-field-error">{error}</small> : helperText ? <small id={descriptionId} className="ui-field-helper">{helperText}</small> : null}</div>;
}
