import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; helperText?: string; error?: string; textareaClassName?: string; }

export function Textarea({ id, label, helperText, error, textareaClassName = "", className = "", required, disabled, readOnly, ...props }: TextareaProps) {
  const generatedId = useId(); const controlId = id ?? (label ? `ui-textarea-${generatedId}` : undefined); const descriptionId = controlId && (error || helperText) ? `${controlId}-description` : undefined;
  return <div className={`ui-field ${className}`.trim()}>{label ? <label className="ui-field-label" htmlFor={controlId} data-required={required || undefined}>{label}</label> : null}<textarea id={controlId} className={`ui-textarea ${error ? "ui-input-error" : ""} ${textareaClassName}`.trim()} aria-invalid={Boolean(error)} aria-describedby={descriptionId} required={required} disabled={disabled} readOnly={readOnly} {...props} />{error ? <small id={descriptionId} className="ui-field-error">{error}</small> : helperText ? <small id={descriptionId} className="ui-field-helper">{helperText}</small> : null}</div>;
}
