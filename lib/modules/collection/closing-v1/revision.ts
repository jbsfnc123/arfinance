import { num } from "@/lib/local/pack";
import type { AgingLine } from "@/lib/local/datasets";

// Deteksi REVISI invoice lewat No SJ: No Invoice bisa berubah saat revisi, No SJ tidak.
// Invoice target yang sudah tidak ada di aging, tetapi salah satu SJ-nya muncul di aging dengan
// No Invoice lain, dianggap direvisi → sisanya = open invoice pengganti (bukan terkumpul).

// "SJ/112774/XXVI/TRA-SJ/112828/XXVI/TRA" → ["SJ/112774/XXVI/TRA", "SJ/112828/XXVI/TRA"].
export function splitSj(s: string | null | undefined): string[] {
  const v = (s ?? "").trim().toUpperCase();
  if (!v) return [];
  const parts = v.split(/(?=SJ\/)/).map((x) => x.replace(/^[-\s,;]+|[-\s,;]+$/g, "")).filter(Boolean);
  return parts.length ? parts : [v];
}

export type Revision = { replacements: string[]; open: number; due: string | null };

// targetInvoices: invoice pengganti yang juga ada di target tidak dipakai (hindari hitung ganda).
export function revisionLookup(agingAll: AgingLine[], targetInvoices: Set<string>) {
  const inAging = new Set<string>();
  const bySj = new Map<string, AgingLine[]>();
  for (const l of [...agingAll].sort((a, b) => a.line_no - b.line_no)) {
    if (!l.invoice_no) continue;
    inAging.add(l.invoice_no);
    for (const sj of splitSj(l.no_sj)) (bySj.get(sj) ?? bySj.set(sj, []).get(sj)!).push(l);
  }
  return (invoiceNo: string, noSj: string | null | undefined): Revision | null => {
    if (inAging.has(invoiceNo)) return null;
    const repl = new Map<string, AgingLine>();
    for (const sj of splitSj(noSj)) {
      for (const l of bySj.get(sj) ?? []) {
        if (l.invoice_no && l.invoice_no !== invoiceNo && !targetInvoices.has(l.invoice_no) && !repl.has(l.invoice_no)) repl.set(l.invoice_no, l);
      }
    }
    if (!repl.size) return null;
    const lines = [...repl.values()];
    return { replacements: [...repl.keys()], open: lines.reduce((a, l) => a + num(l.open_amt), 0), due: lines[0].due_date };
  };
}
