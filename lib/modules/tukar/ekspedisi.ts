import type { AgingLine, Exchange } from "@/lib/local/datasets";
import { num } from "@/lib/local/pack";
import { pickExchanges } from "@/lib/modules/collection/rows";

// Tukar Faktur › Ekspedisi: pilih invoice open dari aging terbaru lalu catat No Resi + tanggal kirim.
// Resi disimpan sebagai tukar faktur metode "Ekspedisi" (invoice_exchanges) sehingga kolom Tgl Tukar Faktur &
// No Resi di Daftar Tagihan / Dashboard Tukar Faktur ikut terisi (aturan prioritas metode sama).

export type EkspedisiRow = {
  invoice_no: string; payment_group: string; business_partner: string; bp_key: string;
  invoice_date: string | null; nominal: number; collection: string;
  status: "Belum TF" | "Sudah TF"; metode: string; tf_date: string | null; resi: string;
};

/** Resi ekspedisi; data lama menyimpan resi di keterangan. */
export const resiOf = (e: Pick<Exchange, "resi" | "keterangan">) => (e.resi ?? "").trim() || (e.keterangan ?? "").trim();

export function ekspedisiRows(lines: AgingLine[], exchanges: Exchange[]): EkspedisiRow[] {
  const ex = pickExchanges(exchanges);
  // Resi ekspedisi tetap ditampilkan walau metode terpilih invoice itu Kolektor.
  const eksp = new Map<string, Exchange>();
  for (const e of exchanges) if (e.metode === "Ekspedisi" && (!eksp.has(e.invoice_no) || e.id > eksp.get(e.invoice_no)!.id)) eksp.set(e.invoice_no, e);
  const seen = new Set<string>();
  const out: EkspedisiRow[] = [];
  for (const l of [...lines].sort((a, b) => a.line_no - b.line_no)) {
    const inv = (l.invoice_no ?? "").trim();
    if (!inv || seen.has(inv)) continue;
    seen.add(inv);
    const nominal = num(l.open_amt);
    if (nominal <= 1000) continue;
    const x = ex.get(inv);
    const e = eksp.get(inv);
    out.push({
      invoice_no: inv, payment_group: l.payment_group ?? "", business_partner: l.business_partner ?? "", bp_key: l.bp_key ?? "",
      invoice_date: l.invoice_date, nominal, collection: l.collection_name ?? "",
      status: x ? "Sudah TF" : "Belum TF", metode: x?.metode ?? "", tf_date: x?.tanggal ?? null, resi: e ? resiOf(e) : "",
    });
  }
  return out;
}

export type ResiGroup = {
  key: string; resi: string; tanggal: string | null; count: number; total: number; bps: string;
  ids: number[]; invoices: { id: number; invoice_no: string; business_partner: string; invoice_date: string | null; nominal: number }[];
};

/** Riwayat resi ekspedisi: dikelompokkan per No Resi + tanggal, terbaru di atas. */
export function resiHistory(exchanges: Exchange[], lines: AgingLine[]): ResiGroup[] {
  const aging = new Map<string, AgingLine>();
  for (const l of lines) if (l.invoice_no && !aging.has(l.invoice_no.trim())) aging.set(l.invoice_no.trim(), l);
  const m = new Map<string, ResiGroup>();
  for (const e of exchanges) {
    if (e.metode !== "Ekspedisi") continue;
    const resi = resiOf(e) || "(tanpa resi)";
    const key = `${resi}|${e.tanggal ?? ""}`;
    const g = m.get(key) ?? { key, resi, tanggal: e.tanggal, count: 0, total: 0, bps: "", ids: [], invoices: [] };
    const a = aging.get(e.invoice_no);
    const nominal = a ? num(a.open_amt) : 0;
    g.ids.push(e.id); g.count++; g.total += nominal;
    g.invoices.push({ id: e.id, invoice_no: e.invoice_no, business_partner: a?.business_partner ?? "", invoice_date: a?.invoice_date ?? null, nominal });
    m.set(key, g);
  }
  return [...m.values()].map((g) => ({
    ...g, bps: [...new Set(g.invoices.map((i) => i.business_partner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")).join(", "),
  })).sort((a, b) => (b.tanggal ?? "").localeCompare(a.tanggal ?? "") || a.resi.localeCompare(b.resi, "id"));
}

/** Validasi input sebelum dikirim (server memvalidasi ulang). */
export function resiError(resi: string, tanggal: string, today: string): string | null {
  const r = resi.trim();
  if (!r) return "No Resi wajib diisi.";
  if (r.length > 60) return "No Resi maksimal 60 karakter.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return "Tanggal tukar faktur wajib diisi.";
  if (tanggal > today) return "Tanggal tukar faktur tidak boleh melebihi hari ini.";
  return null;
}
