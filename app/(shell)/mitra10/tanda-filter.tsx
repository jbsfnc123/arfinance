"use client";

import { useViewState } from "@/lib/ui/view-state";
import { TANDA, type Tanda } from "@/lib/modules/row-flags";

// Tombol filter Tanda (Semua · Normal · Tolakan · LTKP · Litigasi) di Kertas Kerja Mitra10 (Fase 82).
// Menulis/membaca state filter LocalTable yang sama (`table:<stateKey>:f`.tanda) — sinkron dengan dropdown & Reset tabel.
// LocalTable-nya wajib diberi `stateKey` yang sama dan filter `{ k: "tanda" }` terdaftar (filter tak terdaftar diabaikan).
export function TandaFilter({ stateKey, counts }: { stateKey: string; counts: Record<Tanda, number> }) {
  const [f, setF] = useViewState<Record<string, string>>(`table:${stateKey}:f`, {});
  const active = (TANDA as string[]).includes(f.tanda ?? "") ? (f.tanda as Tanda) : "";
  function pick(v: Tanda | "") {
    const rest = { ...f };
    delete rest.tanda;
    setF(v ? { ...rest, tanda: v } : rest);
  }
  const total = TANDA.reduce((s, t) => s + counts[t], 0);
  const opts: { v: Tanda | ""; l: string; n: number; on: string }[] = [
    { v: "", l: "Semua", n: total, on: "bg-surface-2 text-fg" },
    { v: "Normal", l: "Normal", n: counts.Normal, on: "bg-surface-2 text-fg" },
    { v: "Tolakan", l: "Tolakan", n: counts.Tolakan, on: "bg-accent/15 text-accent" },
    { v: "LTKP", l: "LTKP", n: counts.LTKP, on: "bg-warning/20 text-warning" },
    { v: "Litigasi", l: "Litigasi", n: counts.Litigasi, on: "bg-danger/20 text-danger" },
  ];
  return (
    <span role="group" aria-label="Tombol filter Tanda" className="inline-flex overflow-hidden rounded-lg border border-line">
      {opts.map((o) => (
        <button key={o.l} type="button" aria-pressed={active === o.v} onClick={() => pick(o.v)}
          className={`px-2.5 py-1 text-xs tabular-nums transition-colors ${active === o.v ? `${o.on} font-medium` : "text-fg-2 hover:bg-surface-2"}`}>
          {o.l} <span className="opacity-70">{o.n.toLocaleString("id-ID")}</span>
        </button>
      ))}
    </span>
  );
}
