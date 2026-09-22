import { useId } from "react";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> { label?: string; helperText?: string; error?: string; inputClassName?: string; }

export function Input({ id, label, helperText, error, inputClassName = "", className = "", required, disabled, readOnly, ...props }: InputProps) {
  const generatedId = useId(); const controlId = id ?? (label ? `ui-input-${generatedId}` : undefined); const descriptionId = controlId && (error || helperText) ? `${controlId}-description` : undefined;
  return <div className={`ui-field ${className}`.trim()}>{label ? <label className="ui-field-label" htmlFor={controlId} data-required={required || undefined}>{label}</label> : null}<input id={controlId} className={`ui-input ${error ? "ui-input-error" : ""} ${inputClassName}`.trim()} aria-invalid={Boolean(error)} aria-describedby={descriptionId} required={required} disabled={disabled} readOnly={readOnly} {...props} />{error ? <small id={descriptionId} className="ui-field-error">{error}</small> : helperText ? <small id={descriptionId} className="ui-field-helper">{helperText}</small> : null}</div>;
}
