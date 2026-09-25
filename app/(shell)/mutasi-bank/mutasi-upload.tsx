"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { downloadXlsx, readAllSheets } from "@/lib/xlsx-client";
import { TEMPLATES } from "@/lib/modules/mutasi/parse";
import { detectKind, type FileKind } from "@/lib/uploads/parse";
import { runUpload } from "@/lib/uploads/run";
import { todayJakarta } from "@/lib/parsers/date";
import { ImportLog } from "@/components/import-log";
import { useToast } from "@/components/toast";
import { btnGhost, card, inputCls } from "@/components/ui";

type Box = "mutasi" | "erp" | "target";
const EXPECT: Record<Box, FileKind> = { mutasi: "mutasi", erp: "erp", target: "target" };
const TEMPLATE_OF: Record<Box, keyof typeof TEMPLATES> = { mutasi: "mutasi", erp: "erp", target: "target" };

// Upload data Mutasi Bank (port mdlImport.bas). Invoice & Payment kini satu laporan ERP bersama
// (juga dipakai Presentasi & Marketplace) — disimpan sekali lewat jalur Pusat Upload.
export function MutasiUpload({ version, onDone }: { version: number; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [busy, setBusy] = useState<Box | null>(null);
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));

  async function run(box: Box, files: File[]) {
    if (!files.length) return;
    setBusy(box);
    try {
      const msgs: string[] = [];
      for (const f of files) {
        const sheets = await readAllSheets(f);
        const kind = detectKind(sheets);
        if (kind !== EXPECT[box]) throw new Error(`${f.name}: bukan file ${box === "erp" ? "Invoice/Payment" : box} (terdeteksi: ${kind ?? "tidak dikenali"})`);
        const r = await runUpload(supabase, kind, f, sheets, { month });
        msgs.push(`${f.name}: ${r.message}`);
      }
      toast(msgs.join("\n"), "success", 8000);
      onDone();
    } catch (e) {
      toast(`Gagal: ${(e as Error).message}`, "danger", 8000);
    } finally {
      setBusy(null);
    }
  }

  const box = (b: Box, title: string, note: string, multi: boolean, extra?: React.ReactNode) => (
    <div className={`${card} space-y-3 p-4`}>
      <div className="flex items-center gap-2">
        <h2 className="font-medium">{title}</h2>
        <button type="button" className={`${btnGhost} ml-auto !text-xs`} onClick={() => downloadXlsx(`Template ${title}.xlsx`, "Template", TEMPLATES[TEMPLATE_OF[b]])}>
          <span className="material-symbols-outlined !text-base">download</span>Template
        </button>
      </div>
      <p className="text-xs text-fg-2">{note}</p>
      {extra}
      <input type="file" accept=".xlsx,.xls,.xlsm" multiple={multi} disabled={busy !== null}
        key={busy === b ? "busy" : "idle"}
        onChange={(e) => run(b, [...(e.target.files ?? [])])} className={inputCls} />
      {busy === b && <p className="text-sm text-accent">Memproses…</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {box("mutasi", "Mutasi Rekening",
          "Boleh beberapa file & beberapa sheet. Rekening dikenali dari 4 digit terakhir (nama sheet atau baris \"No. rekening :\"). Hanya baris CR yang disimpan; \"SWITCHING PENGUIN\" diabaikan. Tanggal yang tercakup file/Periode diganti.", true)}
        {box("erp", "Invoice & Payment",
          "Laporan ERP \"Invoice and Payment Date Comparison\" (per tanggal invoice atau per tanggal payment), atau file berheader Invoice No., Invoice Amount, Invoice Date / Payment Document, Payment Amount, Payment Date. Data yang sama juga dipakai Presentasi & Marketplace — upload sekali saja.", true)}
        {box("target", "Target",
          "Header: Invoice No, Open Amt. Mengganti seluruh target bulan terpilih (tabel target yang sama dengan Dashboard Controller).", false,
          <label className="block text-sm">
            <span className="text-fg-2">Bulan target</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} mt-1`} />
          </label>)}
      </div>
      <ImportLog module={["data", "mutasi", "collection"]} version={version} />
    </div>
  );
}
