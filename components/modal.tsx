"use client";

import { useEffect } from "react";

export function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col rounded-2xl border border-line bg-surface ${props.wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <h2 className="font-medium">{props.title}</h2>
          <button type="button" onClick={onClose} className="ml-auto text-fg-2 hover:text-fg" aria-label="Tutup">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{props.children}</div>
        {props.footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{props.footer}</div>}
      </div>
    </div>
  );
}
