"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readAllSheets } from "@/lib/xlsx-client";
import { detectKind, KIND_INFO, type FileKind, type Sheet } from "@/lib/uploads/parse";
import { runUpload, summarize, type Summary } from "@/lib/uploads/run";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, monthLabel } from "@/lib/format";
import { ImportLog } from "@/components/import-log";
import { UploadChecklist } from "./upload-checklist";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { useViewState } from "@/lib/ui/view-state";
import { Icon } from "@/components/icons";

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
  const [month, setMonth] = useViewState("upload:month", todayJakarta().slice(0, 7));
  const [reportDate, setReportDate] = useState("");
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
        if (!kind) throw new Error("jenis file tidak dikenali (bukan Aging, Invoice & Payment, Target, atau Mutasi Bank)");
        patch(f, { sheets, kind, summary: summarize(kind, sheets) });
      } catch (e) {
        patch(f, { status: "gagal", error: (e as Error).message });
      }
    }
  }

  async function process() {
    if (hasAging && (!reportDate || reportDate.slice(0,7)!==month || reportDate>todayJakarta())) {
      toast("Isi tanggal laporan Aging yang sesuai bulan Collection tujuan dan tidak melebihi hari ini.", "danger"); return;
    }
    setBusy(true);
    for (const it of items.filter((x) => x.status === "baru" && x.kind && x.sheets)) {
      patch(it.file, { status: "memproses" });
      try {
        const { message, seenAt } = await runUpload(supabase, it.kind!, it.file, it.sheets!, { month, reportDate });
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
  const hasAging = items.some((x) => x.kind === "aging" && x.status === "baru");
  const hasTarget = items.some((x) => x.kind === "target" && x.status === "baru");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Pusat Upload Data</h1>
      </div>

      <UploadChecklist version={version} />

      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}
        className={`${card} flex cursor-pointer flex-col items-center gap-2 border-dashed p-8 text-center ${over ? "border-accent bg-surface-2" : ""}`}>
        <Icon name="upload_file" size={36} className="text-accent" />
        <span className="font-medium">Seret file ke sini atau klik untuk memilih (boleh banyak sekaligus)</span>
        <input type="file" multiple accept=".xls,.xlsx,.xlsm,.csv" className="hidden" disabled={busy}
          onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </label>

      {items.length > 0 && (
        <section className={`${card} divide-y divide-line`}>
          {items.map((it, i) => (
            <div key={i} className="flex flex-wrap items-start gap-3 p-4 text-sm">
              <Icon name={it.status === "gagal" ? "error" : it.status === "selesai" ? "check_circle" : it.status === "memproses" ? "progress_activity" : "description"} size={20} className={`${it.status === "gagal" ? "text-danger" : it.status === "selesai" ? "text-success" : "text-fg-2"} ${it.status === "memproses" ? "animate-spin" : ""}`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{it.file.name}</div>
                {it.kind && <div className="text-xs text-accent">{KIND_INFO[it.kind].label} → {KIND_INFO[it.kind].feeds}</div>}
                {it.summary && <div className="text-xs text-fg-2">{it.summary}</div>}
                {it.message && <div className="text-xs text-success">{it.message}</div>}
                {it.error && <div className="text-xs text-danger">{it.error}</div>}
              </div>
              {it.status !== "memproses" && (
                <button type="button" className={`${btnGhost} !px-2 !py-1`} disabled={busy} onClick={() => setItems((xs) => xs.filter((x) => x !== it))}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {(hasTarget || hasAging) && (
          <label className="text-sm">
            <span className="text-fg-2">Bulan Collection tujuan (Open)</span>
            <input type="month" value={month} disabled={busy} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} mt-1 !w-auto`} />
          </label>
        )}
        {hasAging && <label className="text-sm"><span className="text-fg-2">Tanggal posisi laporan Aging</span>
          <input type="date" value={reportDate} max={todayJakarta()} disabled={busy} onChange={e=>setReportDate(e.target.value)} className={`${inputCls} mt-1 !w-auto`} />
        </label>}
        <button type="button" className={btnPrimary} disabled={!pending || busy || (hasAging && !reportDate)} onClick={process}>
          <Icon name="cloud_upload" size={20} />
          {busy ? "Memproses…" : `Proses ${pending} file${hasTarget ? ` (target ${monthLabel(month)})` : ""}`}
        </button>
      </div>

      <ImportLog module={["data", "collection", "mutasi"]} version={version} limit={15} />
    </div>
  );
}
