"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceFields } from "@/lib/modules/faktur/constants";
import { btnGhost, inputCls } from "@/components/ui";

// Cari No Invoice → isi otomatis BP_Value, Invoice Date, No SJ (port lookupInvoice).
// Bila tidak ditemukan, semua kolom tetap bisa diisi manual.
export function InvoiceLookup({ value, onChange }: { value: InvoiceFields; onChange: (v: InvoiceFields) => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "missing">("idle");

  async function lookup() {
    const no = value.invoice_no.trim();
    if (!no) return;
    setStatus("loading");
    const { data } = await createClient().rpc("lookup_invoice", { p_invoice_no: no });
    const hit = data?.[0];
    if (hit) {
      onChange({ invoice_no: hit.invoice_no, bp_value: hit.bp_value ?? "", invoice_date: hit.invoice_date ?? "", no_sj: hit.no_sj ?? "" });
      setStatus("found");
    } else setStatus("missing");
  }

  const set = (k: keyof InvoiceFields) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={value.invoice_no}
          onChange={(e) => { onChange({ ...value, invoice_no: e.target.value }); setStatus("idle"); }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), lookup())}
          placeholder="No Invoice"
          className={inputCls}
        />
        <button type="button" className={btnGhost} onClick={lookup} disabled={status === "loading"}>
          <span className="material-symbols-outlined">search</span>Cari
        </button>
      </div>
      {status === "found" && <p className="text-xs text-success">Data invoice ditemukan dan diisi otomatis.</p>}
      {status === "missing" && <p className="text-xs text-warning">Invoice tidak ditemukan di data tagihan — isi manual.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <input value={value.bp_value} onChange={set("bp_value")} placeholder="Business Partner_Value" className={`${inputCls} sm:col-span-3`} />
        <input type="date" value={value.invoice_date} onChange={set("invoice_date")} title="Invoice Date" className={inputCls} />
        <input value={value.no_sj} onChange={set("no_sj")} placeholder="No SJ" className={`${inputCls} sm:col-span-2`} />
      </div>
    </div>
  );
}
