"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildWaMessage, DEFAULT_WA_TEMPLATE, effectiveTemplate, type WaTemplate } from "@/lib/modules/collection/wa-message";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";

const SAMPLE = [
  { invoice_no: "SI/1005789/IX/XXVI", due_date: "2026-09-15", open_amt: 1500000 },
  { invoice_no: "SI/1005790/IX/XXVI", due_date: "2026-10-01", open_amt: 250000 },
];

export function WaTemplateForm({ initial }: { initial: Partial<WaTemplate> | null }) {
  const router = useRouter();
  const toast = useToast();
  const [tpl, setTpl] = useState<WaTemplate>(effectiveTemplate(null, initial));
  const [busy, setBusy] = useState(false);

  async function save(value: WaTemplate, message: string) {
    setBusy(true);
    const { error } = await createClient()
      .from("app_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", "wa_template");
    setBusy(false);
    if (error) return toast(`Gagal menyimpan: ${error.message}`, "danger");
    toast(message, "success");
    router.refresh();
  }

  return (
    <div className={`${card} mt-6 space-y-3 p-5`}>
      <label className="block text-sm">
        <span className="text-fg-2">Header</span>
        <textarea value={tpl.header} onChange={(e) => setTpl({ ...tpl, header: e.target.value })} rows={3} className={`${inputCls} mt-1`} />
      </label>
      <label className="block text-sm">
        <span className="text-fg-2">Footer</span>
        <textarea value={tpl.footer} onChange={(e) => setTpl({ ...tpl, footer: e.target.value })} rows={5} className={`${inputCls} mt-1`} />
      </label>
      <p className="text-xs text-fg-2">
        Placeholder: <code>{"{{collection}}"}</code> = nama collection, <code>{"{{total}}"}</code> = total tagihan.
      </p>

      <div>
        <div className="text-xs text-fg-2">Pratinjau</div>
        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{buildWaMessage(SAMPLE, "Nama Collection", tpl)}</pre>
      </div>

      <div className="flex gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => save({ header: tpl.header.trim(), footer: tpl.footer.trim() }, "Template WA disimpan.")}>
          Simpan Template
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={busy}
          onClick={() => {
            setTpl(DEFAULT_WA_TEMPLATE);
            // String kosong = pakai template bawaan (sama seperti "Reset Default" lama).
            save({ header: "", footer: "" }, "Template dikembalikan ke bawaan.");
          }}
        >
          Reset Default
        </button>
      </div>
    </div>
  );
}
