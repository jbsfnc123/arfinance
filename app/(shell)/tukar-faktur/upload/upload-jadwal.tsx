"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readFirstSheetRows } from "@/lib/xlsx-client";
import { mergeSchedule, parseAgingLookup, parseMasterCsv, type ScheduleRow } from "@/lib/modules/tukar/schedule";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnPrimary, card, inputCls } from "@/components/ui";

export function UploadJadwal() {
  const toast = useToast();
  const [master, setMaster] = useState<{ file: File; rows: ScheduleRow[]; skipped: number } | null>(null);
  const [aging, setAging] = useState<{ file: File; size: number; map: ReturnType<typeof parseAgingLookup> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  async function pickMaster(f: File | null) {
    setMaster(null);
    if (!f) return;
    const res = parseMasterCsv(await f.text());
    if (!res.rows.length) return toast("Format tanggal dd/MM/yyyy tidak cocok pada kolom P, atau file kosong.", "danger");
    setMaster({ file: f, rows: res.rows, skipped: res.skipped });
  }

  async function pickAging(f: File | null) {
    setAging(null);
    if (!f) return;
    try {
      const map = parseAgingLookup(await readFirstSheetRows(f));
      setAging({ file: f, size: map.size, map });
    } catch (e) {
      toast(`Gagal membaca file aging: ${(e as Error).message}`, "danger");
    }
  }

  const merged = master ? mergeSchedule(master.rows, aging?.map ?? null) : [];
  const dates = [...new Set(merged.map((r) => r.send_date).filter(Boolean))].sort() as string[];
  const matched = aging ? merged.filter((r) => aging.map.has(r.invoice_no)).length : 0;

  async function save() {
    if (!master) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("schedule_replace", {
      p_rows: merged,
      p_file_name: [master.file.name, aging?.file.name].filter(Boolean).join(" + "),
    });
    setBusy(false);
    if (error) return toast(`Gagal menyimpan: ${error.message}`, "danger", 6000);
    toast(`Berhasil! ${data} invoice tersinkronisasi ke jadwal kurir.`, "success", 6000);
    setMaster(null);
    setAging(null);
    setResetKey((k) => k + 1);
  }

  return (
    <div className={`${card} mt-6 space-y-4 p-5`} key={resetKey}>
      <label className="block text-sm">
        <span className="font-medium">1. Data Master Kirim (.csv)</span>
        <input type="file" accept=".csv" onChange={(e) => pickMaster(e.target.files?.[0] ?? null)} className={`${inputCls} mt-1`} />
        <span className="mt-1 block text-xs text-fg-2">Data mulai baris 6. Kolom B = Send Date, H = Business Partner, O = No Invoice, P = Date Invoice (dd/MM/yyyy).</span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">2. Data Aging (.xls / .xlsx / .csv) — opsional</span>
        <input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => pickAging(e.target.files?.[0] ?? null)} className={`${inputCls} mt-1`} />
        <span className="mt-1 block text-xs text-fg-2">
          Bila dikosongkan, Payment Group, Marketing, dan Open Amt diambil dari data tagihan terakhir (Update Tagihan).
        </span>
      </label>

      {master && (
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <b>{merged.length.toLocaleString("id-ID")}</b> invoice · {dates.length} tanggal kirim
          {dates.length > 0 && ` (${fmtDate(dates[0])} – ${fmtDate(dates.at(-1))})`}
          {master.skipped > 0 && <span className="text-fg-2"> · {master.skipped} baris dilewati</span>}
          {aging && <div className="mt-1 text-xs text-fg-2">{matched} invoice cocok dengan file aging ({aging.size} baris).</div>}
        </div>
      )}

      <button type="button" className={btnPrimary} disabled={!master || busy} onClick={save}>
        <span className="material-symbols-outlined">sync</span>
        {busy ? "Menyimpan…" : "Proses & Sinkronisasi Jadwal"}
      </button>
    </div>
  );
}
