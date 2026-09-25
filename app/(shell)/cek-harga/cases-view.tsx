"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { fmtTimestamp } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";

type Case = Tables<"po_so_cases">;
const AKSI = ["Litigasi", "LTKP", "Internal"];
const money = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });

// Port tab ARSIP & TASK_COMPLETE: baris kuning bila Tindakan Koreksi/Keterangan belum diisi;
// klik baris untuk mengisi Aksi, Tindakan, Keterangan → Simpan / Complete.
export function CasesView({ status, version, onChange }: { status: "archived" | "completed"; version: number; onChange: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [rows, setRows] = useState<Case[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState({ aksi: "Litigasi", tindakan: "", keterangan: "" });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.from("po_so_cases").select("*").eq("status", status)
      .order(status === "archived" ? "archived_at" : "completed_at", { ascending: false }).limit(3000)
      .then(({ data, error }) => {
        if (error) toast(`Gagal memuat: ${error.message}`, "danger");
        setRows(data ?? []);
      });
  }, [status, version, supabase, toast]);

  function toggle(c: Case) {
    if (open === c.id) return setOpen(null);
    setOpen(c.id);
    setDraft({ aksi: c.aksi ?? "Litigasi", tindakan: c.tindakan ?? "", keterangan: c.keterangan ?? "" });
  }

  async function save(c: Case, complete: boolean) {
    setBusy(true);
    const patch = {
      aksi: draft.aksi, tindakan: draft.tindakan.trim(), keterangan: draft.keterangan.trim(),
      ...(complete ? { status: "completed", completed_at: new Date().toISOString() } : {}),
    };
    const { error } = await supabase.from("po_so_cases").update(patch).eq("id", c.id);
    setBusy(false);
    if (error) return toast(`Gagal menyimpan: ${error.message}`, "danger");
    toast(complete ? `PO ${c.po_customer} selesai & dipindahkan ke Task Complete.` : `Perubahan PO ${c.po_customer} disimpan.`, "success");
    setOpen(null);
    if (complete) setRows(rows.filter((r) => r.id !== c.id));
    else setRows(rows.map((r) => (r.id === c.id ? { ...r, ...patch } : r)));
    onChange();
  }

  const shown = rows.filter((r) => `${r.po_customer} ${r.document_no} ${r.business_partner}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-sm">{shown.length} PO</span>
        {status === "archived" && <span className="text-xs text-fg-2">· baris kuning = Tindakan Koreksi / Keterangan belum diisi</span>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari PO, SO, BP…" className={`${inputCls} ml-auto !w-60`} />
      </div>
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>
              {["Document No", "Date PO", "No PO Customer", "Business Partner", "Price List", "Document Status"].map((h) => <th key={h} className={th}>{h}</th>)}
              {["Total PO", "Total SO", "Selisih"].map((h) => <th key={h} className={`${th} text-right`}>{h}</th>)}
              {status === "completed" && <><th className={th}>Aksi</th><th className={th}>Tindakan Koreksi</th><th className={th}>Keterangan</th><th className={th}>Selesai</th></>}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const incomplete = !c.tindakan?.trim() || !c.keterangan?.trim();
              return (
                <Fragment key={c.id}>
                  <tr onClick={() => status === "archived" && toggle(c)}
                    className={`border-t border-line ${status === "archived" ? "cursor-pointer hover:bg-surface-2" : ""} ${status === "archived" && incomplete ? "bg-warning/10" : ""}`}>
                    <td className={td}>{c.document_no}</td>
                    <td className={td}>{c.date_po}</td>
                    <td className={td}>{c.po_customer}</td>
                    <td className={`${td} max-w-56 truncate`}>{c.business_partner}</td>
                    <td className={td}>{c.price_list}</td>
                    <td className={td}>{c.document_status}</td>
                    <td className={`${td} text-right`}>{money(c.total_po)}</td>
                    <td className={`${td} text-right`}>{money(c.total_so)}</td>
                    <td className={`${td} text-right`}>{money(c.selisih)}</td>
                    {status === "completed" && (
                      <>
                        <td className={td}>{c.aksi}</td>
                        <td className={`${td} max-w-56 truncate`} title={c.tindakan ?? ""}>{c.tindakan}</td>
                        <td className={`${td} max-w-56 truncate`} title={c.keterangan ?? ""}>{c.keterangan}</td>
                        <td className={td}>{fmtTimestamp(c.completed_at)}</td>
                      </>
                    )}
                  </tr>
                  {open === c.id && (
                    <tr className="bg-surface-2/50">
                      <td colSpan={9} className="px-3 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs text-fg-2">Aksi
                            <select value={draft.aksi} onChange={(e) => setDraft({ ...draft, aksi: e.target.value })} className={`${inputCls} mt-1 !w-36`}>
                              {AKSI.map((a) => <option key={a}>{a}</option>)}
                            </select>
                          </label>
                          <label className="min-w-56 flex-1 text-xs text-fg-2">Tindakan Koreksi
                            <input value={draft.tindakan} onChange={(e) => setDraft({ ...draft, tindakan: e.target.value })} className={`${inputCls} mt-1`} />
                          </label>
                          <label className="min-w-56 flex-1 text-xs text-fg-2">Keterangan
                            <input value={draft.keterangan} onChange={(e) => setDraft({ ...draft, keterangan: e.target.value })} className={`${inputCls} mt-1`} />
                          </label>
                          <button type="button" className={btnGhost} disabled={busy} onClick={() => save(c, false)}>Simpan</button>
                          <button type="button" className={btnPrimary} disabled={busy} onClick={() => save(c, true)}>Complete</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={13}>{status === "archived" ? "Belum ada data di arsip." : "Belum ada task complete."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
