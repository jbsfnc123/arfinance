"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaxInvoice } from "@/lib/modules/coretax/coretax";
import { fmtDate } from "@/lib/format";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";

// Pengganti sheet "Hapus": daftar No Referensi disimpan di database dan bisa diubah di sini.
export function DeleteListModal(props: {
  open: boolean;
  onClose: () => void;
  match: (refs: string[]) => { found: TaxInvoice[]; notFound: string[] };
  onExecute: (ids: number[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { open } = props;

  useEffect(() => {
    if (!open) return;
    supabase.from("coretax_delete_list").select("ref_desc").order("created_at").then(({ data }) => {
      const refs = (data ?? []).map((d) => d.ref_desc);
      setSaved(refs);
      setText(refs.join("\n"));
    });
  }, [open, supabase]);

  const refs = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const result = props.match(refs);
  const dirty = refs.join("\n") !== saved.join("\n");

  async function saveList() {
    setBusy(true);
    const { error: e1 } = await supabase.from("coretax_delete_list").delete().neq("ref_desc", "");
    const unique = [...new Set(refs)];
    const { error: e2 } = e1 || !unique.length ? { error: e1 } : await supabase.from("coretax_delete_list").insert(unique.map((ref_desc) => ({ ref_desc })));
    setBusy(false);
    if (e1 || e2) return toast(`Gagal menyimpan daftar: ${(e1 ?? e2)!.message}`, "danger");
    setSaved(unique);
    toast("Daftar hapus disimpan.", "success");
  }

  return (
    <Modal
      open={open}
      onClose={props.onClose}
      title="Hapus Otomatis dari Daftar"
      wide
      footer={
        <>
          <button type="button" className={btnGhost} disabled={!dirty || busy} onClick={saveList}>Simpan daftar</button>
          <button type="button" className={btnPrimary} disabled={!result.found.length}
            onClick={() => { props.onExecute(result.found.map((i) => i.id)); props.onClose(); }}>
            {result.found.length ? `Hapus ${result.found.length} Faktur` : "Tidak ada yang dihapus"}
          </button>
        </>
      }
    >
      <label className="block text-sm">
        <span className="text-fg-2">No Referensi faktur yang akan dihapus (satu per baris). Daftar ini tersimpan untuk dipakai lagi.</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"SI/069757/VI/XXVI/TRA\nSI/070387/VI/XXVI/TRA"}
          className={`${inputCls} mt-1 font-mono text-xs`} />
      </label>

      {result.found.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium text-success">✓ Akan dihapus ({result.found.length} faktur)</div>
          <ul className="mt-1 max-h-48 overflow-y-auto text-xs">
            {result.found.map((i) => (
              <li key={i.id} className="flex gap-3 border-b border-line py-1">
                <span className="font-mono">{i.RefDesc}</span><span className="flex-1 truncate">{i.BuyerName}</span>
                <span>{fmtDate(i.TaxInvoiceDate.trim())}</span><span>{i.goods.length} item</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.notFound.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium text-warning">⚠ Tidak ditemukan ({result.notFound.length} referensi)</div>
          <p className="mt-1 max-h-24 overflow-y-auto font-mono text-xs text-fg-2">{result.notFound.join(", ")}</p>
        </div>
      )}
      {refs.length > 0 && !result.found.length && <p className="mt-4 text-sm text-fg-2">Tidak ada faktur aktif yang cocok dengan daftar.</p>}
    </Modal>
  );
}
