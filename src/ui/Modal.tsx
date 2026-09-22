import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";

interface ModalProps { open: boolean; title: string; description?: string; children: ReactNode; footer?: ReactNode; onClose: () => void; closeLabel?: string; }

export function Modal({ open, title, description, children, footer, onClose, closeLabel = "Close dialog" }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) return; const previous = document.activeElement as HTMLElement | null; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKeyDown); closeButtonRef.current?.focus(); return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); }; }, [open, onClose]);
  if (!open) return null;
  return <div className="ui-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="ui-modal-title"><header><div><h2 id="ui-modal-title">{title}</h2>{description ? <p>{description}</p> : null}</div><Button ref={closeButtonRef} variant="icon" aria-label={closeLabel} onClick={onClose}>x</Button></header><div className="ui-modal-content">{children}</div>{footer ? <footer>{footer}</footer> : null}</section></div>;
}
