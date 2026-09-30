"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@/components/popover";
import { Icon } from "@/components/icons";
import { btnGhost } from "@/components/ui";
import { markSummary, ROW_MARK_COLORS, ROW_MARK_LABEL, type RowMarkColor } from "@/lib/modules/row-marks";

// Aksi "Warna baris" untuk baris terpilih (Kertas Kerja Mitra10 & RKM). Popover ringkas: Biru, Mint, Lavender,
// pemisah, Hapus warna. Centang = semua target memakai warna itu; "Campuran" bila berbeda. Target = baris terpilih
// yang diberikan pemanggil (termasuk yang tersembunyi oleh cari/filter; jumlahnya ditampilkan). Setelah memilih,
// popover tertutup dan pilihan baris dipertahankan. Keyboard: panah/Home/End berpindah, Enter/Spasi memilih,
// Escape menutup & fokus kembali ke tombol (lapisan popover bersama).
export function RowMarkButton({ ids, hidden, marks, onApply }: {
  ids: number[]; hidden: number; marks: ReadonlyMap<number, RowMarkColor>;
  onApply: (color: RowMarkColor | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const summary = markSummary(ids, marks);
  const current = summary.kind === "single" ? summary.color : null;

  // Saat terbuka: fokus ke warna yang sedang dipakai, atau pilihan pertama.
  useEffect(() => {
    if (!open) return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not([disabled])") ?? [])];
    (items.find((el) => el.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not([disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : e.key === "ArrowUp" ? (i - 1 + items.length) % items.length
      : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    items[next]?.focus();
  };
  const pick = (color: RowMarkColor | null) => { setOpen(false); onApply(color); };
  const item = "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-fg/8 focus-visible:bg-fg/8 min-h-8 pointer-coarse:min-h-11";

  return (
    <span className="relative inline-flex flex-wrap items-center gap-2">
      <button type="button" data-popover-anchor className={btnGhost} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)} disabled={!ids.length}>
        <Icon name="palette" size={16} />
        Warna baris
        {summary.kind === "mixed" && <span className="text-[11px] text-fg-2">· Campuran</span>}
        {current && <span className="text-[11px] text-fg-2">· {ROW_MARK_LABEL[current]}</span>}
      </button>
      <span className="text-[12px] text-fg-2" aria-live="polite">
        {ids.length} baris dipilih{hidden > 0 && <> · <b className="font-medium text-warning">{hidden} di luar filter</b></>}
      </span>
      <Popover open={open} onClose={() => setOpen(false)} label="Warna baris"
        className="left-0 top-full mt-1.5 w-60 p-1.5 max-sm:fixed max-sm:left-2 max-sm:right-2 max-sm:w-auto max-sm:top-auto max-sm:bottom-[calc(var(--dock-reserve)+8px)]">
        <div ref={menuRef} role="menu" aria-label="Warna baris" onKeyDown={onKey}>
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] text-fg-2">
            {ids.length} baris{hidden > 0 ? ` (${hidden} di luar filter)` : ""}{summary.kind === "mixed" ? " · warna campuran" : ""}
          </p>
          {ROW_MARK_COLORS.map((c) => {
            const on = current === c;
            return (
              <button key={c} type="button" role="menuitemradio" aria-checked={on} className={item} onClick={() => pick(c)}>
                <span aria-hidden className="h-4 w-4 shrink-0 rounded-[5px] border-2"
                  style={{ background: `var(--mark-${c}-bg)`, borderColor: `var(--mark-${c}-accent)` }} />
                <span className="flex-1">{ROW_MARK_LABEL[c]}</span>
                {on && <Icon name="check" size={15} strokeWidth={2.25} className="text-accent" label="Dipakai" />}
              </button>
            );
          })}
          <div role="separator" className="mx-2 my-1 border-t border-hairline" />
          <button type="button" role="menuitem" className={item} disabled={summary.kind === "none"} onClick={() => pick(null)}
            aria-disabled={summary.kind === "none" || undefined}>
            <Icon name="block" size={16} className="text-fg-2" />
            <span className="flex-1">Hapus warna</span>
          </button>
        </div>
      </Popover>
    </span>
  );
}
