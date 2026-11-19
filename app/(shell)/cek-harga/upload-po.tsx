"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  aggregatePo, parseCsv, PO_CATEGORIES, RECON_STATUS_TEXT, reconcile, soPivotLocal,
  type PoCategory, type ReconRow, type ReconStatus,
} from "@/lib/modules/cekharga/cekharga";
import { downloadXlsx } from "@/lib/xlsx-client";
import { fmtTimestamp } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, emptyTd, inputCls, segGroup, segItem, td, th } from "@/components/ui";
import { TableBox } from "@/components/table-box";
import { Icon } from "@/components/icons";
import type { CekHargaLocal } from "./use-local";

const money = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const BADGE: Record<ReconStatus, string> = {
  SELISIH: "bg-danger/15 text-danger", OK: "bg-success/15 text-success", NOT_FOUND: "bg-warning/15 text-warning",
};

/** Kirim PO selisih ke Arsip (server melewati No PO yang sudah ada); hasil = No PO yang BARU masuk. */
async function archiveSelisih(supabase: ReturnType<typeof createClient>, rows: ReconRow[]): Promise<string[]> {
  const payload = rows.filter((r) => r.status === "SELISIH").map((r) => ({
    po_customer: r.po_customer, document_no: r.document_no, date_po: r.date_po, business_partner: r.business_partner,
    price_list: r.price_list, document_status: r.document_status, total_po: r.total_po, total_so: r.total_so, selisih: r.selisih,
  }));
  if (!payload.length) return [];
  const { data, error } = await supabase.rpc("po_so_cases_archive" as never, { p_rows: payload } as never);
  if (error) throw error;
  return ((data as { inserted?: string[] } | null)?.inserted ?? []);
}

// Fase 83: rekonsiliasi PO vs SO diproses & disimpan di browser (SO lokal); hanya PO SELISIH yang dikirim ke server,
// otomatis masuk Arsip bila No PO-nya belum ada di Arsip / Task Complete.
export function UploadPo({ local, casesVersion, onArchived }: { local: CekHargaLocal; casesVersion: number; onArchived: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const recon = local.recon;
  const [category, setCategory] = useState<PoCategory | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReconStatus | "ALL">("ALL");
  const [cases, setCases] = useState<Map<string, string>>(new Map());
  const rows = useMemo(() => recon?.rows ?? [], [recon]);

  // Status arsip per PO selisih (Baru masuk / Sudah di Arsip / Sudah Selesai).
  useEffect(() => {
    const pos = rows.filter((r) => r.status === "SELISIH").map((r) => r.po_customer);
    if (!pos.length) return;
    supabase.from("po_so_cases").select("po_customer, status").in("po_customer", pos).then(({ data }) => {
      setCases(new Map((data ?? []).map((c) => [c.po_customer, c.status])));
    });
  }, [rows, casesVersion, supabase]);

  async function archive(rs: ReconRow[], meta: Omit<NonNullable<CekHargaLocal["recon"]>, "newlyArchived" | "archiveError">) {
    setBusy("Menyimpan selisih ke Arsip…");
    try {
      const inserted = await archiveSelisih(supabase, rs);
      const selisih = rs.filter((r) => r.status === "SELISIH").length;
      await local.setRecon({ ...meta, newlyArchived: inserted });
      if (selisih) toast(`${inserted.length} PO selisih baru masuk Arsip · ${selisih - inserted.length} sudah ada di Arsip/Task Complete.`, "success", 6000);
      else toast("Rekonsiliasi selesai — tidak ada selisih.", "success");
      if (inserted.length) onArchived();
    } catch (e) {
      const msg = (e as Error).message;
      await local.setRecon({ ...meta, newlyArchived: [], archiveError: msg });
      toast(`Rekonsiliasi selesai, tetapi gagal menyimpan ke Arsip: ${msg}`, "danger", 8000);
    }
  }

  async function process() {
    if (!category) return toast("Pilih kategori (Mitra10 / RKM) terlebih dahulu.", "warning");
    if (!local.so?.rows.length) return toast("Upload SO dulu di tab Upload SO.", "warning");
    const cfg = PO_CATEGORIES[category];
    const wrong = files.filter((f) => !cfg.exts.includes(f.name.split(".").pop()?.toLowerCase() ?? ""));
    if (wrong.length) return toast(`Kategori ${cfg.label} hanya menerima ${cfg.accept}. Tidak sesuai: ${wrong.map((f) => f.name).join(", ")}`, "danger");
    setBusy("Membaca file PO…");
    try {
      const XLSX = cfg.kind === "xlsx" ? await import("xlsx") : null;
      const sheets: unknown[][][] = [];
      for (const f of files) {
        if (XLSX) {
          const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
          sheets.push(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" }));
        } else sheets.push(parseCsv(await f.text()));
      }
      const poPivot = aggregatePo(sheets, category);
      if (!poPivot.size) return toast(`Tidak ada data valid pada file ${cfg.label}.`, "danger");
      setBusy("Rekonsiliasi dengan SO lokal…");
      const result = reconcile(poPivot, soPivotLocal(local.so.rows));
      setFilter("ALL");
      await archive(result, { rows: result, category, files: files.map((f) => f.name), at: new Date().toISOString() });
    } catch (e) {
      toast(`Terjadi kesalahan: ${(e as Error).message}`, "danger");
    } finally {
      setBusy(null);
    }
  }

  async function retryArchive() {
    if (!recon) return;
    await archive(recon.rows, { rows: recon.rows, category: recon.category, files: recon.files, at: recon.at });
    setBusy(null);
  }

  const counts = { SELISIH: 0, OK: 0, NOT_FOUND: 0 };
  for (const r of rows) counts[r.status]++;
  const visible = rows.filter((r) => filter === "ALL" || r.status === filter);
  const fresh = new Set(recon?.newlyArchived ?? []);

  function exportExcel() {
    const cat = recon ? PO_CATEGORIES[recon.category].label : "PO";
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    downloadXlsx(`Rekonsiliasi_PO_SO_${cat}_${filter === "ALL" ? "Semua" : filter}_${stamp}.xlsx`, "Rekonsiliasi", [
      ["Status", "Document No", "Date PO", "No PO Customer", "Business Partner", "Price List", "Document Status", "Total PO", "Total SO", "Selisih"],
      ...visible.map((r) => [RECON_STATUS_TEXT[r.status], r.document_no, r.date_po, r.po_customer, r.business_partner, r.price_list,
        r.document_status, r.total_po, r.hasSO ? r.total_so : "", r.hasSO ? r.selisih : ""]),
    ]).catch((e: Error) => toast(`Gagal mengunduh Excel: ${e.message}`, "danger"));
  }

  const archiveCell = (r: ReconRow) => {
    if (r.status !== "SELISIH") return "-";
    const cs = cases.get(r.po_customer);
    if (cs === "completed") return <span className="text-xs text-fg-2">Sudah Selesai</span>;
    if (fresh.has(r.po_customer)) return <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Baru masuk Arsip</span>;
    if (cs === "archived") return <span className="text-xs text-fg-2">Sudah di Arsip</span>;
    return <span className="text-xs text-warning">Belum tersimpan</span>;
  };

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3 p-4`}>
        <label className="text-sm">
          <span className="text-fg-2">Kategori</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value as PoCategory | ""); setFiles([]); }} className={`${inputCls} mt-1 !w-44`}>
            <option value="">Pilih kategori…</option>
            {Object.entries(PO_CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>
        </label>
        <label className="min-w-64 flex-1 text-sm">
          <span className="text-fg-2">File</span>
          <input type="file" multiple disabled={!category} accept={category ? PO_CATEGORIES[category].accept : undefined}
            key={category} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className={`${inputCls} mt-1`} aria-label="File PO" />
        </label>
        <button type="button" className={btnPrimary} disabled={!files.length || !!busy || !local.so?.rows.length} onClick={process}>
          <Icon name="compare_arrows" size={20} />{busy ?? "Upload & Proses"}
        </button>
        <p className="basis-full text-xs text-fg-2">
          {local.so ? <>SO lokal: <b>{local.so.rows.length.toLocaleString("id-ID")} baris</b> ({local.so.fileName}).</> : local.loaded ? <span className="text-warning">Belum ada SO di browser ini — upload SO dulu di tab Upload SO.</span> : "Memuat SO lokal…"}
          {" "}Rekonsiliasi diproses di browser; hanya PO selisih yang dikirim ke server dan otomatis masuk Arsip bila No PO-nya belum ada.
        </p>
      </div>

      {recon?.archiveError && (
        <div className={`${card} flex flex-wrap items-center gap-3 border-danger/40 p-3 text-sm text-danger`} role="alert">
          <Icon name="error" size={20} />Gagal menyimpan selisih ke Arsip: {recon.archiveError}
          <button type="button" className={`${btnGhost} ml-auto`} disabled={!!busy} onClick={() => void retryArchive()}>Coba arsipkan lagi</button>
        </div>
      )}

      {rows.length > 0 && recon && (
        <section className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-sm">
            <span>Total <b>{rows.length}</b> PO · {PO_CATEGORIES[recon.category].label} · {fmtTimestamp(recon.at)}</span>
            <div role="group" aria-label="Status rekonsiliasi" className={segGroup}>
            {(["ALL", "SELISIH", "NOT_FOUND", "OK"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setFilter(s)} aria-pressed={filter === s} className={segItem(filter === s)}>
                {s === "ALL" ? "Semua" : RECON_STATUS_TEXT[s]} {s !== "ALL" && <b>{counts[s]}</b>}
              </button>
            ))}
            </div>
            <span className="ml-auto flex gap-2">
              <button type="button" className={btnGhost} onClick={exportExcel}><Icon name="download" size={20} />Export Excel</button>
              <button type="button" className={btnGhost} onClick={() => void local.clearRecon()}><Icon name="delete" size={18} />Hapus hasil</button>
            </span>
          </div>
          <div>
            <TableBox bare>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    {["Status", "Document No", "Date PO", "No PO Customer", "Business Partner", "Price List", "Document Status"].map((h) => <th key={h} className={th}>{h}</th>)}
                    {["Total PO", "Total SO", "Selisih"].map((h) => <th key={h} className={`${th} text-right`}>{h}</th>)}
                    <th className={th}>Arsip</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.po_customer} className="border-t border-line">
                      <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs ${BADGE[r.status]}`}>{RECON_STATUS_TEXT[r.status]}</span></td>
                      <td className={td}>{r.document_no}</td>
                      <td className={td}>{r.date_po}</td>
                      <td className={td}>
                        {r.po_customer}
                        {r.is_manual && <span className="ml-1 rounded bg-warning/20 px-1 text-[10px] font-medium text-warning">Manual PO</span>}
                      </td>
                      <td className={`${td} max-w-56 truncate`} title={r.business_partner ?? ""}>{r.business_partner}</td>
                      <td className={td}>{r.price_list}</td>
                      <td className={td}>{r.document_status}</td>
                      <td className={`${td} text-right`}>{money(r.total_po)}</td>
                      <td className={`${td} text-right`}>{r.hasSO ? money(r.total_so) : "-"}</td>
                      <td className={`${td} text-right font-medium ${r.selisih < 0 ? "text-danger" : "text-accent"}`}>{r.hasSO ? money(r.selisih) : "-"}</td>
                      <td className={td}>{archiveCell(r)}</td>
                    </tr>
                  ))}
                  {visible.length === 0 && <tr><td className={emptyTd} colSpan={11}>Tidak ada data untuk status ini.</td></tr>}
                </tbody>
              </table>
            </TableBox>
          </div>
        </section>
      )}
    </div>
  );
}
