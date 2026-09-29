"use client";

import { useRef } from "react";
import { Icon } from "@/components/icons";
import { useDialog } from "@/components/use-dialog";

// Modal bersama. variant "dialog" (bawaan) = header jelas + tombol × — untuk form & aksi keuangan.
// variant "window" = jendela utilitas ala macOS (pratinjau data, history pembayaran): bilah judul tipis, judul di
// tengah, satu tombol tutup berupa titik merah yang benar-benar menutup (tanpa minimize/maximize palsu).
export function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  xl?: boolean; // tabel lebar: hingga 96% layar
  variant?: "dialog" | "window";
}) {
  const { open, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  // Fokus terkurung, Escape hanya menutup overlay teratas, latar inert & tak ter-scroll, fokus kembali ke pemicu.
  useDialog(open, onClose, ref, { kind: "modal", layerRef });

  if (!open) return null;
  const win = props.variant === "window";
  return (
    <div ref={layerRef} className="fade-in fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/35 p-4 backdrop-blur-[4px]" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`glass-strong pop-in flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[20px] ${props.xl ? "max-w-[min(96vw,1600px)]" : props.wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        {win ? (
          <div className="relative flex h-10 shrink-0 items-center border-b border-hairline bg-fg/[0.03] px-2">
            {/* Area klik 24px (WCAG 2.2), titik visual 12px seperti macOS. */}
            <button type="button" onClick={onClose} aria-label="Tutup" title="Tutup" className="group flex h-6 w-6 items-center justify-center rounded-full">
              <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,.25)]">
                <Icon name="close" size={9} strokeWidth={3} className="text-black/60 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
              </span>
            </button>
            <h2 className="pointer-events-none absolute inset-x-16 truncate text-center text-[13px] font-semibold text-fg">{props.title}</h2>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-b border-hairline px-5 py-3">
            <h2 className="text-[15px] font-semibold">{props.title}</h2>
            <button type="button" onClick={onClose} className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-fg-2 hover:bg-fg/8 hover:text-fg" aria-label="Tutup">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto px-5 py-4">{props.children}</div>
        {props.footer && <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">{props.footer}</div>}
      </div>
    </div>
  );
}
