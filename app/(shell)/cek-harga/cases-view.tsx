"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { fmtTimestamp } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, inputCls } from "@/components/ui";
import { TandaFilter } from "@/components/tanda-filter";
import { LocalTable, type LCol } from "@/lib/local/table";
import { ketOptions } from "@/lib/modules/m10/compute";
import { TANDA, tandaOf, type RowFlagValue } from "@/lib/modules/row-flags";
import { caseRow, countTanda, type CaseRecord, type CaseRow } from "@/lib/modules/cekharga/cases";

// Arsip & Task Complete (Fase 84) — pola Kertas Kerja Mitra10: centang baris → Tandai Tolakan/LTKP/Litigasi/Normal,
// isi Keterangan, Tandai Completed / Kembalikan ke Arsip, Hapus. Tanda tersinkron dua arah dengan invoice Mitra10
// ber-No PO sama (di server: po_so_cases_set_tanda ↔ row_flags_set).

const WAIT = "bg-warning/20 text-warning";
const BAD = "bg-danger/20 text-danger";
const SELECT = "id,po_customer,document_no,date_po,business_partner,price_list,document_status,total_po,total_so,selisih,keterangan,tanda,status,archived_at,completed_at";

export function CasesView({ status, version, onChange }: { status: "archived" | "completed"; version: number; onChange: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ket, setKet] = useState("");
  const stateKey = status === "archived" ? "cekharga-arsip" : "cekharga-done";

  const fetchRows = useCallback(async () => {
    const { data, error } = await fetchAll((a, b) => supabase.from("po_so_cases").select(SELECT).eq("status", status)
      .order(status === "archived" ? "archived_at" : "completed_at", { ascending: false }).order("id").range(a, b));
    if (error) toast(`Gagal memuat: ${error.message}`, "danger");
    return ((data ?? []) as unknown as CaseRecord[]).map(caseRow);
  }, [status, supabase, toast]);
  const load = async () => setRows(await fetchRows());

  useEffect(() => {
    let alive = true;
    fetchRows().then((rs) => {
      if (!alive) return;
      setRows(rs);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [fetchRows, version]);

  // Perubahan tampil seketika; gagal → muat ulang dari server + pesan.
  async function run(patch: (rs: CaseRow[]) => CaseRow[], call: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>, ok: (data: unknown) => string, refreshTabs = false) {
    setRows(patch);
    const { data, error } = await call();
    if (error) {
      toast(`Gagal menyimpan: ${error.message}`, "danger", 8000);
      await load();
      return;
    }
    toast(ok(data), "success");
    if (refreshTabs) onChange();
  }

  const ids = (sel: CaseRow[]) => sel.map((r) => r.id);
  const inSel = (sel: CaseRow[]) => { const s = new Set(ids(sel)); return (r: CaseRow) => s.has(r.id); };

  function flag(sel: CaseRow[], clear: () => void, f: RowFlagValue | null) {
    const has = inSel(sel);
    clear();
    void run((rs) => rs.map((r) => (has(r) ? { ...r, flag: f, tanda: tandaOf(f) } : r)),
      () => supabase.rpc("po_so_cases_set_tanda", { p_ids: ids(sel), p_flag: f }),
      (d) => {
        const inv = (d as { invoices?: number } | null)?.invoices ?? 0;
        const what = f ? `ditandai ${tandaOf(f)}` : "dikembalikan ke Normal";
        return `${sel.length} PO ${what}${inv ? ` · ${inv} invoice Mitra10 ikut diperbarui` : ""}.`;
      });
  }

  function setKeterangan(sel: CaseRow[], text: string) {
    const has = inSel(sel);
    const v = text.trim() || null;
    void run((rs) => rs.map((r) => (has(r) ? caseRow({ ...r, tanda: r.flag, keterangan: v }) : r)),
      () => supabase.from("po_so_cases").update({ keterangan: v }).in("id", ids(sel)),
      () => (v ? `Keterangan disimpan untuk ${sel.length} PO.` : `Keterangan dihapus untuk ${sel.length} PO.`));
  }

  function move(sel: CaseRow[], clear: () => void) {
    const has = inSel(sel);
    const toDone = status === "archived";
    clear();
    void run((rs) => rs.filter((r) => !has(r)),
      () => supabase.from("po_so_cases")
        .update(toDone ? { status: "completed", completed_at: new Date().toISOString() } : { status: "archived", completed_at: null })
        .in("id", ids(sel)),
      () => (toDone ? `${sel.length} PO dipindahkan ke Task Complete.` : `${sel.length} PO dikembalikan ke Arsip.`), true);
  }

  function remove(sel: CaseRow[]) {
    const has = inSel(sel);
    void run((rs) => rs.filter((r) => !has(r)),
      () => supabase.rpc("po_so_cases_delete", { p_ids: ids(sel) }),
      () => `${sel.length} PO dihapus dari ${status === "archived" ? "Arsip" : "Task Complete"}.`, true);
  }

  const cols = useMemo<LCol<CaseRow>[]>(() => [
    { k: "document_no", l: "Document No" }, { k: "date_po", l: "Date PO" }, { k: "po_customer", l: "No PO Customer" },
    { k: "business_partner", l: "Business Partner", w: 220 }, { k: "price_list", l: "Price List" },
    { k: "document_status", l: "Document Status" },
    { k: "total_po", l: "Total PO", n: true }, { k: "total_so", l: "Total SO", n: true }, { k: "selisih", l: "Selisih", n: true },
    { k: "tanda", l: "Tanda", badge: { Tolakan: "bg-accent/15 text-accent", LTKP: WAIT, Litigasi: BAD, Normal: "bg-surface-2 text-fg-2" } },
    { k: "keterangan", l: "Keterangan", edit: "text", w: 220 },
    status === "archived"
      ? { k: "archived_at", l: "Diarsipkan", render: (r) => fmtTimestamp(r.archived_at), text: (r) => fmtTimestamp(r.archived_at) }
      : { k: "completed_at", l: "Selesai", render: (r) => fmtTimestamp(r.completed_at), text: (r) => fmtTimestamp(r.completed_at) },
  ], [status]);

  const counts = useMemo(() => countTanda(rows), [rows]);
  const ketOpts = useMemo(() => ketOptions(rows), [rows]);

  return (
    <LocalTable title={status === "archived" ? "Arsip" : "Task Complete"} stateKey={stateKey} hideKey={stateKey}
      rows={rows} cols={cols} rowKey={(r) => r.id} loading={loading}
      emptyText={status === "archived" ? "Belum ada PO di Arsip." : "Belum ada PO di Task Complete."}
      search={["po_customer", "document_no", "business_partner", "keterangan", "tanda", "price_list"]}
      filters={[
        { k: "tanda", l: "Tanda", options: TANDA },
        { k: "ket_isi", l: "Keterangan", options: ketOpts },
      ]}
      onEdit={(r, _k, v) => setKeterangan([r], String(v ?? ""))}
      toolbar={<TandaFilter stateKey={stateKey} counts={counts} />}
      selectable
      onDelete={remove}
      actions={(sel, clear) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1" role="group" aria-label="Tandai PO terpilih">
            <button type="button" className={`${btnGhost} !text-accent`} onClick={() => flag(sel, clear, "tolakan")}>Tandai Tolakan</button>
            <button type="button" className={`${btnGhost} !text-warning`} onClick={() => flag(sel, clear, "ltkp")}>Tandai LTKP</button>
            <button type="button" className={`${btnGhost} !text-danger`} onClick={() => flag(sel, clear, "litigasi")}>Tandai Litigasi</button>
            <button type="button" className={btnGhost} onClick={() => flag(sel, clear, null)}>Jadikan Normal</button>
          </span>
          <input value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Keterangan (kosong = hapus)"
            aria-label="Keterangan untuk PO terpilih" className={`${inputCls} !w-56`} />
          <button type="button" className={btnGhost} onClick={() => { setKeterangan(sel, ket); clear(); }}>Simpan untuk {sel.length}</button>
          <button type="button" className={`${btnGhost} !text-success`} onClick={() => move(sel, clear)}>
            {status === "archived" ? "Tandai Completed" : "Kembalikan ke Arsip"}
          </button>
        </span>
      )} />
  );
}
