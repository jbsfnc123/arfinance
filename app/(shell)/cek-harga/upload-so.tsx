"use client";

import { useState } from "react";
import { parseSo } from "@/lib/modules/cekharga/cekharga";
import { fmtTimestamp } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { CekHargaLocal } from "./use-local";

// Upload SO (Fase 83): dibaca & disimpan di browser ini saja — tidak ada data yang dikirim ke server.
export function UploadSo({ local }: { local: CekHargaLocal }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [partners, setPartners] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const so = local.so;

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
      setBusy("Menyimpan di browser…");
      await local.setSo({ rows, fileName: file.name, at: new Date().toISOString(), partners: partners.trim(), status: status.trim() });
      toast(`Berhasil: ${rows.length.toLocaleString("id-ID")} baris SO tersimpan di browser ini.`, "success", 6000);
      setFile(null);
      setResetKey((k) => k + 1);
    } catch (e) {
      toast(`Gagal memproses file: ${(e as Error).message}`, "danger", 6000);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className={`${card} flex flex-wrap items-center gap-3 p-4 text-sm`} aria-live="polite">
        <Icon name={so ? "check_circle" : "help"} size={20} className={so ? "text-success" : "text-fg-2"} />
        {so ? (
          <span className="min-w-0 flex-1">
            <b>{so.rows.length.toLocaleString("id-ID")} baris SO</b> tersimpan di browser ini · {so.fileName} · {fmtTimestamp(so.at)}
            {(so.partners || so.status) && <span className="text-fg-2"> · filter: {[so.partners && `BP ${so.partners}`, so.status && `status ${so.status}`].filter(Boolean).join(", ")}</span>}
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-fg-2">{local.loaded ? "Belum ada SO di browser ini." : "Memuat data lokal…"}</span>
        )}
        {so && <button type="button" className={btnGhost} onClick={() => void local.clearSo()}><Icon name="delete" size={18} />Hapus data lokal</button>}
      </div>
      <div className={`${card} space-y-3 p-5`} key={resetKey}>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inputCls} aria-label="File SO" />
        <label className="block text-sm">
          <span className="text-fg-2">Filter awalan Business Partner</span>
          <input value={partners} onChange={(e) => setPartners(e.target.value)} placeholder="mis. Catur Mitra, RKM" className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-sm">
          <span className="text-fg-2">Filter Document Status</span>
          <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="mis. Completed" className={`${inputCls} mt-1`} />
        </label>
        <button type="button" className={btnPrimary} disabled={!file || !!busy} onClick={upload}>
          <Icon name="upload" size={20} />{busy ?? "Upload & Simpan di Browser"}
        </button>
        <p className="text-xs text-fg-2">Data SO tidak dikirim ke server. Tersimpan di browser ini sampai diganti upload baru, dihapus, atau logout.</p>
      </div>
    </div>
  );
}
