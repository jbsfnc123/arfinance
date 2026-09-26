"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readAllSheets, readFirstSheetRows } from "@/lib/xlsx-client";
import { parseGrCsv, parseKwCsv, parseSchedule } from "@/lib/modules/m10/parse";
import { runUpload } from "@/lib/uploads/run";
import { todayJakarta } from "@/lib/parsers/date";
import { useToast } from "@/components/toast";
import { btnGhost, card, inputCls } from "@/components/ui";

type Kind = "aging" | "gr" | "kw" | "jadwal";
const CHUNK = 2000; // GR
const KW_USER_KEY = "m10.kwUsername";

// Upload file sumber (port tombol macro: Update Master Aging, Upload CSV + Update GR,
// Import Kwitansi) + tabel manual Jadwal bayar & BP → Username, dan setting Tax Name.
export function M10Upload({ onDone }: { version: number; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [taxName, setTaxName] = useState("");
  // Username terakhir disimpan per browser (dulu sel A1 sheet KW Update).
  const [kwUser, setKwUser] = useState(() => {
    try { return typeof window === "undefined" ? "" : localStorage.getItem(KW_USER_KEY) ?? ""; } catch { return ""; }
  });

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "m10_tax_name").maybeSingle()
      .then(({ data }) => setTaxName(String(data?.value ?? "Catur Mitra Sejati Sentosa")));
  }, [supabase]);

  async function run(kind: Kind, file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    try {
      let msg = "";
      if (kind === "aging") {
        // Laporan aging bersama: disimpan sekali, dipakai Collection, Mitra10, Presentasi.
        const r = await runUpload(supabase, "aging", file, await readAllSheets(file));
        msg = r.message;
      } else if (kind === "gr") {
        const { rows, lines, sjCount } = parseGrCsv(await file.text(), Number(todayJakarta().slice(0, 4)));
        let added = 0;
        for (let i = 0; i < rows.length || i === 0; i += CHUNK) {
          const { data, error } = await supabase.rpc("m10_gr_add", { p_rows: rows.slice(i, i + CHUNK), p_file_name: file.name, p_first: i === 0 });
          if (error) throw error;
          added += data ?? 0;
        }
        msg = `GR: ${lines} baris CSV, ${sjCount} SJ NO dibuat, ${added} data baru ditambahkan (sisanya sudah ada).`;
      } else if (kind === "kw") {
        try { localStorage.setItem(KW_USER_KEY, kwUser); } catch { /* abaikan */ }
        const { rows, dupInFile } = parseKwCsv(await file.text());
        const { data, error } = await supabase.rpc("m10_kw_add", { p_rows: rows, p_username: kwUser, p_file_name: file.name });
        if (error) throw error;
        const r = data as { added: number; skipped: number };
        msg = `Kwitansi (${kwUser || "-"}): ${r.added} baru, ${r.skipped + dupInFile} sudah ada.`;
      } else if (kind === "jadwal") {
        const rows = parseSchedule(await readFirstSheetRows(file));
        const { data, error } = await supabase.rpc("m10_schedule_upsert", { p_rows: rows, p_file_name: file.name });
        if (error) throw error;
        msg = `Jadwal bayar: ${data} No KW disimpan/diperbarui.`;
      }
      toast(msg, "success", 9000);
      onDone();
    } catch (e) {
      toast(`Gagal: ${(e as Error).message}`, "danger", 9000);
    } finally {
      setBusy(null);
    }
  }

  async function saveTax() {
    const { error } = await supabase.rpc("m10_set_tax_name", { p_value: taxName });
    toast(error ? `Gagal: ${error.message}` : "Tax Name disimpan.", error ? "danger" : "success");
  }

  const fileInput = (kind: Kind, accept: string) => (
    <>
      <input type="file" accept={accept} disabled={busy !== null} key={busy === kind ? "busy" : "idle"}
        onChange={(e) => run(kind, e.target.files?.[0])} className={inputCls} />
      {busy === kind && <p className="text-sm text-accent">Memproses…</p>}
    </>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={`${card} space-y-3 p-4`}>
        <h2 className="font-medium">1. Update Master Aging</h2>
        <p className="text-xs text-fg-2">File MASTER AGING / Blank_A4 — laporan yang sama dengan Update Tagihan, cukup di-upload sekali (di sini atau di Pusat Upload). Mitra10 membaca baris dengan Tax Name di bawah; No SJ baru otomatis masuk Kertas Kerja dan invoice yang hilang dari aging berstatus Lunas.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input value={taxName} onChange={(e) => setTaxName(e.target.value)} className={inputCls} placeholder="Filter Tax Name" />
          <button type="button" className={btnGhost} onClick={saveTax}>Simpan</button>
        </div>
        {fileInput("aging", ".xls,.xlsx,.xlsm,.xlsb")}
      </div>

      <div className={`${card} space-y-3 p-4`}>
        <h2 className="font-medium">2. Upload CSV GR</h2>
        <p className="text-xs text-fg-2">GR_Report_Detail.csv (pemisah &quot;;&quot;). SJ NO dibentuk dari Vendor Ship No (SJ/00000/tahun romawi/TRA), lalu baris baru (GR No + Item Code belum ada) ditambahkan ke GR Update.</p>
        {fileInput("gr", ".csv")}
      </div>

      <div className={`${card} space-y-3 p-4`}>
        <h2 className="font-medium">3. Import Kwitansi</h2>
        <p className="text-xs text-fg-2">Invoice_Summary.csv (pemisah &quot;;&quot;). Invoice No yang sudah ada dilewati.</p>
        <input value={kwUser} onChange={(e) => setKwUser(e.target.value)} className={inputCls} placeholder="Username portal (mis. PENGU338)" />
        {fileInput("kw", ".csv")}
      </div>

      <div className={`${card} space-y-3 p-4`}>
        <h2 className="font-medium">4. Jadwal Bayar</h2>
        <p className="text-xs text-fg-2">Excel dengan header NO KW, SPP, NILAI KW, TGL TUKAR FAKTUR, JADWAL TRANSFER, Notes. No KW yang sudah ada diperbarui.</p>
        {fileInput("jadwal", ".xlsx,.xls,.csv")}
      </div>

    </div>
  );
}
