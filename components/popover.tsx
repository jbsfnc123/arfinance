"use client";

import { useEffect, useRef } from "react";
import { useDialog } from "@/components/use-dialog";

// Panel mengambang (kaca menengah, turun dari Top bar) yang menutup saat klik di luar / Esc. Posisi diatur pemanggil
// lewat className. Elemen pemicu diberi atribut data-popover-anchor agar kliknya tidak langsung menutup panel.
// Non-modal: tanpa kurungan fokus, tetapi ikut tumpukan overlay (Escape menutup yang teratas) & fokus kembali ke pemicu.
export function Popover({ open, onClose, children, className = "", label }: {
  open: boolean; onClose: () => void; children: React.ReactNode; className?: string; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, ref, { modal: false });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-popover-anchor]")) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label={label} className={`glass drop-in absolute z-(--z-popover) rounded-[16px] ${className}`}>
      {children}
    </div>
  );
}
