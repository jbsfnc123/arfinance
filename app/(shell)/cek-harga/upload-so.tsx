"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseSo } from "@/lib/modules/cekharga/cekharga";
import { useToast } from "@/components/toast";
import { btnPrimary, card, inputCls } from "@/components/ui";

const CHUNK = 2000;

export function UploadSo() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [partners, setPartners] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  async function upload() {
    if (!file) return toast("Pilih file Excel terlebih dahulu.", "warning");
    setBusy("Membaca file Excel…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      if (!wb.SheetNames.includes("Sheet0")) throw new Error('Tab "Sheet0" tidak ditemukan dalam file Excel.');
      const rows = parseSo(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Sheet0, { header: 1, raw: true, defval: "" }), {
        partnerPrefixes: partners, status,
      });
      if (!rows.length) return toast("Tidak ada data yang cocok dengan kriteria filter.", "info");

      const supabase = createClient();
      for (let i = 0; i < rows.length; i += CHUNK) {
        setBusy(`Menyimpan ${Math.min(i + CHUNK, rows.length).toLocaleString("id-ID")} / ${rows.length.toLocaleString("id-ID")} baris…`);
        const { error } = await supabase.rpc("so_master_load", { p_rows: rows.slice(i, i + CHUNK), p_reset: i === 0, p_file_name: file.name });
        if (error) throw error;
      }
      toast(`Berhasil: ${rows.length.toLocaleString("id-ID")} baris SO tersimpan ke MASTER.`, "success", 6000);
      setFile(null);
      setResetKey((k) => k + 1);
    } catch (e) {
      toast(`Gagal memproses file: ${(e as Error).message}`, "danger", 6000);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`${card} max-w-2xl space-y-3 p-5`} key={resetKey}>
      <p className="text-sm text-fg-2">
        File Excel SO dari ERP (tab <b>Sheet0</b>). Kolom yang dibaca: Document No, Date PO, No PO Customer (atau no_po),
        Business Partner, Price List, Document Status, Grand Total. Data MASTER lama diganti seluruhnya.
      </p>
      <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inputCls} />
      <label className="block text-sm">
        <span className="text-fg-2">Filter awalan Business Partner (pisahkan koma, kosongkan = semua)</span>
        <input value={partners} onChange={(e) => setPartners(e.target.value)} placeholder="mis. Catur Mitra, RKM" className={`${inputCls} mt-1`} />
      </label>
      <label className="block text-sm">
        <span className="text-fg-2">Filter Document Status (persis, kosongkan = semua)</span>
        <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="mis. Completed" className={`${inputCls} mt-1`} />
      </label>
      <button type="button" className={btnPrimary} disabled={!file || !!busy} onClick={upload}>
        <span className="material-symbols-outlined">upload</span>{busy ?? "Upload & Proses ke MASTER"}
      </button>
    </div>
  );
}
