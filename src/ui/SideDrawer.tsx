import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export function SideDrawer({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} className="release-side-drawer" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right) onClose(); } }}>
    <header><h2 id={titleId}>{title}</h2><Button variant="icon" aria-label="Close panel" onClick={onClose}>×</Button></header>
    <div className="release-drawer-content">{children}</div>{footer && <footer>{footer}</footer>}
  </dialog>;
}
