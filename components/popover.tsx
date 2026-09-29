"use client";

import { useEffect, useRef } from "react";

// Panel mengambang (kaca menengah, turun dari Top bar) yang menutup saat klik di luar / Esc. Posisi diatur pemanggil
// lewat className. Elemen pemicu diberi atribut data-popover-anchor agar kliknya tidak langsung menutup panel.
export function Popover({ open, onClose, children, className = "", label }: {
  open: boolean; onClose: () => void; children: React.ReactNode; className?: string; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-popover-anchor]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label={label} className={`glass drop-in absolute z-50 rounded-[16px] ${className}`}>
      {children}
    </div>
  );
}
