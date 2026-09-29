"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MenuGroup } from "@/lib/menu";
import { useLoadedDataset } from "@/lib/local/store";
import { EMPTY_FILTERS } from "@/lib/modules/collection/view-model";
import { writeViewState } from "@/lib/ui/view-state";
import { AppIcon, Icon } from "@/components/icons";
import { useDialog } from "@/components/use-dialog";
import { groupIcon, itemIcon } from "@/lib/ui/app-icons";

// Pencarian global (Ctrl/Cmd+K), gaya command palette. Sumber: menu/submenu yang boleh diakses (selalu), dan — hanya
// bila akun punya Daftar Tagihan dan dataset aging sudah dimuat di browser — Business Partner & No Invoice dari aging
// terkini (→ Daftar Tagihan dengan kata cari terisi). Tidak ada hasil buatan bila data belum ada.

type Kind = "menu" | "bp" | "invoice";
type Hit = { key: string; kind: Kind; title: string; sub: string; meta?: string; icon: string; group: string; go: () => void };
const KIND_LABEL: Record<Kind, string> = { menu: "Menu", bp: "Business Partner", invoice: "Invoice" };

export function Spotlight({ open, onClose, menu, showHome, canTagihan }: {
  open: boolean; onClose: () => void; menu: MenuGroup[]; showHome: boolean; canTagihan: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const aging = useLoadedDataset("aging");
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setQ(""); setIdx(0); onClose(); }, [onClose]);
  useDialog(open, close, dialogRef);
  const type = (v: string) => { setQ(v); setIdx(0); };

  const menuHits = useMemo<Hit[]>(() => {
    const items: Hit[] = showHome ? [{ key: "home", kind: "menu", title: "Beranda", sub: "Halaman utama", icon: itemIcon("home", "home").glyph, group: "home", go: () => router.push("/") }] : [];
    for (const g of menu) for (const c of g.children) {
      items.push({ key: c.id, kind: "menu", title: c.label, sub: g.label, meta: c.external ? "Tautan luar" : undefined, icon: itemIcon(g.id, c.id).glyph, group: g.id,
        go: () => { if (c.external) window.open(c.href, "_blank", "noreferrer"); else router.push(c.href); } });
    }
    return items;
  }, [menu, showHome, router]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return menuHits.slice(0, 10);
    const out = menuHits.filter((h) => `${h.title} ${h.sub}`.toLowerCase().includes(needle)).slice(0, 8);
    if (canTagihan && aging.data && needle.length >= 3) {
      const bps = new Map<string, string>(); // BP → collection
      const invs: Hit[] = [];
      for (const l of aging.data.lines) {
        const bp = l.business_partner ?? "";
        if (bp && bp.toLowerCase().includes(needle) && !bps.has(bp)) bps.set(bp, l.collection_name ?? "");
        if (l.invoice_no && l.invoice_no.toLowerCase().includes(needle) && invs.length < 5 && !invs.some((h) => h.key === `inv:${l.invoice_no}`)) {
          const coll = l.collection_name ?? "", inv = l.invoice_no;
          invs.push({ key: `inv:${inv}`, kind: "invoice", title: inv, sub: bp, meta: coll || "tanpa collection", icon: "receipt_long", group: "collection", go: () => openTagihan(coll, inv) });
        }
        if (bps.size >= 6 && invs.length >= 5) break;
      }
      for (const [bp, coll] of [...bps].slice(0, 6)) out.push({ key: `bp:${bp}`, kind: "bp", title: bp, sub: "Buka di Daftar Tagihan", meta: coll || "tanpa collection", icon: "storefront", group: "collection", go: () => openTagihan(coll, bp) });
      out.push(...invs);
    }
    return out;
    function openTagihan(coll: string, search: string) {
      if (coll) writeViewState(`collection:${coll}:filters`, { ...EMPTY_FILTERS, search });
      router.push(coll ? `/collection?c=${encodeURIComponent(coll)}` : "/collection");
    }
  }, [q, menuHits, canTagihan, aging.data, router]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open) return null;
  const pick = (h: Hit) => { close(); h.go(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (hits[idx]) pick(hits[idx]); }
  };
  const dataNote = canTagihan ? (aging.data ? "Ketik ≥3 huruf untuk BP / No Invoice" : "Buka Daftar Tagihan dulu untuk mencari BP / invoice") : null;
  return (
    <div className="fade-in fixed inset-0 z-(--z-overlay) flex items-start justify-center bg-black/25 p-4 pt-[16vh]" onMouseDown={close}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Pencarian" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}
        className="glass-strong pop-in w-full max-w-[640px] overflow-hidden rounded-[20px]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Icon name="search" size={24} className="text-fg-2" />
          <input data-autofocus value={q} onChange={(e) => type(e.target.value)} placeholder="Cari menu, Business Partner, No Invoice…" aria-label="Cari"
            className="w-full bg-transparent text-[20px] font-light tracking-tight outline-none placeholder:text-fg-2/70 no-ring" role="combobox" aria-expanded aria-controls="spotlight-list" aria-activedescendant={hits[idx] ? `spot-${idx}` : undefined} />
        </div>
        {hits.length > 0 || q ? <div className="border-t border-hairline" /> : null}
        <ul ref={listRef} id="spotlight-list" role="listbox" className="max-h-[52vh] overflow-y-auto px-2 pb-2 pt-1">
          {hits.map((h, i) => (
            <li key={h.key} role="presentation">
              {(i === 0 || hits[i - 1].kind !== h.kind) && (
                <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold text-fg-2">{q ? KIND_LABEL[h.kind] : "Menu yang sering dibuka"}</div>
              )}
              <div id={`spot-${i}`} data-i={i} role="option" aria-selected={i === idx} onMouseMove={() => idx !== i && setIdx(i)} onClick={() => pick(h)}
                className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-1.5 ${i === idx ? "bg-accent-fill text-on-accent" : ""}`}>
                <AppIcon spec={{ ...groupIcon(h.group), glyph: h.icon }} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{h.title}</span>
                  <span className={`block truncate text-[11px] ${i === idx ? "opacity-80" : "text-fg-2"}`}>{h.sub}</span>
                </span>
                {h.meta && <span className={`hidden max-w-40 truncate text-[11px] sm:inline ${i === idx ? "opacity-80" : "text-fg-2"}`}>{h.meta}</span>}
                {i === idx && <kbd className="rounded-[5px] border border-current/30 px-1 font-sans text-[10px]">↵</kbd>}
              </div>
            </li>
          ))}
          {!hits.length && <li className="px-3 py-6 text-center text-[13px] text-fg-2">Tidak ditemukan.</li>}
        </ul>
        <div className="flex items-center gap-3 border-t border-hairline bg-fg/[0.03] px-4 py-2 text-[11px] text-fg-2">
          <span className="flex items-center gap-1"><kbd className="rounded border border-hairline px-1 font-sans">↑</kbd><kbd className="rounded border border-hairline px-1 font-sans">↓</kbd> pilih</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-hairline px-1 font-sans">↵</kbd> buka</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-hairline px-1 font-sans">Esc</kbd> tutup</span>
          {dataNote && <span className="ml-auto hidden truncate sm:inline">{dataNote}</span>}
        </div>
      </div>
    </div>
  );
}
