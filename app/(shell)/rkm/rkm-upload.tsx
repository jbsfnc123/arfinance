"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readAllSheets, readFirstSheetRows } from "@/lib/xlsx-client";
import { parseRkmGr, parseRkmKw } from "@/lib/modules/rkm/parse";
import { AgingPeriodFields } from "@/components/aging-period-fields";
import { todayJakarta } from "@/lib/parsers/date";
import { runUpload } from "@/lib/uploads/run";
import { useToast } from "@/components/toast";
import { btnGhost, card, inputCls } from "@/components/ui";

type Kind = "aging" | "gr" | "kw";

// Upload RKM: aging bersama (Tax Name), file GR RKM & Kwitansi RKM dari portal (ganti seluruh isi).
export function RkmUpload({ taxName: initialTax }: { taxName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [agingMonth,setAgingMonth]=useState(todayJakarta().slice(0,7));
  const [agingDate,setAgingDate]=useState("");
  const [busy, setBusy] = useState<Kind | null>(null);
  const [taxName, setTaxName] = useState(initialTax);

  async function run(kind: Kind, file: File | undefined) {
    if (!file) return;
    if (kind !== "aging" && !window.confirm(`Upload akan MENGGANTI seluruh data ${kind === "gr" ? "GR" : "Kwitansi"} RKM dengan isi file ini. Lanjutkan?`)) return;
    setBusy(kind);
    try {
      let msg = "";
      if (kind === "aging") {
        // Laporan aging bersama: disimpan sekali, dipakai Collection, Mitra10, RKM, Presentasi.
        const r = await runUpload(supabase, "aging", file, await readAllSheets(file), {month:agingMonth,reportDate:agingDate});
        msg = r.message;
      } else {
        const rows = await readFirstSheetRows(file);
        const parsed = kind === "gr" ? parseRkmGr(rows) : parseRkmKw(rows);
        if (!parsed.length) throw new Error("File tidak berisi baris data.");
        const { data, error } = await supabase.rpc(kind === "gr" ? "rkm_gr_replace" : "rkm_kw_replace",
          { p_rows: parsed as never, p_file_name: file.name });
        if (error) throw error;
        msg = `${kind === "gr" ? "GR" : "Kwitansi"} RKM: ${data} baris disimpan (data lama diganti).`;
      }
      toast(msg, "success", 9000);
    } catch (e) {
      toast(`Gagal: ${(e as Error).message}`, "danger", 9000);
    } finally {
      setBusy(null);
    }
  }

  async function saveTax() {
    const { data, error } = await supabase.rpc("rkm_set_tax_name", { p_value: taxName });
    toast(error ? `Gagal: ${error.message}` : `Tax Name disimpan. ${data} SJ baru masuk Kertas Kerja.`, error ? "danger" : "success");
  }

  const fileInput = (kind: Kind, accept: string) => (
    <>
      <input type="file" accept={accept} disabled={busy !== null} key={busy === kind ? "busy" : "idle"}
        onChange={(e) => run(kind, e.target.files?.[0])} className={inputCls} />
      {busy === kind && <p className="text-sm text-accent">Memproses…</p>}
    </>
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className={`${card} space-y-3 p-4`}>
        <h2 className="font-medium">1. Update Master Aging</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input value={taxName} onChange={(e) => setTaxName(e.target.value)} className={inputCls} placeholder="Filter Tax Name" />
          <button type="button" className={btnGhost} onClick={saveTax}>Simpan</button>
        </div>
        <AgingPeriodFields month={agingMonth} date={agingDate} onMonth={setAgingMonth} onDate={setAgingDate} disabled={busy!==null} />
        {fileInput("aging", ".xls,.xlsx,.xlsm,.xlsb")}
      </div>

      <div className={`${card} space-y-3 p-4`}>
        <h2 className="font-medium">2. Upload GR RKM (Receiving)</h2>
        <p className="text-xs"><b className="text-warning">Mengganti seluruh isi Receiving.</b></p>
        {fileInput("gr", ".xlsx,.xls")}
      </div>

      <div className={`${card} space-y-3 p-4`}>
        <h2 className="font-medium">3. Upload Kwitansi RKM</h2>
        <p className="text-xs"><b className="text-warning">Mengganti seluruh isi Kwitansi.</b></p>
        {fileInput("kw", ".xlsx,.xls")}
      </div>
    </div>
  );
}
