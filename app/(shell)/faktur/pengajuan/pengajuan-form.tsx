"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_INVOICE, REASON_OPTIONS, REQUEST_OPTIONS, type InvoiceFields } from "@/lib/modules/faktur/constants";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { InvoiceLookup } from "../invoice-lookup";

type Item = InvoiceFields & { tax_no: string; request: string; reason: string; keterangan: string };

export function PengajuanForm() {
  const toast = useToast();
  const [inv, setInv] = useState<InvoiceFields>(EMPTY_INVOICE);
  const [taxNo, setTaxNo] = useState("");
  const [request, setRequest] = useState<string>(REQUEST_OPTIONS[0]);
  const [reason, setReason] = useState<string>("");
  const [keterangan, setKeterangan] = useState("");
  const [queue, setQueue] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  const current: Item = { ...inv, tax_no: taxNo.trim(), request, reason, keterangan: keterangan.trim() };
  const valid = (i: Item) => !!(i.invoice_no.trim() && i.bp_value.trim() && i.tax_no && i.reason && i.keterangan);

  function addToQueue() {
    if (!valid(current)) return toast("Lengkapi No Invoice, BP_Value, Tax No, alasan, dan keterangan.", "warning");
    if (queue.some((q) => q.invoice_no === current.invoice_no)) return toast("Invoice ini sudah ada di daftar.", "warning");
    setQueue([...queue, current]);
    setInv(EMPTY_INVOICE); // request, alasan, keterangan tetap
    setTaxNo("");
  }

  async function submit() {
    const items = valid(current) && !queue.some((q) => q.invoice_no === current.invoice_no) ? [...queue, current] : queue;
    if (!items.length) return toast("Belum ada invoice yang lengkap untuk dikirim.", "warning");
    setBusy(true);
    const { error } = await createClient().from("tax_invoice_requests").insert(
      items.map((i) => ({
        bp_value: i.bp_value.trim(), invoice_date: i.invoice_date || null, invoice_no: i.invoice_no.trim(),
        no_sj: i.no_sj.trim() || null, tax_no: i.tax_no, request: i.request, reason: i.reason, keterangan: i.keterangan,
      })),
    );
    setBusy(false);
    if (error) return toast(`Gagal mengirim: ${error.message}`, "danger", 6000);
    toast(`${items.length} pengajuan terkirim.`, "success");
    setQueue([]);
    setInv(EMPTY_INVOICE);
    setTaxNo("");
    setKeterangan("");
  }

  return (
    <div className="mt-6 space-y-4">
      <div className={`${card} space-y-3 p-5`}>
        <InvoiceLookup value={inv} onChange={setInv} />
        <input value={taxNo} onChange={(e) => setTaxNo(e.target.value)} placeholder="Tax No (No Faktur Pajak) *" className={inputCls} />
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={request} onChange={(e) => setRequest(e.target.value)} className={inputCls}>
            {REQUEST_OPTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
            <option value="">Reason Category *</option>
            {REASON_OPTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={3} placeholder="Keterangan *" className={inputCls} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={addToQueue}>
            <span className="material-symbols-outlined">playlist_add</span>Tambah invoice lain
          </button>
          <button type="button" className={btnPrimary} onClick={submit} disabled={busy}>
            <span className="material-symbols-outlined">send</span>
            {busy ? "Mengirim…" : `Kirim pengajuan${queue.length ? ` (${queue.length + (valid(current) ? 1 : 0)} invoice)` : ""}`}
          </button>
        </div>
      </div>

      {queue.length > 0 && (
        <div className={`${card} divide-y divide-line`}>
          {queue.map((q, i) => (
            <div key={q.invoice_no} className="flex items-start gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">#{i + 1} {q.invoice_no} <span className="text-xs text-fg-2">{fmtDate(q.invoice_date)}</span></div>
                <div className="text-xs text-fg-2">{q.bp_value} · Tax {q.tax_no} · {q.request} · {q.reason}</div>
              </div>
              <button type="button" className="text-fg-2 hover:text-danger" onClick={() => setQueue(queue.filter((_, j) => j !== i))} aria-label="Hapus dari daftar">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
