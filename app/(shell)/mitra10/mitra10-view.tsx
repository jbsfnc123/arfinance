"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { optimistic } from "@/lib/local/store";
import { LocalTable, type LCol } from "@/lib/local/table";
import type { Gr, Kwitansi, Schedule } from "@/lib/local/datasets";
import type { GrRow, KwRow, WorksheetRow } from "@/lib/modules/m10/compute";
import { Tabs } from "@/components/tabs";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { M10Dashboard } from "./m10-dashboard";
import { M10Upload } from "./m10-upload";
import { useM10 } from "./use-m10";
import { setRemarks } from "@/lib/modules/remarks";

const TABS = [
  { key: "dash", label: "Dashboard", icon: "monitoring" },
  { key: "kk", label: "Kertas Kerja", icon: "table" },
  { key: "gr", label: "Receiving", icon: "inventory" },
  { key: "kw", label: "Kwitansi", icon: "receipt_long" },
  { key: "jadwal", label: "Jadwal Bayar", icon: "event" },
  { key: "upload", label: "Upload & Setting", icon: "upload_file" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const OK = "bg-success/20 text-success";
const WAIT = "bg-warning/20 text-warning";
const BAD = "bg-danger/20 text-danger";

const KK_COLS: LCol<WorksheetRow>[] = [
  { k: "username", l: "Username" }, { k: "bp_short", l: "Business Partner" }, { k: "invoice_no", l: "Invoice No" },
  { k: "invoice_date", l: "Invoice Date", d: true }, { k: "due_date", l: "Due Date", d: true }, { k: "open_amt", l: "Open Amt", n: true },
  { k: "no_po", l: "No PO" }, { k: "no_sj", l: "No SJ" },
  { k: "gr", l: "GR", badge: { Done: OK, Pending: WAIT } },
  { k: "tukar_faktur", l: "Tukar Faktur", badge: { Done: OK, Pending: WAIT } },
  { k: "selisih", l: "Selisih", n: true }, { k: "keterangan", l: "Keterangan", edit: "text", w: 200 },
  { k: "jadwal_bayar", l: "Jadwal Bayar", d: true },
];
const GR_EDIT: { k: keyof Gr & string; l: string; t?: "number" }[] = [
  { k: "store_no", l: "Store No" }, { k: "delivery_to", l: "Delivery To" }, { k: "gr_no", l: "GR No" }, { k: "gr_date", l: "GR Date" },
  { k: "po_no", l: "PO No" }, { k: "po_date", l: "PO Date" }, { k: "vendor_ship_no", l: "Vendor Ship No" }, { k: "item_code", l: "Item Code" },
  { k: "item_name", l: "Item Name" }, { k: "uom", l: "UOM" }, { k: "qty_order", l: "Qty Order", t: "number" },
  { k: "qty_received", l: "Qty Received", t: "number" }, { k: "status", l: "Status" }, { k: "sj_no", l: "SJ NO" },
];
const GR_COLS: LCol<GrRow>[] = [
  ...GR_EDIT.map((f): LCol<GrRow> => ({ k: f.k, l: f.l, n: f.t === "number", edit: f.t === "number" ? "number" : "text" })),
  { k: "po_aging", l: "PO Aging" }, { k: "check_status", l: "Check", badge: { Done: OK, Check: BAD } },
];
const KW_EDIT: { k: keyof Kwitansi & string; l: string; t?: "number" | "date" }[] = [
  { k: "username", l: "Username" }, { k: "invoice_no", l: "Invoice No" }, { k: "vendor_invoice_no", l: "Vendor Invoice No" },
  { k: "invoice_date", l: "Invoice Date", t: "date" }, { k: "kuitansi_no", l: "Kuitansi No" }, { k: "kuitansi_date", l: "Kuitansi Date", t: "date" },
  { k: "accepted_date", l: "Accepted Date", t: "date" }, { k: "pfi_no", l: "PFI No" }, { k: "gr_no", l: "GR No" }, { k: "po_no", l: "PO No" },
  { k: "total_net", l: "Total Net", t: "number" },
];
const KW_COLS: LCol<KwRow>[] = [
  ...KW_EDIT.map((f): LCol<KwRow> => ({ k: f.k, l: f.l, n: f.t === "number", d: f.t === "date", edit: f.t ?? "text" })),
  { k: "jadwal_bayar", l: "Jadwal Bayar", d: true }, { k: "aging", l: "Aging", n: true }, { k: "selisih", l: "Selisih", n: true },
];
const JADWAL_COLS: LCol<Schedule>[] = [
  { k: "no_kw", l: "NO KW" }, { k: "spp", l: "SPP" }, { k: "nilai_kw", l: "Nilai KW", n: true },
  { k: "tgl_tukar_faktur", l: "Tgl Tukar Faktur", d: true }, { k: "jadwal_transfer", l: "Jadwal Transfer", d: true }, { k: "notes", l: "Notes" },
];

type AddKind = { table: "gr" | "kwitansi"; fields: { k: string; l: string; t?: "number" | "date" }[] } | null;

// Port workbook "VBA Mitra10 Tukar Faktur.xlsm". Semua rumus dihitung di browser (use-m10);
// edit tampil seketika lalu disimpan ke server di belakang layar.
export function Mitra10View() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("dash");
  const [ket, setKet] = useState("");
  const [add, setAdd] = useState<AddKind>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const m = useM10();
  const c = m.computed;

  const fail = (e: unknown) => toast(`Gagal menyimpan: ${(e as Error).message}`, "danger", 6000);
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn as never, args as never);
    if (error) throw error;
    return data as unknown;
  };

  // Keterangan invoice bersama (sama dengan Collection & Hold Faktur Pajak).
  function setKeterangan(rows: WorksheetRow[], text: string) {
    setRemarks(rows.map((r) => ({ no_sj: r.no_sj, invoice_no: r.invoice_no })), text, "mitra10").catch(fail);
  }

  // Filter Kertas Kerja: rentang Invoice Date & Username.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [user, setUser] = useState("");
  const users = useMemo(() => [...new Set((c?.worksheet ?? []).map((r) => r.username))].sort(), [c]);
  // Kertas Kerja hanya menampilkan invoice outstanding; yang sudah lunas otomatis hilang.
  const kkRows = useMemo(() => (c?.worksheet ?? []).filter((r) => r.status === "Outstanding" &&
    (!from || (r.invoice_date ?? "") >= from) && (!to || (r.invoice_date ?? "") <= to) && (!user || r.username === user)), [c, from, to, user]);

  function editRow(table: "gr" | "kwitansi", id: number, key: string, value: unknown) {
    const fn = table === "gr" ? "m10_gr_save" : "m10_kw_save";
    optimistic("m10", (d) => ({ ...d, [table]: (d[table] as { id: number }[]).map((r) => (r.id === id ? { ...r, [key]: value } : r)) }),
      () => rpc(fn, { p_id: id, p_row: { [key]: value } })).catch(fail);
  }

  function deleteRows(table: "gr" | "kwitansi", ids: number[]) {
    optimistic("m10", (d) => ({ ...d, [table]: (d[table] as { id: number }[]).filter((r) => !ids.includes(r.id)) }),
      () => rpc("m10_rows_delete", { p_table: table, p_ids: ids })).catch(fail);
  }

  async function addRow() {
    if (!add) return;
    const row: Record<string, unknown> = {};
    for (const f of add.fields) {
      const v = (draft[f.k] ?? "").trim();
      row[f.k] = v === "" ? null : f.t === "number" ? Number(v.replace(/\./g, "").replace(",", ".")) : v;
    }
    const table = add.table;
    const tempId = -Date.now();
    setAdd(null);
    setDraft({});
    try {
      const id = await optimistic("m10", (d) => ({ ...d, [table]: [...(d[table] as unknown[]), { id: tempId, ...row }] }),
        () => rpc(table === "gr" ? "m10_gr_save" : "m10_kw_save", { p_id: null, p_row: row }));
      // Ganti id sementara dengan id dari server.
      await optimistic("m10", (d) => ({ ...d, [table]: (d[table] as { id: number }[]).map((r) => (r.id === tempId ? { ...r, id: Number(id) } : r)) }), async () => null);
      toast("Baris ditambahkan.", "success");
    } catch (e) { fail(e); }
  }

  const deleteSchedule = (rows: Schedule[]) =>
    optimistic("m10", (d) => ({ ...d, schedule: d.schedule.filter((s) => !rows.some((r) => r.no_kw === s.no_kw)) }),
      () => rpc("m10_schedule_delete", { p_no_kw: rows.map((r) => r.no_kw) })).catch(fail);

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-medium">Mitra10 Tukar Faktur</h1>
        {m.error && <span className="text-sm text-danger">Gagal memuat: {m.error.message}</span>}
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === "dash" && <M10Dashboard m={m} />}
        {tab === "kk" && (
          <LocalTable title="Kertas Kerja" hideKey="m10-kk" rows={kkRows} cols={KK_COLS} rowKey={(r) => r.id} loading={m.loading}
            search={["invoice_no", "business_partner", "bp_short", "no_sj", "no_po", "username", "keterangan"]}
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
                <select value={user} onChange={(e) => setUser(e.target.value)} className={`${inputCls} !w-auto`}>
                  <option value="">Username: semua</option>
                  {users.map((u) => <option key={u}>{u}</option>)}
                </select>
                {(from || to || user) && <button type="button" className={btnGhost} onClick={() => { setFrom(""); setTo(""); setUser(""); }}>Reset</button>}
              </span>
            )}
            selectable
            actions={(sel, clear) => (
              <span className="flex items-center gap-2">
                <input list="m10-ket" value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Keterangan (kosong = hapus)" className={`${inputCls} !w-56`} />
                <datalist id="m10-ket"><option value="LTKP" /><option value="Litigasi" /><option value="new inbox" /></datalist>
                <button type="button" className={btnGhost} onClick={() => { setKeterangan(sel, ket); clear(); }}>Simpan untuk {sel.length}</button>
              </span>
            )} />
        )}
        {tab === "gr" && (
          <LocalTable title="Receiving" hideKey="m10-gr" rows={c?.gr ?? []} cols={GR_COLS} rowKey={(r) => r.id} loading={m.loading}
            search={["gr_no", "po_no", "sj_no", "item_name", "delivery_to", "vendor_ship_no", "item_code"]}
            filters={[{ k: "check_status", l: "Check", options: ["Done", "Check"] }]}
            onEdit={(r, k, v) => editRow("gr", r.id, k, v)}
            onAdd={() => setAdd({ table: "gr", fields: GR_EDIT })}
            selectable onDelete={(rows) => deleteRows("gr", rows.map((r) => r.id))} />
        )}
        {tab === "kw" && (
          <LocalTable title="KW Update" hideKey="m10-kw" rows={c?.kwitansi ?? []} cols={KW_COLS} rowKey={(r) => r.id} loading={m.loading}
            search={["invoice_no", "vendor_invoice_no", "kuitansi_no", "po_no", "username"]}
            onEdit={(r, k, v) => editRow("kwitansi", r.id, k, v)}
            onAdd={() => setAdd({ table: "kwitansi", fields: KW_EDIT })}
            selectable onDelete={(rows) => deleteRows("kwitansi", rows.map((r) => r.id))} />
        )}
        {tab === "jadwal" && (
          <LocalTable title="Jadwal Bayar" rows={m.schedule} cols={JADWAL_COLS} rowKey={(r) => r.no_kw} loading={m.loading}
            search={["no_kw", "spp", "notes"]} selectable onDelete={deleteSchedule} />
        )}
        {tab === "upload" && <M10Upload version={0} onDone={() => undefined} />}
      </div>

      <Modal open={!!add} title={add?.table === "gr" ? "Tambah baris GR" : "Tambah kwitansi"} onClose={() => setAdd(null)} wide
        footer={<button type="button" className={btnPrimary} onClick={addRow}>Simpan</button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {add?.fields.map((f) => (
            <label key={f.k} className="text-sm">
              <span className="text-fg-2">{f.l}{add.table === "kwitansi" && f.k === "invoice_no" ? " *" : ""}</span>
              <input type={f.t === "date" ? "date" : "text"} value={draft[f.k] ?? ""} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
