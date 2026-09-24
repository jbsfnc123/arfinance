"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { readFirstSheetRows } from "@/lib/xlsx-client";
import { parseBlankA4, MARKETING_WHITELIST, type BlankA4Result } from "@/lib/modules/collection/parse-blank-a4";
import { rupiah } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnPrimary, card, inputCls } from "@/components/ui";

const CHUNK = 2000;

export function UploadTagihan() {
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<BlankA4Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  async function onPick(f: File | null) {
    setFile(f);
    setParsed(null);
    if (!f) return;
    setBusy("Membaca file…");
    try {
      setParsed(parseBlankA4(await readFirstSheetRows(f)));
    } catch (e) {
      toast(`Gagal membaca file: ${(e as Error).message}`, "danger");
    } finally {
      setBusy(null);
    }
  }

  async function upload() {
    if (!file || !parsed || parsed.rows.length === 0) return;
    const supabase = createClient();
    setBusy("Menyimpan…");
    setProgress(0);
    try {
      const { data: batch, error: startErr } = await supabase.rpc("ar_upload_start", { p_file_name: file.name });
      if (startErr) throw startErr;
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const { error } = await supabase.rpc("ar_upload_chunk", {
          p_batch: batch,
          p_rows: parsed.rows.slice(i, i + CHUNK),
        });
        if (error) throw error;
        setProgress(Math.min(parsed.rows.length, i + CHUNK) / parsed.rows.length);
      }
      const { data: res, error: finishErr } = await supabase.rpc("ar_upload_finish", { p_batch: batch });
      if (finishErr) throw finishErr;

      const { date, marketing, duplicate } = parsed.skipped;
      const skippedMsg = date + marketing + duplicate > 0
        ? `\n(Dilewati — Date: ${date} · Marketing: ${marketing} · Duplikat: ${duplicate})` : "";
      toast(`Berhasil! ${(res as { rows: number }).rows} baris tagihan disimpan.${skippedMsg}`, "success", 6000);
      setFile(null);
      setParsed(null);
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? String(e);
      toast(/akses ditolak/i.test(msg) ? "Akses ditolak. Silakan masuk ulang." : `Gagal menyimpan: ${msg}`, "danger", 6000);
    } finally {
      setBusy(null);
    }
  }

  const total = parsed?.rows.reduce((s, r) => s + r.open_amt, 0) ?? 0;
  const collections = new Set(parsed?.rows.map((r) => r.collection_name)).size;

  return (
    <div className={`${card} mt-6 space-y-4 p-5`}>
      <div className="text-sm text-fg-2">
        Kolom yang disalin: Payment Group (A), Marketing (C), Collection Name (D), Value (G), Business Partner (H),
        Invoice No (K), Invoice Date (L), Due Date (M), Open Amt (N), No PO (Z), No SJ (AA). Hanya marketing{" "}
        {MARKETING_WHITELIST.join(", ")} dengan Invoice Date setelah 01/01/2026.
      </div>

      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={!!busy}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className={inputCls}
        key={file ? "has" : "empty"}
      />

      {parsed && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Baris lolos" value={parsed.rows.length.toLocaleString("id-ID")} />
          <Stat label="Collection" value={String(collections)} />
          <Stat label="Total Open Amt" value={rupiah(total)} />
          <Stat
            label="Dilewati"
            value={`${parsed.skipped.date + parsed.skipped.marketing + parsed.skipped.duplicate}`}
            hint={`Date ${parsed.skipped.date} · Marketing ${parsed.skipped.marketing} · Duplikat ${parsed.skipped.duplicate}`}
          />
        </div>
      )}

      {parsed && parsed.rows.length === 0 && (
        <p className="text-sm text-warning">Tidak ada data lolos filter.</p>
      )}

      {busy && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.max(5, progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-fg-2">{busy}</p>
        </div>
      )}

      <button type="button" className={btnPrimary} disabled={!parsed || parsed.rows.length === 0 || !!busy} onClick={upload}>
        <span className="material-symbols-outlined">upload</span>
        Simpan ke Database
      </button>
      <p className="text-xs text-fg-2">
        Data tagihan lama akan diganti seluruhnya. Catatan, janji bayar, dan riwayat tukar faktur tetap tersimpan.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-xs text-fg-2">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-fg-2">{hint}</div>}
    </div>
  );
}
