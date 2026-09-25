"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { DETAIL_HEADERS, PIVOT_HEADERS } from "@/lib/modules/coretax/coretax";
import { downloadXlsxSheets } from "@/lib/xlsx-client";
import { fmtTimestamp, rupiah } from "@/lib/format";
import { useToast } from "@/components/toast";
import { card, td, th } from "@/components/ui";

type Batch = Tables<"coretax_batches">;
type Line = Tables<"coretax_lines">;

// Riwayat "Simpan ke Database" (pengganti sheet TaxInvoices / Tax per Invoice).
export function HistoryView() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [rows, setRows] = useState<Batch[]>([]);

  useEffect(() => {
    supabase.from("coretax_batches").select("*").order("id", { ascending: false }).limit(200).then(({ data }) => setRows(data ?? []));
  }, [supabase]);

  async function downloadBatch(b: Batch) {
    const lines: Line[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("coretax_lines").select("*").eq("batch_id", b.id).order("no").range(from, from + 999);
      if (error) return toast(`Gagal mengambil data: ${error.message}`, "danger");
      lines.push(...data);
      if (data.length < 1000) break;
    }
    const detail = lines.map((l) => [l.no, l.tax_invoice_date, l.tax_invoice_opt, l.trx_code, l.ref_desc, l.seller_idtku, l.buyer_tin,
      l.buyer_document, l.buyer_country, l.buyer_document_number, l.buyer_name, l.buyer_address, l.buyer_email, l.buyer_idtku,
      l.code, l.name, l.unit, l.price, l.qty, l.total_discount, l.tax_base, l.other_tax_base, l.vat_rate, l.vat, l.stlg_rate, l.stlg]);
    // Pivot per faktur (urut kemunculan referensi).
    const per = new Map<string, { date: string | null; buyer: string | null; tin: string | null; codes: Set<string>; dpp: number; lain: number; ppn: number }>();
    for (const l of lines) {
      const k = l.ref_desc ?? "";
      const p = per.get(k) ?? { date: l.tax_invoice_date, buyer: l.buyer_name, tin: l.buyer_tin, codes: new Set<string>(), dpp: 0, lain: 0, ppn: 0 };
      if (l.code?.trim()) p.codes.add(l.code.trim());
      p.dpp += Number(l.tax_base) || 0; p.lain += Number(l.other_tax_base) || 0; p.ppn += Number(l.vat) || 0;
      per.set(k, p);
    }
    const pivot = [...per.entries()].map(([ref, p], i) => [i + 1, p.date, ref, p.buyer, p.tin, p.codes.size, p.dpp, p.lain, p.ppn]);
    const name = (b.file_name ?? "TaxInvoice").replace(/\.xml$/i, "");
    downloadXlsxSheets(`${name}_simpan-${b.id}.xlsx`, [
      { name: "TaxInvoices", rows: [DETAIL_HEADERS, ...detail] },
      { name: "Tax per Invoice", rows: [PIVOT_HEADERS, ...pivot] },
    ]);
  }

  return (
    <section className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead>
          <tr>
            {["Waktu", "File", "Filter", "Oleh"].map((h) => <th key={h} className={th}>{h}</th>)}
            {["Faktur", "Baris", "DPP", "PPN"].map((h) => <th key={h} className={`${th} text-right`}>{h}</th>)}
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-t border-line">
              <td className={td}>{fmtTimestamp(b.created_at)}</td>
              <td className={`${td} max-w-64 truncate`} title={b.file_name ?? ""}>{b.file_name}</td>
              <td className={td}>{b.types || "Semua"}</td>
              <td className={td}>{b.created_by_name}</td>
              <td className={`${td} text-right`}>{b.invoice_count}</td>
              <td className={`${td} text-right`}>{b.line_count}</td>
              <td className={`${td} text-right`}>{rupiah(Math.round(b.dpp))}</td>
              <td className={`${td} text-right`}>{rupiah(Math.round(b.ppn))}</td>
              <td className={td}>
                <button type="button" className="text-accent hover:underline" onClick={() => downloadBatch(b)}>Excel</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={9}>Belum ada data tersimpan.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
