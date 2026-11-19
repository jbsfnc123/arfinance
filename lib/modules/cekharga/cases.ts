import { ketIsi } from "@/lib/modules/m10/compute";
import { ROW_FLAGS, TANDA, tandaOf, type RowFlagValue, type Tanda } from "@/lib/modules/row-flags";

// Baris Arsip / Task Complete Cek Selisih Harga (Fase 84): tanda per PO (Tolakan/LTKP/Litigasi, tersinkron dua arah
// dengan tanda invoice Mitra10 lewat No PO di server) + Keterangan bebas.

export type CaseRecord = {
  id: number; po_customer: string; document_no: string | null; date_po: string | null; business_partner: string | null;
  price_list: string | null; document_status: string | null; total_po: number; total_so: number; selisih: number;
  keterangan: string | null; tanda: string | null; status: string; archived_at: string; completed_at: string | null;
};
// `tanda` = label (kunci filter LocalTable/TandaFilter), `flag` = nilai mentah di server.
export type CaseRow = Omit<CaseRecord, "tanda"> & { flag: RowFlagValue | null; tanda: Tanda; ket_isi: string };

const isFlag = (v: string | null): v is RowFlagValue => (ROW_FLAGS as readonly string[]).includes(v ?? "");

export function caseRow(c: CaseRecord): CaseRow {
  return {
    ...c,
    total_po: Number(c.total_po) || 0, total_so: Number(c.total_so) || 0, selisih: Number(c.selisih) || 0,
    flag: isFlag(c.tanda) ? c.tanda : null,
    tanda: tandaOf(isFlag(c.tanda) ? c.tanda : null),
    ket_isi: ketIsi(c.keterangan),
  };
}

/** Jumlah baris per Tanda untuk tombol filter. */
export function countTanda(rows: readonly { tanda: Tanda }[]) {
  const n = Object.fromEntries(TANDA.map((t) => [t, 0])) as Record<Tanda, number>;
  for (const r of rows) n[r.tanda]++;
  return n;
}
