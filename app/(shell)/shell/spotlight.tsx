"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MenuGroup } from "@/lib/menu";
import { useLoadedDataset } from "@/lib/local/store";
import { EMPTY_FILTERS } from "@/lib/modules/collection/view-model";
import { writeViewState } from "@/lib/ui/view-state";

// Pencarian global (Ctrl/Cmd+K). Sumber: menu/submenu yang boleh diakses (selalu), dan — hanya bila akun punya Daftar
// Tagihan dan dataset aging sudah dimuat di browser — Business Partner & No Invoice dari aging terkini
// (→ Daftar Tagihan dengan kata cari terisi). Tidak ada hasil buatan bila data belum ada.

type Hit = { key: string; kind: "menu" | "bp" | "invoice"; title: string; sub: string; icon: string; go: () => void };

export function Spotlight({ open, onClose, menu, showHome, canTagihan }: {
  open: boolean; onClose: () => void; menu: MenuGroup[]; showHome: boolean; canTagihan: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const aging = useLoadedDataset("aging");
  const listRef = useRef<HTMLUListElement>(null);
  const close = useCallback(() => { setQ(""); setIdx(0); onClose(); }, [onClose]);
  const type = (v: string) => { setQ(v); setIdx(0); };

  const menuHits = useMemo<Hit[]>(() => {
    const items: Hit[] = showHome ? [{ key: "home", kind: "menu", title: "Beranda", sub: "Halaman", icon: "home", go: () => router.push("/") }] : [];
    for (const g of menu) for (const c of g.children) {
      items.push({ key: c.id, kind: "menu", title: c.label, sub: g.label, icon: g.icon,
        go: () => { if (c.external) window.open(c.href, "_blank", "noreferrer"); else router.push(c.href); } });
    }
    return items;
  }, [menu, showHome, router]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return menuHits.slice(0, 12);
    const out = menuHits.filter((h) => `${h.title} ${h.sub}`.toLowerCase().includes(needle)).slice(0, 8);
    if (canTagihan && aging.data && needle.length >= 3) {
      const bps = new Map<string, string>(); // BP → collection
      const invs: Hit[] = [];
      for (const l of aging.data.lines) {
        const bp = l.business_partner ?? "";
        if (bp && bp.toLowerCase().includes(needle) && !bps.has(bp)) bps.set(bp, l.collection_name ?? "");
        if (l.invoice_no && l.invoice_no.toLowerCase().includes(needle) && invs.length < 5 && !invs.some((h) => h.key === `inv:${l.invoice_no}`)) {
          const coll = l.collection_name ?? "", inv = l.invoice_no;
          invs.push({ key: `inv:${inv}`, kind: "invoice", title: inv, sub: `${bp} · ${coll || "tanpa collection"}`, icon: "receipt_long", go: () => openTagihan(coll, inv) });
        }
        if (bps.size >= 6 && invs.length >= 5) break;
      }
      for (const [bp, coll] of [...bps].slice(0, 6)) out.push({ key: `bp:${bp}`, kind: "bp", title: bp, sub: `Business Partner · ${coll || "tanpa collection"}`, icon: "storefront", go: () => openTagihan(coll, bp) });
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
    else if (e.key === "Escape") close();
  };
  const dataNote = canTagihan ? (aging.data ? "Ketik ≥3 huruf untuk BP / No Invoice" : "Buka Daftar Tagihan dulu untuk mencari BP / invoice") : null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[14vh] backdrop-blur-sm" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label="Pencarian" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}
        className="glass pop-in w-full max-w-2xl overflow-hidden rounded-3xl">
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="material-symbols-outlined !text-2xl text-fg-2">search</span>
          <input autoFocus value={q} onChange={(e) => type(e.target.value)} placeholder="Cari menu, Business Partner, No Invoice…" aria-label="Cari"
            className="w-full bg-transparent text-lg outline-none placeholder:text-fg-2" role="combobox" aria-expanded aria-controls="spotlight-list" aria-activedescendant={hits[idx] ? `spot-${idx}` : undefined} />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-fg-2">Esc</kbd>
        </div>
        <div className="border-t border-line" />
        <ul ref={listRef} id="spotlight-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {hits.map((h, i) => (
            <li key={h.key} id={`spot-${i}`} data-i={i} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => pick(h)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${i === idx ? "bg-pill text-pill-fg" : ""}`}>
              <span className={`material-symbols-outlined !text-xl ${i === idx ? "" : "text-fg-2"}`}>{h.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{h.title}</span>
                <span className={`block truncate text-xs ${i === idx ? "text-pill-fg/80" : "text-fg-2"}`}>{h.sub}</span>
              </span>
              {i === idx && <kbd className="rounded-md border border-current/30 px-1.5 text-[10px]">↵</kbd>}
            </li>
          ))}
          {!hits.length && <li className="px-3 py-6 text-center text-sm text-fg-2">Tidak ditemukan.</li>}
        </ul>
        <div className="flex items-center gap-4 border-t border-line px-5 py-2 text-[11px] text-fg-2">
          <span>↑↓ pilih · ↵ buka · Esc tutup</span>{dataNote && <span className="ml-auto">{dataNote}</span>}
        </div>
      </div>
    </div>
  );
}
