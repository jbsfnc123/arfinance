"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { readFirstSheetRows } from "@/lib/xlsx-client";
import { parseTarget, type TargetRow } from "@/lib/modules/collection/parse-target";
import { todayJakarta } from "@/lib/parsers/date";
import { monthLabel, rupiah } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnPrimary, card, inputCls } from "@/components/ui";

type Parsed = ReturnType<typeof parseTarget>;

const FIELD_LABEL: Record<keyof TargetRow, string> = {
  invoice_no: "Invoice No",
  target: "Target",
  marketing: "Marketing",
  collection_name: "Collection Name",
  business_partner: "Business Partner",
  due_date: "Due Date",
  branch: "Branch",
  no_sj: "No SJ",
};

export function UploadTarget() {
  const router = useRouter();
  const toast = useToast();
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(f: File | null) {
    setFile(f);
    setParsed(null);
    if (!f) return;
    try {
      setParsed(parseTarget(await readFirstSheetRows(f)));
    } catch (e) {
      toast(`Gagal membaca file: ${(e as Error).message}`, "danger");
    }
  }

  async function upload() {
    if (!file || !parsed?.rows.length) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("ar_target_replace", {
      p_month: month,
      p_rows: parsed.rows,
      p_file_name: file.name,
    });
    setBusy(false);
    if (error) {
      toast(`Gagal menyimpan: ${error.message}`, "danger", 6000);
      return;
    }
    toast(`Target ${monthLabel(month)} disimpan: ${data} invoice.`, "success", 6000);
    setFile(null);
    setParsed(null);
    router.refresh();
  }

  const found = parsed
    ? (Object.keys(FIELD_LABEL) as (keyof TargetRow)[]).filter((f) => parsed.columns[f] !== undefined)
    : [];

  return (
    <div className={`${card} mt-6 space-y-4 p-5`}>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <label className="text-sm">
          <span className="text-fg-2">Bulan target</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm">
          <span className="text-fg-2">File target (.xlsx / .xls / .csv)</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            key={file ? "has" : "empty"}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            className={`${inputCls} mt-1`}
          />
        </label>
      </div>

      <p className="text-xs text-fg-2">
        Kolom wajib: <b>Invoice No</b> dan <b>Target</b> (atau Open Amt). Opsional: Marketing, Collection Name,
        Business Partner, Due Date, Branch — bila kosong diambil dari data tagihan. File dengan tata letak sheet
        &quot;Tagihan&quot; lama (A = Target, F = Invoice, J = Branch) juga diterima.
      </p>

      {parsed && (
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <div>
            {parsed.rows.length.toLocaleString("id-ID")} invoice · total target{" "}
            <b>{rupiah(parsed.rows.reduce((s, r) => s + r.target, 0))}</b>
            {parsed.skipped > 0 && <span className="text-warning"> · {parsed.skipped} baris tidak lengkap dilewati</span>}
          </div>
          <div className="mt-1 text-xs text-fg-2">
            {parsed.legacy ? "Header tidak dikenali — memakai tata letak sheet Tagihan lama. " : "Kolom dikenali: "}
            {found.map((f) => FIELD_LABEL[f]).join(", ")}
          </div>
        </div>
      )}

      <button type="button" className={btnPrimary} disabled={!parsed?.rows.length || busy} onClick={upload}>
        <span className="material-symbols-outlined">upload</span>
        {busy ? "Menyimpan…" : `Simpan target ${monthLabel(month)}`}
      </button>
    </div>
  );
}
