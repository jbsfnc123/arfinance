"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { downloadXlsxSheets, readAllSheets } from "@/lib/xlsx-client";
import { completeness, emptyMonth, parseTemplate, SHEET_TOTAL, templateSheets, type MonthData } from "@/lib/modules/deck/template";
import { compressJson, decodeMonth } from "@/lib/modules/deck/store";
import { fmtTimestamp, monthLabel } from "@/lib/format";
import { todayJakarta } from "@/lib/parsers/date";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";

type MonthRow = { month: string; sheets_filled: number; sheets_total: number; complete: boolean; file_name: string | null; uploaded_at: string | null };

const addMonth = (ym: string, k: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7);
};

// Data Center Presentasi AR: pilih bulan → unduh template (1 slide = 1 sheet) → isi → upload kembali.
// Daftar cut-off per bulan: ✔ lengkap, x/8 sebagian, ✖ belum ada. Tidak terhubung dengan menu lain.
export function DataCenter({ open, onClose, onSaved, canDelete }: { open: boolean; onClose: () => void; onSaved: () => void; canDelete: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const current = todayJakarta().slice(0, 7);
  const [month, setMonth] = useState(current);
  const [rows, setRows] = useState<MonthRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("deck_months")
      .select("month, sheets_filled, sheets_total, complete, file_name, uploaded_at").order("month", { ascending: false });
    if (error) toast(`Gagal memuat daftar bulan: ${error.message}`, "danger");
    setRows((data as MonthRow[] | null) ?? []);
  }, [supabase, toast]);

  useEffect(() => {
    if (!open) return;
    supabase.from("deck_months").select("month, sheets_filled, sheets_total, complete, file_name, uploaded_at").order("month", { ascending: false })
      .then(({ data }) => setRows((data as MonthRow[] | null) ?? []));
  }, [open, supabase]);

  // Daftar: 12 bulan terakhir s/d bulan berjalan + bulan lain yang sudah punya data.
  const list = useMemo(() => {
    const by = new Map((rows ?? []).map((r) => [r.month, r]));
    const months = new Set(Array.from({ length: 12 }, (_, i) => addMonth(current, -i)));
    for (const r of rows ?? []) months.add(r.month);
    return [...months].sort().reverse().map((m) => ({ month: m, row: by.get(m) ?? null }));
  }, [rows, current]);

  async function load(m: string): Promise<MonthData | null> {
    const { data, error } = await supabase.from("deck_months").select("data").eq("month", m).maybeSingle();
    if (error) throw error;
    return data ? decodeMonth(data.data) : null;
  }

  async function downloadTemplate() {
    setBusy(true);
    try {
      const d = (await load(month)) ?? emptyMonth();
      await downloadXlsxSheets(`Presentasi AR ${monthLabel(month)}.xlsx`, templateSheets(month, d));
    } catch (e) { toast(`Gagal membuat template: ${(e as Error).message}`, "danger"); }
    finally { setBusy(false); }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const prev = await load(month);
      const r = parseTemplate(await readAllSheets(file), prev?.texts ?? {});
      if (r.fileMonth && r.fileMonth !== month &&
        !confirm(`File ini template bulan ${monthLabel(r.fileMonth)}, tetapi bulan yang dipilih ${monthLabel(month)}. Tetap simpan sebagai ${monthLabel(month)}?`)) return;
      if (prev && !confirm(`Data ${monthLabel(month)} sudah ada dan akan diganti dengan isi file ini. Lanjutkan?`)) return;
      const c = completeness(r.data);
      const { error } = await supabase.rpc("deck_month_save", {
        p_month: month, p_data: await compressJson(r.data), p_filled: c.filled, p_total: c.total, p_file: file.name, p_upload: true,
      });
      if (error) throw error;
      const warn = [...(r.missingSheets.length ? [`Sheet tidak ada: ${r.missingSheets.join(", ")}`] : []), ...r.warnings.slice(0, 3)];
      toast(`${monthLabel(month)} tersimpan — ${c.complete ? "lengkap ✔" : `${c.filled}/${c.total} sheet terisi`}.${warn.length ? "\n" + warn.join("\n") : ""}`,
        c.complete ? "success" : "warning", 9000);
      await refresh();
      onSaved();
    } catch (e) { toast(`Gagal upload: ${(e as Error).message}`, "danger", 9000); }
    finally { setBusy(false); }
  }

  async function remove(m: string) {
    if (!confirm(`Hapus data presentasi ${monthLabel(m)}? Bulan ini akan kosong (✖).`)) return;
    const { error } = await supabase.rpc("deck_month_delete", { p_month: m });
    if (error) return toast(`Gagal menghapus: ${error.message}`, "danger");
    toast(`Data ${monthLabel(m)} dihapus.`, "success");
    await refresh();
    onSaved();
  }

  return (
    <Modal open={open} title="Data Center — Presentasi AR" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col">
            <span className="text-fg-2">1. Pilih bulan cut-off</span>
            <input type="month" value={month} max={current} onChange={(e) => setMonth(e.target.value || current)} className={`${inputCls} mt-1 !w-auto`} />
          </label>
          <button type="button" className={btnGhost} disabled={busy} onClick={downloadTemplate}>
            <span className="material-symbols-outlined !text-base">download</span>2. Unduh template {monthLabel(month)}
          </button>
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => fileRef.current?.click()}>
            <span className="material-symbols-outlined !text-base">upload_file</span>3. Upload template {monthLabel(month)}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          {busy && <span className="text-accent">Memproses…</span>}
        </div>
        <p className="text-xs text-fg-2">
          Template berisi 1 sheet per slide ({SHEET_TOTAL} sheet) dan sudah terisi data yang tersimpan untuk bulan itu. Data presentasi
          berdiri sendiri — tidak mengambil data dari menu lain. Bulan tercentang bila semua sheet wajib terisi.
        </p>

        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full">
            <tbody>
              {list.map(({ month: m, row }) => {
                const icon = row?.complete ? ["check_circle", "text-success"] : row ? ["pending", "text-warning"] : ["cancel", "text-danger"];
                return (
                  <tr key={m} className={`border-t border-line first:border-t-0 ${m === month ? "bg-surface-2" : ""}`}>
                    <td className="w-8 py-2 pl-3">
                      <span className={`material-symbols-outlined !text-xl ${icon[1]}`} style={{ fontVariationSettings: "'FILL' 1" }}
                        aria-label={row?.complete ? "lengkap" : row ? "sebagian" : "belum ada"}>{icon[0]}</span>
                    </td>
                    <td className="py-2">
                      <button type="button" className="font-medium hover:text-accent" onClick={() => setMonth(m)}>{monthLabel(m)}</button>
                      <span className="ml-2 text-xs text-fg-2">
                        {row ? (row.complete ? "lengkap" : `${row.sheets_filled}/${row.sheets_total || SHEET_TOTAL} sheet`) : "belum ada data"}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-fg-2">{row?.uploaded_at ? `diupload ${fmtTimestamp(row.uploaded_at)}` : ""}{row?.file_name ? ` · ${row.file_name}` : ""}</td>
                    <td className="py-2 pr-3 text-right">
                      {row && canDelete && (
                        <button type="button" title="Hapus data bulan ini" onClick={() => void remove(m)} className="rounded p-1 text-fg-2 hover:text-danger">
                          <span className="material-symbols-outlined !text-lg">delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
