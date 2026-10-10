// Gabungkan baris arsip Google Drive ke bentuk dataset yang sudah dipakai halaman (Datasets["erp"], Target, Mutation),
// sehingga logika hitung halaman tidak berubah. Bulan yang diarsip sudah TIDAK ada di Supabase, jadi baris arsip hanya
// ditambahkan untuk bulan yang tidak ada di data Supabase (aman bila arsip & Supabase sempat bertumpuk).
import type { Datasets, ErpInvoice, Mutation, Target } from "@/lib/local/datasets";

type Row = Record<string, unknown>;
type Erp = Datasets["erp"];
type Payment = Erp["payments"][number];

const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

export function invoiceFromRow(r: Row): ErpInvoice {
  return {
    invoice_no: String(r.invoice_no), invoice_date: String(r.invoice_date ?? ""), amount: num(r.amount),
    bp_key: str(r.bp_key), due_date: str(r.due_date), payment_term: str(r.payment_term), bp_name: str(r.bp_name), bp_location: str(r.bp_location),
  };
}

/** Baris arsip Pembayaran ERP (dengan salinan invoice di kolom `invoice`) → invoices + payments. */
export function erpFromPaymentRows(rows: Row[]): Erp {
  const invoices = new Map<string, ErpInvoice>();
  const payments: Payment[] = [];
  for (const r of rows) {
    payments.push({ invoice_no: String(r.invoice_no), payment_date: String(r.payment_date), amount: num(r.amount) });
    const inv = r.invoice as Row | null | undefined;
    if (inv?.invoice_no && !invoices.has(String(inv.invoice_no))) invoices.set(String(inv.invoice_no), invoiceFromRow(inv));
  }
  return { invoices: [...invoices.values()], payments };
}

const monthsOf = <T,>(xs: T[], date: (x: T) => string | null | undefined) => new Set(xs.map((x) => date(x)?.slice(0, 7)).filter(Boolean) as string[]);

/** Tambahkan data ERP arsip: invoice baru (berdasar invoice_no) & pembayaran bulan yang tidak ada di `base`. */
export function mergeErp<T extends Erp>(base: T, extra: Erp): T {
  if (!extra.invoices.length && !extra.payments.length) return base;
  const have = new Set(base.invoices.map((i) => i.invoice_no));
  const baseMonths = monthsOf(base.payments, (p) => p.payment_date);
  return {
    ...base,
    invoices: [...base.invoices, ...extra.invoices.filter((i) => !have.has(i.invoice_no) && (have.add(i.invoice_no), true))],
    payments: [...base.payments, ...extra.payments.filter((p) => !baseMonths.has(p.payment_date.slice(0, 7)))],
  };
}

/** Jumlah pembayaran per bulan dari baris arsip (untuk `counts` History Pembayaran — semua term). */
export function paymentCounts(rows: Row[]) {
  const c: Record<string, number> = {};
  for (const r of rows) { const m = String(r.payment_date ?? "").slice(0, 7); if (m) c[m] = (c[m] ?? 0) + 1; }
  return c;
}

export function mergeTargets(base: Target[], rows: Row[]): Target[] {
  if (!rows.length) return base;
  const months = new Set(base.map((t) => t.month));
  return [...base, ...(rows as unknown as Target[]).filter((t) => !months.has(t.month))];
}

export function mergeMutations(base: Mutation[], rows: Row[]): Mutation[] {
  if (!rows.length) return base;
  const ids = new Set(base.map((m) => m.id));
  return [...base, ...(rows as unknown as Mutation[]).filter((m) => !ids.has(m.id))];
}
