import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { rupiah, monthLabel } from "@/lib/format";
import { parseTarget } from "@/lib/modules/collection/parse-target";
import { parseMutasiWorkbook } from "@/lib/modules/mutasi/parse";
import { parseAging, parseBpMaster, parseErp, type FileKind, type Sheet } from "./parse";
import { uploadShared } from "./commit";

export type Summary = string;
const fmtN = (n: number) => n.toLocaleString("id-ID");
const months = (ms: string[]) => ms.map(monthLabel).join(", ");

// Ringkasan pratinjau sebelum diproses.
export function summarize(kind: FileKind, sheets: Sheet[]): Summary {
  if (kind === "aging") {
    const a = parseAging(sheets);
    return `${fmtN(a.rows.length)} baris · snapshot ${monthLabel(a.month)} · total Open Amt ${rupiah(a.total)}`;
  }
  if (kind === "erp") {
    const e = parseErp(sheets);
    return `${fmtN(e.invoices)} invoice / ${fmtN(e.rows.filter((r) => r.payment_date).length)} pembayaran · laporan per tanggal ${e.meta.kind === "invoice" ? "invoice" : "payment"} · ${months(e.months)}` +
      (e.meta.paymentGroup ? ` · Payment Group ${e.meta.paymentGroup}` : "");
  }
  if (kind === "bpmaster") return `${fmtN(parseBpMaster(sheets).rows.length)} Business Partner`;
  if (kind === "target") {
    const t = parseTarget(sheets[0].rows);
    return `${fmtN(t.rows.length)} invoice · total target ${rupiah(t.rows.reduce((a, r) => a + r.target, 0))}`;
  }
  return `${sheets.length} sheet mutasi rekening`;
}

// Simpan satu file sesuai jenisnya. Semua tombol upload (Pusat Upload & modul) lewat sini.
export async function runUpload(supabase: SupabaseClient<Database>, kind: FileKind, file: File, sheets: Sheet[], opt: { month?: string } = {}) {
  if (kind === "aging") {
    const a = parseAging(sheets);
    const { result: r, seenAt } = await uploadShared(supabase, "aging", file, a.rows);
    return { seenAt, result: r, message: `Snapshot aging ${monthLabel(String(r.month))}: ${fmtN(Number(r.rows))} baris` +
      (r.current ? ` · Collection ${fmtN(Number(r.collectionRows))} invoice · Mitra10 ${fmtN(Number(r.m10Rows))} invoice (${r.m10NewInvoices} baru ke Kertas Kerja, ${r.m10Lunas} lunas)` : " · bukan bulan terbaru: hanya dipakai riwayat/Presentasi") };
  }
  if (kind === "erp") {
    const e = parseErp(sheets);
    const { result: r, seenAt } = await uploadShared(supabase, "erp", file, e.rows, e.meta);
    return { seenAt, result: r, message: `${fmtN(Number(r.invoices))} invoice & ${fmtN(Number(r.payments))} pembayaran disimpan` +
      (Number(r.deletedInvoices) || Number(r.deletedPayments) ? ` · ${r.deletedInvoices} invoice / ${r.deletedPayments} pembayaran lama yang tidak ada lagi dihapus` : "") };
  }
  if (kind === "bpmaster") {
    const { result: r, seenAt } = await uploadShared(supabase, "bpmaster", file, parseBpMaster(sheets).rows);
    return { seenAt, result: r, message: `${fmtN(Number(r.rows))} Business Partner disimpan (master diganti penuh)` };
  }
  if (kind === "target") {
    const month = opt.month;
    if (!month) throw new Error("bulan target belum dipilih");
    const t = parseTarget(sheets[0].rows);
    const { data, error } = await supabase.rpc("ar_target_replace", { p_month: month, p_rows: t.rows, p_file_name: file.name });
    if (error) throw error;
    return { seenAt: null, result: {}, message: `Target ${monthLabel(month)}: ${fmtN(data)} invoice` };
  }
  const { data: accounts, error: e1 } = await supabase.from("bank_accounts").select("code, last4").eq("active", true);
  if (e1) throw e1;
  const res = parseMutasiWorkbook(sheets, accounts ?? []);
  const { data, error } = await supabase.rpc("mutasi_import", { p_sheets: res.sheets, p_file_name: file.name });
  if (error) throw error;
  return { seenAt: null, result: {}, message: `${fmtN(data)} baris CR (${res.sheets.map((s) => s.account).join(", ")})` +
    (res.ignored.length ? ` · sheet diabaikan: ${res.ignored.join(", ")}` : "") };
}
