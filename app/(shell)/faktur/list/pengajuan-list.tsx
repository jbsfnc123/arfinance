"use client";

import { useRemarks } from "@/lib/modules/remarks";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtTimestamp } from "@/lib/format";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";
import { LtkpPreview } from "../ltkp-preview";

type Req = {
  id: number; created_at: string; created_by_name: string | null; bp_value: string; invoice_date: string | null;
  invoice_no: string; no_sj: string | null; tax_no: string; request: string; reason: string; keterangan: string;
  processed_at: string | null; processed_by_name: string | null;
  ltkp: { no_ltkp: string; storage_path: string } | null;
};

export function PengajuanList({ myName }: { myName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const remarks = useRemarks();
  const [rows, setRows] = useState<Req[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "done">("open");
  const [open, setOpen] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ltkpOpen, setLtkpOpen] = useState(false);
  const [noLtkp, setNoLtkp] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ path: string; title: string } | null>(null);

  useEffect(() => {
    supabase
      .from("tax_invoice_requests")
      .select("id, created_at, created_by_name, bp_value, invoice_date, invoice_no, no_sj, tax_no, request, reason, keterangan, processed_at, processed_by_name, ltkp:ltkp_documents(no_ltkp, storage_path)")
      .order("id", { ascending: false })
      .limit(2000)
      .then(({ data, error }) => {
        if (error) toast(`Gagal memuat: ${error.message}`, "danger");
        setRows((data ?? []) as unknown as Req[]);
      });
  }, [supabase, toast, reloadKey]);

  const shown = rows.filter((r) => {
    if (status === "open" && r.processed_at) return false;
    if (status === "done" && !r.processed_at) return false;
    const needle = q.toLowerCase();
    return !needle || `${r.invoice_no} ${r.bp_value} ${r.tax_no} ${r.ltkp?.no_ltkp ?? ""}`.toLowerCase().includes(needle);
  });

  async function toggleProcessed(r: Req) {
    const done = !r.processed_at;
    const patch = { processed_at: done ? new Date().toISOString() : null, processed_by_name: done ? myName : null };
    setRows(rows.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("tax_invoice_requests").update(patch).eq("id", r.id);
    if (error) {
      toast(`Gagal: ${error.message}`, "danger");
      setReloadKey((k) => k + 1);
    }
  }

  async function uploadLtkp() {
    if (!noLtkp.trim() || !pdf || !selected.size) return;
    if (pdf.size > 10 * 1024 * 1024) return toast("Ukuran file terlalu besar (maks 10 MB).", "warning");
    setBusy(true);
    try {
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.pdf`;
      const up = await supabase.storage.from("ltkp").upload(path, pdf, { contentType: "application/pdf" });
      if (up.error) throw up.error;
      const { data: doc, error } = await supabase.from("ltkp_documents")
        .insert({ no_ltkp: noLtkp.trim(), storage_path: path, file_name: pdf.name }).select("id").single();
      if (error) throw error;
      const upd = await supabase.from("tax_invoice_requests").update({ ltkp_id: doc.id }).in("id", [...selected]);
      if (upd.error) throw upd.error;
      toast(`LTKP ${noLtkp} ditautkan ke ${selected.size} pengajuan.`, "success");
      setLtkpOpen(false);
      setSelected(new Set());
      setNoLtkp("");
      setPdf(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast(`Gagal upload LTKP: ${(e as Error).message}`, "danger", 6000);
    } finally {
      setBusy(false);
    }
  }

  const toggleSel = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-medium">Daftar Pengajuan Pembatalan &amp; Revisi</h1>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari invoice, BP, tax no, LTKP…" className={`${inputCls} !w-64`} />
        <div className="flex gap-1">
          {([["open", "Belum diproses"], ["done", "Sudah diproses"], ["all", "Semua"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStatus(k)}
              className={`rounded-full px-3 py-1 text-xs ${status === k ? "bg-pill text-pill-fg" : "hover:bg-surface-2"}`}>{l}</button>
          ))}
        </div>
        <button type="button" className={btnPrimary} disabled={!selected.size} onClick={() => setLtkpOpen(true)}>
          <span className="material-symbols-outlined">upload_file</span>Upload LTKP ({selected.size})
        </button>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={`${th} w-10`} />
              <th className={th}>Waktu</th><th className={th}>Invoice</th><th className={th}>Business Partner_Value</th>
              <th className={th}>Request</th><th className={th}>LTKP</th><th className={th}>Diproses</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer border-t border-line hover:bg-surface-2" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} aria-label={`Pilih ${r.invoice_no}`} />
                  </td>
                  <td className={td}>{fmtTimestamp(r.created_at)}</td>
                  <td className={td}>{r.invoice_no}</td>
                  <td className={`${td} max-w-64 truncate`}>{r.bp_value}</td>
                  <td className={td}>{r.request}</td>
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    {r.ltkp ? (
                      <button type="button" className="text-accent hover:underline" onClick={() => setPreview({ path: r.ltkp!.storage_path, title: `LTKP ${r.ltkp!.no_ltkp}` })}>
                        {r.ltkp.no_ltkp}
                      </button>
                    ) : "—"}
                  </td>
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!r.processed_at} onChange={() => toggleProcessed(r)} />
                      {r.processed_at && <span className="text-xs text-success">{r.processed_by_name}</span>}
                    </label>
                  </td>
                </tr>
                {open === r.id && (
                  <tr className="bg-surface-2/50 text-xs">
                    <td />
                    <td className={`${td} whitespace-normal`} colSpan={6}>
                      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        <div><span className="text-fg-2">Diajukan oleh:</span> {r.created_by_name ?? "—"}</div>
                        <div><span className="text-fg-2">Invoice Date:</span> {fmtDate(r.invoice_date) || "—"}</div>
                        <div><span className="text-fg-2">No SJ:</span> {r.no_sj ?? "—"}</div>
                        <div><span className="text-fg-2">Tax No:</span> {r.tax_no}</div>
                        <div><span className="text-fg-2">Reason:</span> {r.reason}</div>
                        <div><span className="text-fg-2">Diproses:</span> {r.processed_at ? `${r.processed_by_name ?? ""} · ${fmtTimestamp(r.processed_at)}` : "Belum"}</div>
                        <div className="sm:col-span-2"><span className="text-fg-2">Keterangan pengajuan:</span> {r.keterangan}</div>
                        <div className="sm:col-span-2"><span className="text-fg-2">Keterangan invoice:</span> {remarks.get(r.no_sj, r.invoice_no) || "—"} <span className="text-xs text-fg-2">(sama dengan Collection, Mitra10 & Hold)</span></div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {shown.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={7}>Tidak ada pengajuan.</td></tr>}
          </tbody>
        </table>
      </section>

      <Modal
        open={ltkpOpen}
        onClose={() => setLtkpOpen(false)}
        title="Upload Dokumen LTKP"
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setLtkpOpen(false)}>Batal</button>
            <button type="button" className={btnPrimary} disabled={busy || !noLtkp.trim() || !pdf} onClick={uploadLtkp}>
              {busy ? "Mengunggah…" : "Upload"}
            </button>
          </>
        }
      >
        <p className="text-sm text-fg-2">Dokumen akan ditautkan ke {selected.size} pengajuan terpilih.</p>
        <input value={noLtkp} onChange={(e) => setNoLtkp(e.target.value)} placeholder="No LTKP *" className={`${inputCls} mt-3`} />
        <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className={`${inputCls} mt-3`} />
        <p className="mt-1 text-xs text-fg-2">PDF, maksimal 10 MB. Disimpan privat — hanya bisa dibuka pengguna yang login.</p>
      </Modal>

      <LtkpPreview path={preview?.path ?? null} title={preview?.title ?? ""} onClose={() => setPreview(null)} />
    </div>
  );
}
