import type { ErpRow } from "@/lib/uploads/parse";
import type { SjDoc } from "./parse";

// Fase 87 — Marketing Group untuk Monitor Surat Jalan, digabung LOKAL (AR Bot / browser) sebelum dikirim:
// sumber = laporan Invoice & Payment Date Comparison (Invoice by Date), kunci = BP Name = Business Partner SJ
// (tanpa beda huruf besar/kecil & spasi). Satu BP bisa punya beberapa Marketing Group → dipakai dari invoice terbaru.
// Data invoice/penjualan itu sendiri TIDAK dikirim ke AR Workspace.

export const bpKey = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** BP Name → Marketing Group dari invoice dengan Invoice Date terbesar (sama: baris pertama di file). */
export function marketingMap(rows: readonly Pick<ErpRow, "bp_name" | "marketing_group" | "invoice_date">[]): Map<string, string> {
  const best = new Map<string, { mg: string; date: string }>();
  for (const r of rows) {
    const k = bpKey(r.bp_name), mg = (r.marketing_group ?? "").trim();
    if (!k || !mg) continue;
    const d = r.invoice_date ?? "";
    const cur = best.get(k);
    if (!cur || d > cur.date) best.set(k, { mg, date: d });
  }
  return new Map([...best].map(([k, v]) => [k, v.mg]));
}

export type SjDocMg = SjDoc & { marketing_group: string | null };

/** Tempel Marketing Group ke tiap SJ lewat Business Partner. */
export function withMarketing(docs: readonly SjDoc[], map: ReadonlyMap<string, string>): SjDocMg[] {
  return docs.map((d) => ({ ...d, marketing_group: map.get(bpKey(d.business_partner)) ?? null }));
}

/** Ringkasan untuk log/pratinjau: SJ ber-Marketing Group & jumlah SJ per Marketing Group (terbanyak dulu). */
export function marketingStats(docs: readonly SjDocMg[]) {
  const per = new Map<string, number>();
  let matched = 0;
  for (const d of docs) if (d.marketing_group) { matched++; per.set(d.marketing_group, (per.get(d.marketing_group) ?? 0) + 1); }
  return {
    total: docs.length, matched, pct: docs.length ? (matched / docs.length) * 100 : 0,
    groups: [...per].sort((a, b) => b[1] - a[1]).map(([group, n]) => ({ group, n })),
  };
}
