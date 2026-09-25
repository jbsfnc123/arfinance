"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readAllSheets } from "@/lib/xlsx-client";
import { detectKind, KIND_INFO, type FileKind, type Sheet } from "@/lib/uploads/parse";
import { runUpload, summarize, type Summary } from "@/lib/uploads/run";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, monthLabel } from "@/lib/format";
import { ImportLog } from "@/components/import-log";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";

type Item = {
  file: File; sheets?: Sheet[]; kind?: FileKind | null; summary?: Summary; error?: string;
  status: "baru" | "memproses" | "selesai" | "gagal"; message?: string;
};

// Pusat Upload: satu pintu untuk laporan yang dipakai banyak menu. Jenis file dikenali dari
// header; tiap laporan disimpan SEKALI dan langsung terbaca di semua menu terkait.
export function UploadCenter() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [over, setOver] = useState(false);

  const patch = (file: File, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.file === file ? { ...x, ...p } : x)));

  async function add(files: File[]) {
    setItems((xs) => [...files.map((f): Item => ({ file: f, status: "baru" })), ...xs]);
    for (const f of files) {
      try {
        const sheets = await readAllSheets(f);
        const kind = detectKind(sheets);
        if (!kind) throw new Error("jenis file tidak dikenali (bukan Aging, Invoice & Payment, Master BP, Target, atau Mutasi Bank)");
        patch(f, { sheets, kind, summary: summarize(kind, sheets) });
      } catch (e) {
        patch(f, { status: "gagal", error: (e as Error).message });
      }
    }
  }

  async function process() {
    setBusy(true);
    for (const it of items.filter((x) => x.status === "baru" && x.kind && x.sheets)) {
      patch(it.file, { status: "memproses" });
      try {
        const { message, seenAt } = await runUpload(supabase, it.kind!, it.file, it.sheets!, { month });
        patch(it.file, { status: "selesai", message: message + (seenAt ? ` · file identik pernah di-upload ${fmtTimestamp(seenAt)} (data tidak dobel)` : "") });
      } catch (e) {
        patch(it.file, { status: "gagal", error: (e as Error).message });
      }
    }
    setBusy(false);
    setVersion((v) => v + 1);
    toast("Pusat Upload selesai memproses file.", "success");
  }

  const pending = items.filter((x) => x.status === "baru" && x.kind).length;
  const hasTarget = items.some((x) => x.kind === "target" && x.status === "baru");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Pusat Upload Data</h1>
        <p className="mt-1 text-sm text-fg-2">
          Upload laporan ERP sekali di sini — datanya tersimpan satu kali dan langsung dipakai semua menu yang terkait.
          Upload ulang file yang sama tidak membuat data dobel.
        </p>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}
        className={`${card} flex cursor-pointer flex-col items-center gap-2 border-dashed p-8 text-center ${over ? "border-accent bg-surface-2" : ""}`}>
        <span className="material-symbols-outlined !text-4xl text-accent">upload_file</span>
        <span className="font-medium">Seret file ke sini atau klik untuk memilih (boleh banyak sekaligus)</span>
        <span className="text-xs text-fg-2">Aging (Blank_A4) · Invoice & Payment Date Comparison · Master Business Partner · Target bulanan · Mutasi rekening</span>
        <input type="file" multiple accept=".xls,.xlsx,.xlsm,.csv" className="hidden" disabled={busy}
          onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </label>

      {items.length > 0 && (
        <section className={`${card} divide-y divide-line`}>
          {items.map((it, i) => (
            <div key={i} className="flex flex-wrap items-start gap-3 p-4 text-sm">
              <span className={`material-symbols-outlined ${it.status === "gagal" ? "text-danger" : it.status === "selesai" ? "text-success" : "text-fg-2"}`}>
                {it.status === "gagal" ? "error" : it.status === "selesai" ? "check_circle" : it.status === "memproses" ? "progress_activity" : "description"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{it.file.name}</div>
                {it.kind && <div className="text-xs text-accent">{KIND_INFO[it.kind].label} → {KIND_INFO[it.kind].feeds}</div>}
                {it.summary && <div className="text-xs text-fg-2">{it.summary}</div>}
                {it.message && <div className="text-xs text-success">{it.message}</div>}
                {it.error && <div className="text-xs text-danger">{it.error}</div>}
              </div>
              {it.status !== "memproses" && (
                <button type="button" className={`${btnGhost} !px-2 !py-1`} disabled={busy} onClick={() => setItems((xs) => xs.filter((x) => x !== it))}>
                  <span className="material-symbols-outlined !text-base">close</span>
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {hasTarget && (
          <label className="text-sm">
            <span className="text-fg-2">Bulan untuk file Target</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} mt-1 !w-auto`} />
          </label>
        )}
        <button type="button" className={btnPrimary} disabled={!pending || busy} onClick={process}>
          <span className="material-symbols-outlined">cloud_upload</span>
          {busy ? "Memproses…" : `Proses ${pending} file${hasTarget ? ` (target ${monthLabel(month)})` : ""}`}
        </button>
      </div>

      <ImportLog module={["data", "collection", "mutasi"]} version={version} limit={15} />
    </div>
  );
}
