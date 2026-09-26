"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { optimistic } from "@/lib/local/store";
import { LocalTable, type LCol } from "@/lib/local/table";
import type { RkmGr, RkmKw } from "@/lib/local/datasets";
import type { RkmGrRow, RkmKwRow, RkmRow } from "@/lib/modules/rkm/compute";
import { Tabs } from "@/components/tabs";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { setRemarks } from "@/lib/modules/remarks";
import { M10Dashboard } from "../mitra10/m10-dashboard";
import { RkmUpload } from "./rkm-upload";
import { useRkm } from "./use-rkm";

const TABS = [
  { key: "dash", label: "Dashboard", icon: "monitoring" },
  { key: "kk", label: "Kertas Kerja", icon: "table" },
  { key: "gr", label: "Receiving", icon: "inventory" },
  { key: "kw", label: "Kwitansi", icon: "receipt_long" },
  { key: "upload", label: "Upload & Setting", icon: "upload_file" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const OK = "bg-success/20 text-success";
const WAIT = "bg-warning/20 text-warning";
const BAD = "bg-danger/20 text-danger";

const KK_COLS: LCol<RkmRow>[] = [
  { k: "bp_short", l: "Business Partner" }, { k: "invoice_no", l: "Invoice No" },
  { k: "invoice_date", l: "Invoice Date", d: true }, { k: "due_date", l: "Due Date", d: true }, { k: "open_amt", l: "Open Amt", n: true },
  { k: "no_po", l: "No PO" }, { k: "no_sj", l: "No SJ" },
  { k: "gr", l: "GR", badge: { Done: OK, Pending: WAIT } },
  { k: "tukar_faktur", l: "Tukar Faktur", badge: { Done: OK, Pending: WAIT } },
  { k: "no_faktur_pajak", l: "No Faktur Pajak" },
  { k: "selisih", l: "Selisih", n: true }, { k: "keterangan", l: "Keterangan", edit: "text", w: 200 },
];

type Field<T> = { k: keyof T & string; l: string; t?: "number" | "date" };
const GR_EDIT: Field<RkmGr>[] = [
  { k: "no", l: "No" }, { k: "grpo_no", l: "No. GRPO" }, { k: "no_sj", l: "No. Pengiriman" }, { k: "tgl_grpo", l: "Tanggal GRPO", t: "date" },
  { k: "jumlah_grpo_grn", l: "Jumlah GRPO/GRN", t: "number" }, { k: "no_faktur_pajak", l: "No. Faktur Pajak" },
  { k: "tgl_pajak", l: "Tanggal Pajak", t: "date" }, { k: "jumlah", l: "Jumlah", t: "number" }, { k: "selisih", l: "Selisih", t: "number" },
  { k: "cabang", l: "Cabang" }, { k: "no_po", l: "No. PO" }, { k: "jumlah_grpo", l: "Jumlah GRPO", t: "number" },
  { k: "no_grn", l: "No. GRN" }, { k: "jumlah_grn", l: "Jumlah GRN", t: "number" },
];
const GR_COLS: LCol<RkmGrRow>[] = [
  ...GR_EDIT.map((f): LCol<RkmGrRow> => ({ k: f.k, l: f.l, n: f.t === "number", d: f.t === "date", edit: f.t ?? "text" })),
  { k: "aging_open", l: "Open Amt Aging", n: true }, { k: "check_status", l: "Check", badge: { Done: OK, Check: BAD } },
];
const KW_EDIT: Field<RkmKw>[] = [
  { k: "no", l: "No" }, { k: "grpo_no", l: "No. GRPO" }, { k: "tgl_grpo", l: "Tanggal GRPO", t: "date" }, { k: "cabang", l: "Cabang" },
  { k: "no_sj", l: "No. Pengiriman" }, { k: "no_po", l: "No. PO" }, { k: "jumlah_grpo", l: "Jumlah GRPO", t: "number" },
  { k: "no_grn", l: "No. GRN" }, { k: "total_grn", l: "Total GRN", t: "number" }, { k: "total_grpo_grn", l: "Total (GRPO-GRN)", t: "number" },
  { k: "tgl_faktur_pajak", l: "Tgl. Faktur Pajak", t: "date" }, { k: "no_faktur_pajak", l: "No. Faktur Pajak" },
  { k: "jumlah_faktur_pajak", l: "Jumlah Faktur Pajak", t: "number" }, { k: "selisih", l: "Selisih", t: "number" },
  { k: "pembuat", l: "Pembuat" }, { k: "tanggal_input", l: "Tanggal Input", t: "date" },
];
const KW_COLS: LCol<RkmKwRow>[] = [
  ...KW_EDIT.map((f): LCol<RkmKwRow> => ({ k: f.k, l: f.l, n: f.t === "number", d: f.t === "date", edit: f.t ?? "text" })),
  { k: "aging", l: "Open Amt Aging", n: true }, { k: "selisih_aging", l: "Selisih vs Aging", n: true },
];

type Table = "gr" | "kwitansi";
type AddKind = { table: Table; fields: Field<RkmGr>[] | Field<RkmKw>[] } | null;

// RKM Tukar Faktur (Anyar Retail Indonesia): tampilan sama dengan Mitra10, kunci No SJ.
// Semua rumus dihitung di browser (use-rkm); edit tampil seketika lalu disimpan di belakang layar.
export function RkmView() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("dash");
  const [ket, setKet] = useState("");
  const [add, setAdd] = useState<AddKind>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const m = useRkm();
  const c = m.computed;

  const fail = (e: unknown) => toast(`Gagal menyimpan: ${(e as Error).message}`, "danger", 6000);
  const save = async (table: Table, id: number | null, row: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc("rkm_row_save", { p_table: table, p_id: id, p_row: row as never });
    if (error) throw error;
    return data;
  };

  // Keterangan invoice bersama (sama dengan Collection, Mitra10 & Hold Faktur Pajak).
  function setKeterangan(rows: RkmRow[], text: string) {
    setRemarks(rows.map((r) => ({ no_sj: r.no_sj, invoice_no: r.invoice_no })), text, "rkm").catch(fail);
  }

  // Filter Kertas Kerja: rentang Invoice Date & Cabang.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cabang, setCabang] = useState("");
  const cabangs = useMemo(() => [...new Set((c?.worksheet ?? []).map((r) => r.cabang))].sort(), [c]);
  // Kertas Kerja hanya menampilkan invoice outstanding; yang sudah lunas otomatis hilang.
  const kkRows = useMemo(() => (c?.worksheet ?? []).filter((r) => r.status === "Outstanding" &&
    (!from || (r.invoice_date ?? "") >= from) && (!to || (r.invoice_date ?? "") <= to) && (!cabang || r.cabang === cabang)), [c, from, to, cabang]);

  function editRow(table: Table, id: number, key: string, value: unknown) {
    const v = key === "no_sj" && typeof value === "string" ? value.trim().toUpperCase() : value;
    optimistic("rkm", (d) => ({ ...d, [table]: (d[table] as { id: number }[]).map((r) => (r.id === id ? { ...r, [key]: v } : r)) }),
      () => save(table, id, { [key]: v })).catch(fail);
  }

  function deleteRows(table: Table, ids: number[]) {
    optimistic("rkm", (d) => ({ ...d, [table]: (d[table] as { id: number }[]).filter((r) => !ids.includes(r.id)) }),
      async () => {
        const { error } = await supabase.rpc("rkm_rows_delete", { p_table: table, p_ids: ids });
        if (error) throw error;
      }).catch(fail);
  }

  async function addRow() {
    if (!add) return;
    const row: Record<string, unknown> = {};
    for (const f of add.fields) {
      const v = (draft[f.k] ?? "").trim();
      row[f.k] = v === "" ? null : f.t === "number" ? Number(v.replace(/\./g, "").replace(",", ".")) : f.k === "no_sj" ? v.toUpperCase() : v;
    }
    const table = add.table;
    const tempId = -Date.now();
    setAdd(null);
    setDraft({});
    try {
      const id = await optimistic("rkm", (d) => ({ ...d, [table]: [...(d[table] as unknown[]), { id: tempId, ...row }] }), () => save(table, null, row));
      await optimistic("rkm", (d) => ({ ...d, [table]: (d[table] as { id: number }[]).map((r) => (r.id === tempId ? { ...r, id: Number(id) } : r)) }), async () => null);
      toast("Baris ditambahkan.", "success");
    } catch (e) { fail(e); }
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-medium">RKM Tukar Faktur</h1>
        <span className="text-sm text-fg-2">Tax Name: {m.taxName}</span>
        {m.error && <span className="text-sm text-danger">Gagal memuat: {m.error.message}</span>}
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === "dash" && <M10Dashboard m={m} showJadwal={false} />}
        {tab === "kk" && (
          <LocalTable title="Kertas Kerja" hideKey="rkm-kk" rows={kkRows} cols={KK_COLS} rowKey={(r) => r.id} loading={m.loading}
            search={["invoice_no", "business_partner", "bp_short", "no_sj", "no_po", "keterangan", "no_faktur_pajak"]}
            filters={[
              { k: "gr", l: "GR", options: ["Done", "Pending"] },
              { k: "tukar_faktur", l: "Tukar Faktur", options: ["Done", "Pending"] },
            ]}
            onEdit={(r, _k, v) => setKeterangan([r], String(v ?? ""))}
            toolbar={(
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-fg-2">Invoice Date</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} !w-auto`} />
                <span className="text-fg-2">s/d</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} !w-auto`} />
                <select value={cabang} onChange={(e) => setCabang(e.target.value)} className={`${inputCls} !w-auto`}>
                  <option value="">Cabang: semua</option>
                  {cabangs.map((u) => <option key={u}>{u}</option>)}
                </select>
                {(from || to || cabang) && <button type="button" className={btnGhost} onClick={() => { setFrom(""); setTo(""); setCabang(""); }}>Reset</button>}
              </span>
            )}
            selectable
            actions={(sel, clear) => (
              <span className="flex items-center gap-2">
                <input list="rkm-ket" value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Keterangan (kosong = hapus)" className={`${inputCls} !w-56`} />
                <datalist id="rkm-ket"><option value="LTKP" /><option value="Litigasi" /><option value="new inbox" /></datalist>
                <button type="button" className={btnGhost} onClick={() => { setKeterangan(sel, ket); clear(); }}>Simpan untuk {sel.length}</button>
              </span>
            )} />
        )}
        {tab === "gr" && (
          <LocalTable title="Receiving" hideKey="rkm-gr" rows={c?.gr ?? []} cols={GR_COLS} rowKey={(r) => r.id} loading={m.loading}
            search={["grpo_no", "no_sj", "cabang", "no_po", "no_grn", "no_faktur_pajak"]}
            filters={[{ k: "check_status", l: "Check", options: ["Done", "Check"] }]}
            onEdit={(r, k, v) => editRow("gr", r.id, k, v)}
            onAdd={() => setAdd({ table: "gr", fields: GR_EDIT })}
            selectable onDelete={(rows) => deleteRows("gr", rows.map((r) => r.id))} />
        )}
        {tab === "kw" && (
          <LocalTable title="Kwitansi" hideKey="rkm-kw" rows={c?.kwitansi ?? []} cols={KW_COLS} rowKey={(r) => r.id} loading={m.loading}
            search={["grpo_no", "no_sj", "cabang", "no_faktur_pajak", "pembuat", "no_po"]}
            onEdit={(r, k, v) => editRow("kwitansi", r.id, k, v)}
            onAdd={() => setAdd({ table: "kwitansi", fields: KW_EDIT })}
            selectable onDelete={(rows) => deleteRows("kwitansi", rows.map((r) => r.id))} />
        )}
        {tab === "upload" && <RkmUpload taxName={m.taxName} />}
      </div>

      <Modal open={!!add} title={add?.table === "gr" ? "Tambah baris GR" : "Tambah kwitansi"} onClose={() => setAdd(null)} wide
        footer={<button type="button" className={btnPrimary} onClick={addRow}>Simpan</button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {add?.fields.map((f) => (
            <label key={f.k} className="text-sm">
              <span className="text-fg-2">{f.l}</span>
              <input type={f.t === "date" ? "date" : "text"} value={draft[f.k] ?? ""} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
