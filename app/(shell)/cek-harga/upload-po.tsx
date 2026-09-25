"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  aggregatePo, parseCsv, PO_CATEGORIES, RECON_STATUS_TEXT, reconcile,
  type PoCategory, type ReconRow, type ReconStatus,
} from "@/lib/modules/cekharga/cekharga";
import { downloadXlsx } from "@/lib/xlsx-client";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";

const money = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const BADGE: Record<ReconStatus, string> = {
  SELISIH: "bg-danger/15 text-danger", OK: "bg-success/15 text-success", NOT_FOUND: "bg-warning/15 text-warning",
};

export function UploadPo({ casesVersion, onArchived }: { casesVersion: number; onArchived: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [category, setCategory] = useState<PoCategory | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [filter, setFilter] = useState<ReconStatus | "ALL">("ALL");
  const [cases, setCases] = useState<Map<string, string>>(new Map());

  // Status arsip per PO (untuk tombol "Pindahkan ke Arsip" / "Sudah di Arsip" / "Sudah Selesai").
  useEffect(() => {
    const pos = rows.filter((r) => r.status === "SELISIH").map((r) => r.po_customer);
    if (!pos.length) return;
    supabase.from("po_so_cases").select("po_customer, status").in("po_customer", pos).then(({ data }) => {
      setCases(new Map((data ?? []).map((c) => [c.po_customer, c.status])));
    });
  }, [rows, casesVersion, supabase]);

  async function process() {
    if (!category) return toast("Pilih kategori (Mitra10 / RKM) terlebih dahulu.", "warning");
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

      setBusy("Mengambil data SO (MASTER)…");
      const keys = [...poPivot.keys()];
      const so = [];
      for (let i = 0; i < keys.length; i += 1000) {
        const { data, error } = await supabase.rpc("get_so_pivot", { p_keys: keys.slice(i, i + 1000) });
        if (error) throw error;
        so.push(...(data ?? []));
      }
      setRows(reconcile(poPivot, so));
      toast("Rekonsiliasi selesai.", "success");
    } catch (e) {
      toast(`Terjadi kesalahan: ${(e as Error).message}`, "danger");
    } finally {
      setBusy(null);
    }
  }

  async function archive(r: ReconRow) {
    const { error } = await supabase.from("po_so_cases").insert({
      po_customer: r.po_customer, document_no: r.document_no, date_po: r.date_po, business_partner: r.business_partner,
      price_list: r.price_list, document_status: r.document_status, total_po: r.total_po, total_so: r.total_so, selisih: r.selisih,
    });
    if (error) return toast(error.code === "23505" ? "PO ini sudah pernah diarsipkan." : `Gagal: ${error.message}`, "danger");
    toast(`PO ${r.po_customer} dipindahkan ke Arsip.`, "success");
    onArchived();
  }

  const counts = { SELISIH: 0, OK: 0, NOT_FOUND: 0 };
  for (const r of rows) counts[r.status]++;
  const visible = rows.filter((r) => filter === "ALL" || r.status === filter);

  function exportExcel() {
    const cat = category ? PO_CATEGORIES[category].label : "PO";
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    downloadXlsx(`Rekonsiliasi_PO_SO_${cat}_${filter === "ALL" ? "Semua" : filter}_${stamp}.xlsx`, "Rekonsiliasi", [
      ["Status", "Document No", "Date PO", "No PO Customer", "Business Partner", "Price List", "Document Status", "Total PO", "Total SO", "Selisih"],
      ...visible.map((r) => [RECON_STATUS_TEXT[r.status], r.document_no, r.date_po, r.po_customer, r.business_partner, r.price_list,
        r.document_status, r.total_po, r.hasSO ? r.total_so : "", r.hasSO ? r.selisih : ""]),
    ]);
  }

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3 p-4`}>
        <label className="text-sm">
          <span className="text-fg-2">Kategori</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value as PoCategory | ""); setFiles([]); setRows([]); }} className={`${inputCls} mt-1 !w-44`}>
            <option value="">Pilih kategori…</option>
            {Object.entries(PO_CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>
        </label>
        <label className="min-w-64 flex-1 text-sm">
          <span className="text-fg-2">{category ? PO_CATEGORIES[category].hint : "Kategori menentukan tipe file dan kolom yang dibaca."}</span>
          <input type="file" multiple disabled={!category} accept={category ? PO_CATEGORIES[category].accept : undefined}
            key={category} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className={`${inputCls} mt-1`} />
        </label>
        <button type="button" className={btnPrimary} disabled={!files.length || !!busy} onClick={process}>
          <span className="material-symbols-outlined">compare_arrows</span>{busy ?? "Upload & Proses"}
        </button>
      </div>

      {rows.length > 0 && (
        <section className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-sm">
            <span>Total <b>{rows.length}</b> PO</span>
            {(["ALL", "SELISIH", "NOT_FOUND", "OK"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1 text-xs ${filter === s ? "bg-pill text-pill-fg" : "hover:bg-surface-2"}`}>
                {s === "ALL" ? "Semua" : RECON_STATUS_TEXT[s]} {s !== "ALL" && <b>{counts[s]}</b>}
              </button>
            ))}
            <button type="button" className={`${btnGhost} ml-auto`} onClick={exportExcel}>
              <span className="material-symbols-outlined">download</span>Export Excel
            </button>
          </div>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {["Status", "Document No", "Date PO", "No PO Customer", "Business Partner", "Price List", "Document Status"].map((h) => <th key={h} className={th}>{h}</th>)}
                  {["Total PO", "Total SO", "Selisih"].map((h) => <th key={h} className={`${th} text-right`}>{h}</th>)}
                  <th className={th}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const cs = cases.get(r.po_customer);
                  return (
                    <tr key={r.po_customer} className="border-t border-line">
                      <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs ${BADGE[r.status]}`}>{RECON_STATUS_TEXT[r.status]}</span></td>
                      <td className={td}>{r.document_no}</td>
                      <td className={td}>{r.date_po}</td>
                      <td className={td}>
                        {r.po_customer}
                        {r.is_manual && <span className="ml-1 rounded bg-warning/20 px-1 text-[10px] font-medium text-warning">Manual PO</span>}
                      </td>
                      <td className={`${td} max-w-56 truncate`}>{r.business_partner}</td>
                      <td className={td}>{r.price_list}</td>
                      <td className={td}>{r.document_status}</td>
                      <td className={`${td} text-right`}>{money(r.total_po)}</td>
                      <td className={`${td} text-right`}>{r.hasSO ? money(r.total_so) : "-"}</td>
                      <td className={`${td} text-right font-medium ${r.selisih < 0 ? "text-danger" : "text-accent"}`}>{r.hasSO ? money(r.selisih) : "-"}</td>
                      <td className={td}>
                        {r.status !== "SELISIH" ? "-" : cs === "completed" ? <span className="text-xs text-fg-2">Sudah Selesai</span>
                          : cs === "archived" ? <span className="text-xs text-success">Sudah di Arsip</span>
                          : <button type="button" className={btnGhost} onClick={() => archive(r)}>Pindahkan ke Arsip</button>}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={11}>Tidak ada data untuk status ini.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
