"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_INVOICE, type InvoiceFields } from "@/lib/modules/faktur/constants";
import { fmtDate, fmtTimestamp } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";
import { InvoiceLookup } from "../invoice-lookup";
import { setRemarks, useRemarks } from "@/lib/modules/remarks";

type Hold = Tables<"tax_invoice_holds">;

// Port Hold.html: tambah, daftar, ubah, hapus Hold Faktur Pajak.
export function HoldView() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [rows, setRows] = useState<Hold[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [inv, setInv] = useState<InvoiceFields>(EMPTY_INVOICE);
  const [ket, setKet] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  // Keterangan = keterangan invoice bersama (sama dengan Collection & Mitra10).
  const remarks = useRemarks();

  useEffect(() => {
    supabase.from("tax_invoice_holds").select("*").order("id", { ascending: false }).limit(2000).then(({ data, error }) => {
      if (error) toast(`Gagal memuat: ${error.message}`, "danger");
      setRows(data ?? []);
    });
  }, [supabase, toast, reloadKey]);

  function reset() {
    setEditing(null);
    setInv(EMPTY_INVOICE);
    setKet("");
  }

  async function save() {
    if (!inv.invoice_no.trim()) return toast("Invoice No wajib diisi (cari No Invoice atau isi data manual).", "warning");
    if (!inv.bp_value.trim()) return toast("Business Partner_Value wajib diisi.", "warning");
    if (!ket.trim()) return toast("Keterangan wajib diisi.", "warning");
    setBusy(true);
    const payload = {
      bp_value: inv.bp_value.trim(), invoice_date: inv.invoice_date || null, invoice_no: inv.invoice_no.trim(),
      no_sj: inv.no_sj.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("tax_invoice_holds").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing)
      : await supabase.from("tax_invoice_holds").insert(payload);
    if (error) { setBusy(false); return toast(`Gagal menyimpan: ${error.message}`, "danger"); }
    try { await setRemarks([payload.invoice_no], ket, "hold"); } catch (e) { toast(`Keterangan gagal disimpan: ${(e as Error).message}`, "danger"); }
    setBusy(false);
    toast(editing ? "Hold faktur diperbarui." : "Hold faktur ditambahkan.", "success");
    reset();
    setReloadKey((k) => k + 1);
  }

  async function remove(h: Hold) {
    if (!confirm(`Hapus hold faktur ${h.invoice_no}?`)) return;
    const { error } = await supabase.from("tax_invoice_holds").delete().eq("id", h.id);
    if (error) return toast(`Gagal menghapus: ${error.message}`, "danger");
    setRows(rows.filter((r) => r.id !== h.id));
  }

  const shown = rows.filter((r) => `${r.invoice_no} ${r.bp_value} ${remarks.map.get(r.invoice_no) ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-medium">Hold Faktur Pajak</h1>

      <div className={`${card} space-y-3 p-5`}>
        <h2 className="text-sm font-medium">{editing ? "Ubah hold faktur" : "Tambah hold faktur"}</h2>
        <InvoiceLookup value={inv} onChange={setInv} />
        <textarea value={ket} onChange={(e) => setKet(e.target.value)} rows={2} placeholder="Keterangan * (satu keterangan invoice — sama dengan Collection & Mitra10)" className={inputCls} />
        <div className="flex gap-2">
          {editing && <button type="button" className={btnGhost} onClick={reset}>Batal</button>}
          <button type="button" className={btnPrimary} disabled={busy} onClick={save}>{editing ? "Simpan perubahan" : "Tambah"}</button>
        </div>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <div className="flex items-center gap-2 px-4 pt-4">
          <h2 className="text-sm font-medium">Daftar Hold ({shown.length})</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" className={`${inputCls} ml-auto !w-56`} />
        </div>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Waktu</th><th className={th}>Invoice</th><th className={th}>BP_Value</th>
              <th className={th}>Invoice Date</th><th className={th}>No SJ</th><th className={th}>Keterangan</th><th className={th} />
            </tr>
          </thead>
          <tbody>
            {shown.map((h) => (
              <tr key={h.id} className="border-t border-line">
                <td className={td}>
                  {fmtTimestamp(h.created_at)}
                  <div className="text-[11px] text-fg-2">{h.created_by_name}</div>
                </td>
                <td className={td}>{h.invoice_no}</td>
                <td className={`${td} max-w-56 truncate`} title={h.bp_value}>{h.bp_value}</td>
                <td className={td}>{fmtDate(h.invoice_date)}</td>
                <td className={td}>{h.no_sj}</td>
                <td className={`${td} max-w-72 whitespace-normal`}>{remarks.map.get(h.invoice_no) ?? ""}</td>
                <td className={`${td} text-right`}>
                  <button type="button" className="px-1 text-fg-2 hover:text-fg" title="Ubah"
                    onClick={() => { setEditing(h.id); setInv({ invoice_no: h.invoice_no, bp_value: h.bp_value, invoice_date: h.invoice_date ?? "", no_sj: h.no_sj ?? "" }); setKet(remarks.map.get(h.invoice_no) ?? ""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button type="button" className="px-1 text-fg-2 hover:text-danger" title="Hapus" onClick={() => remove(h)}>
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td className={`${td} text-fg-2`} colSpan={7}>Belum ada hold faktur.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
