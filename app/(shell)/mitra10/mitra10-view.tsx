"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs } from "@/components/tabs";
import { useToast } from "@/components/toast";
import { btnGhost, inputCls } from "@/components/ui";
import { PagedTable, type PCol } from "./paged-table";
import { M10Dashboard } from "./m10-dashboard";
import { M10Upload } from "./m10-upload";

const TABS = [
  { key: "dash", label: "Dashboard", icon: "monitoring" },
  { key: "kk", label: "Kertas Kerja", icon: "table" },
  { key: "gr", label: "GR Update", icon: "inventory" },
  { key: "kw", label: "Kwitansi", icon: "receipt_long" },
  { key: "jadwal", label: "Jadwal Bayar", icon: "event" },
  { key: "aging", label: "Data Aging", icon: "hourglass_bottom" },
  { key: "upload", label: "Upload & Setting", icon: "upload_file" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const OK = "bg-success/20 text-success";
const WAIT = "bg-warning/20 text-warning";
const BAD = "bg-danger/20 text-danger";

const KK_COLS: PCol[] = [
  { k: "username", l: "Username" }, { k: "business_partner", l: "Business Partner" }, { k: "invoice_no", l: "Invoice No" },
  { k: "invoice_date", l: "Invoice Date", d: true }, { k: "due_date", l: "Due Date", d: true }, { k: "open_amt", l: "Open Amt", n: true },
  { k: "branch", l: "Branch" }, { k: "no_po", l: "No PO" }, { k: "no_sj", l: "No SJ" },
  { k: "gr", l: "GR", badge: { Done: OK, Pending: WAIT } },
  { k: "tukar_faktur", l: "Tukar Faktur", badge: { Done: OK, Pending: WAIT } },
  { k: "selisih", l: "Selisih", n: true }, { k: "keterangan", l: "Keterangan" },
  { k: "status", l: "Status", badge: { Outstanding: WAIT, Lunas: OK } },
  { k: "jadwal_bayar", l: "Jadwal Bayar", d: true }, { k: "lama_tf", l: "Lama TF (hari)", n: true },
];
const GR_COLS: PCol[] = [
  { k: "store_no", l: "Store No" }, { k: "delivery_to", l: "Delivery To" }, { k: "gr_no", l: "GR No" }, { k: "gr_date", l: "GR Date" },
  { k: "po_no", l: "PO No" }, { k: "po_date", l: "PO Date" }, { k: "vendor_ship_no", l: "Vendor Ship No" }, { k: "item_code", l: "Item Code" },
  { k: "item_name", l: "Item Name" }, { k: "uom", l: "UOM" }, { k: "qty_order", l: "Qty Order", n: true }, { k: "qty_received", l: "Qty Received", n: true },
  { k: "status", l: "Status" }, { k: "sj_no", l: "SJ NO" }, { k: "po_aging", l: "PO Aging" },
  { k: "check_status", l: "Check", badge: { Done: OK, Check: BAD } },
];
const KW_COLS: PCol[] = [
  { k: "username", l: "Username" }, { k: "invoice_no", l: "Invoice No" }, { k: "vendor_invoice_no", l: "Vendor Invoice No" },
  { k: "invoice_date", l: "Invoice Date", d: true }, { k: "kuitansi_no", l: "Kuitansi No" }, { k: "kuitansi_date", l: "Kuitansi Date", d: true },
  { k: "accepted_date", l: "Accepted Date", d: true }, { k: "pfi_no", l: "PFI No" }, { k: "gr_no", l: "GR No" }, { k: "po_no", l: "PO No" },
  { k: "total_net", l: "Total Net", n: true }, { k: "jadwal_bayar", l: "Jadwal Bayar", d: true }, { k: "aging", l: "Aging", n: true },
  { k: "selisih", l: "Selisih", n: true },
];
const JADWAL_COLS: PCol[] = [
  { k: "no_kw", l: "NO KW" }, { k: "spp", l: "SPP" }, { k: "nilai_kw", l: "Nilai KW", n: true },
  { k: "tgl_tukar_faktur", l: "Tgl Tukar Faktur", d: true }, { k: "jadwal_transfer", l: "Jadwal Transfer", d: true }, { k: "notes", l: "Notes" },
];
const AGING_COLS: PCol[] = [
  { k: "payment_group", l: "Payment Group" }, { k: "business_partner", l: "Business Partner" }, { k: "invoice_no", l: "Invoice No" },
  { k: "invoice_date", l: "Invoice Date", d: true }, { k: "due_date", l: "Due Date", d: true }, { k: "open_amt", l: "Open Amt", n: true },
  { k: "days", l: "Days", n: true }, { k: "branch", l: "Branch" }, { k: "no_po", l: "No PO" }, { k: "no_sj", l: "No SJ" },
];

// Port workbook "VBA Mitra10 Tukar Faktur.xlsm".
export function Mitra10View() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("dash");
  const [version, setVersion] = useState(0);
  const [ket, setKet] = useState("");
  const bump = () => setVersion((v) => v + 1);

  async function setKeterangan(ids: number[], clear: () => void) {
    const { data, error } = await supabase.rpc("m10_set_keterangan", { p_ids: ids, p_text: ket });
    if (error) return toast(`Gagal: ${error.message}`, "danger");
    toast(`Keterangan ${data} invoice diperbarui.`, "success");
    clear();
    bump();
  }

  async function deleteSchedule(noKw: string[], clear: () => void) {
    if (!confirm(`Hapus ${noKw.length} jadwal bayar?`)) return;
    const { error } = await supabase.rpc("m10_schedule_delete", { p_no_kw: noKw });
    if (error) return toast(`Gagal: ${error.message}`, "danger");
    clear();
    bump();
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <h1 className="text-2xl font-medium">Mitra10 Tukar Faktur</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === "dash" && <M10Dashboard version={version} />}
        {tab === "kk" && (
          <PagedTable source="v_m10_worksheet" title="Kertas Kerja" cols={KK_COLS} version={version} order="invoice_date"
            search={["invoice_no", "business_partner", "no_sj", "no_po", "username", "keterangan"]}
            filters={[
              { k: "status", l: "Status", options: ["Outstanding", "Lunas"] },
              { k: "gr", l: "GR", options: ["Done", "Pending"] },
              { k: "tukar_faktur", l: "Tukar Faktur", options: ["Done", "Pending"] },
            ]}
            selectable
            actions={(sel, clear) => (
              <span className="flex items-center gap-2">
                <input list="m10-ket" value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Keterangan (kosong = hapus)" className={`${inputCls} !w-56`} />
                <datalist id="m10-ket"><option value="LTKP" /><option value="Litigasi" /><option value="new inbox" /></datalist>
                <button type="button" className={btnGhost} onClick={() => setKeterangan(sel.map((r) => r.id as number), clear)}>Simpan untuk {sel.length}</button>
              </span>
            )} />
        )}
        {tab === "gr" && (
          <PagedTable source="v_m10_gr" title="GR Update" cols={GR_COLS} version={version}
            search={["gr_no", "po_no", "sj_no", "item_name", "delivery_to", "vendor_ship_no"]}
            filters={[{ k: "check_status", l: "Check", options: ["Done", "Check"] }]} />
        )}
        {tab === "kw" && (
          <PagedTable source="v_m10_kwitansi" title="KW Update" cols={KW_COLS} version={version}
            search={["invoice_no", "vendor_invoice_no", "kuitansi_no", "po_no", "username"]} />
        )}
        {tab === "jadwal" && (
          <PagedTable source="m10_payment_schedule" title="Jadwal Bayar" cols={JADWAL_COLS} version={version} order="jadwal_transfer"
            search={["no_kw", "spp", "notes"]} selectable rowKey="no_kw"
            actions={(sel, clear) => (
              <button type="button" className={btnGhost} onClick={() => deleteSchedule(sel.map((r) => r.no_kw as string), clear)}>
                <span className="material-symbols-outlined !text-base">delete</span>Hapus {sel.length}
              </button>
            )} />
        )}
        {tab === "aging" && (
          <PagedTable source="m10_aging" title="Data Aging" cols={AGING_COLS} version={version}
            search={["invoice_no", "business_partner", "no_sj", "no_po"]} />
        )}
        {tab === "upload" && <M10Upload version={version} onDone={bump} />}
      </div>
    </div>
  );
}
