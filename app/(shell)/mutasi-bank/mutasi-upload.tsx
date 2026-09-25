"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { downloadXlsx, readAllSheets, readFirstSheetRows } from "@/lib/xlsx-client";
import { parseInvoiceFile, parseMutasiWorkbook, parsePaymentFile, TEMPLATES } from "@/lib/modules/mutasi/parse";
import { parseTarget } from "@/lib/modules/collection/parse-target";
import { todayJakarta } from "@/lib/parsers/date";
import { monthLabel } from "@/lib/format";
import { ImportLog } from "@/components/import-log";
import { useToast } from "@/components/toast";
import { btnGhost, card, inputCls } from "@/components/ui";

type Kind = keyof typeof TEMPLATES;

// Upload 4 jenis file (port mdlImport.bas). Upload ulang file yang sama tidak menggandakan data.
export function MutasiUpload({ version, onDone }: { version: number; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));

  async function run(kind: Kind, files: File[]) {
    if (!files.length) return;
    setBusy(kind);
    try {
      const msgs: string[] = [];
      for (const f of files) {
        if (kind === "mutasi") {
          const { data: accounts, error: e1 } = await supabase.from("bank_accounts").select("code, last4").eq("active", true);
          if (e1) throw e1;
          const res = parseMutasiWorkbook(await readAllSheets(f), accounts ?? []);
          const { data, error } = await supabase.rpc("mutasi_import", { p_sheets: res.sheets, p_file_name: f.name });
          if (error) throw error;
          msgs.push(`${f.name}: ${data} baris CR (${res.sheets.map((s) => s.account).join(", ")})` +
            (res.ignored.length ? ` · sheet diabaikan: ${res.ignored.join(", ")}` : ""));
        } else if (kind === "invoice") {
          const rows = parseInvoiceFile(await readFirstSheetRows(f));
          const { data, error } = await supabase.rpc("erp_invoice_import", { p_rows: rows, p_file_name: f.name });
          if (error) throw error;
          msgs.push(`${f.name}: ${data} invoice`);
        } else if (kind === "payment") {
          const rows = parsePaymentFile(await readFirstSheetRows(f));
          const { data, error } = await supabase.rpc("erp_payment_import", { p_rows: rows, p_file_name: f.name });
          if (error) throw error;
          msgs.push(`${f.name}: ${data} payment`);
        } else {
          const parsed = parseTarget(await readFirstSheetRows(f));
          if (!parsed.rows.length) throw new Error("Header 'Invoice No / Open Amt' tidak ditemukan atau file kosong.");
          const { data, error } = await supabase.rpc("ar_target_replace", { p_month: month, p_rows: parsed.rows, p_file_name: f.name });
          if (error) throw error;
          msgs.push(`Target ${monthLabel(month)}: ${data} invoice`);
        }
      }
      toast(msgs.join("\n"), "success", 8000);
      onDone();
    } catch (e) {
      toast(`Gagal: ${(e as Error).message}`, "danger", 8000);
    } finally {
      setBusy(null);
    }
  }

  const box = (kind: Kind, title: string, note: string, multi: boolean, extra?: React.ReactNode) => (
    <div className={`${card} space-y-3 p-4`}>
      <div className="flex items-center gap-2">
        <h2 className="font-medium">{title}</h2>
        <button type="button" className={`${btnGhost} ml-auto !text-xs`} onClick={() => downloadXlsx(`Template ${title}.xlsx`, title, TEMPLATES[kind])}>
          <span className="material-symbols-outlined !text-base">download</span>Template
        </button>
      </div>
      <p className="text-xs text-fg-2">{note}</p>
      {extra}
      <input type="file" accept=".xlsx,.xls,.xlsm" multiple={multi} disabled={busy !== null}
        key={busy === kind ? "busy" : "idle"}
        onChange={(e) => run(kind, [...(e.target.files ?? [])])} className={inputCls} />
      {busy === kind && <p className="text-sm text-accent">Memproses…</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {box("mutasi", "Mutasi Rekening",
          "Boleh beberapa file & beberapa sheet. Rekening dikenali dari 4 digit terakhir (nama sheet atau baris \"No. rekening :\"). Hanya baris CR yang disimpan; \"SWITCHING PENGUIN\" diabaikan. Tanggal yang tercakup file/Periode diganti.", true)}
        {box("invoice", "Invoice",
          "Header: Invoice No., Invoice Amount, Invoice Date. Baris lama dengan tanggal atau nomor invoice yang sama diganti.", true)}
        {box("payment", "Payment",
          "Header: Invoice No., Payment Document, Payment Amount, Payment Date. Semua payment pada tanggal yang ada di file diganti.", true)}
        {box("target", "Target",
          "Header: Invoice No, Open Amt. Mengganti seluruh target bulan terpilih (tabel target yang sama dengan Dashboard Controller).", false,
          <label className="block text-sm">
            <span className="text-fg-2">Bulan target</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} mt-1`} />
          </label>)}
      </div>
      <ImportLog module="mutasi" version={version} />
    </div>
  );
}
