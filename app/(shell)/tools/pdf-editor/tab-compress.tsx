"use client";

import { useEffect, useState } from "react";
import { compressRaster, downloadBytes } from "@/lib/modules/pdf/browser";
import { COMPRESS_PRESETS, compressLossless, formatBytes, withSuffix, type Quality } from "@/lib/modules/pdf/ops";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Actions, Hint, previewOf, useBusy, type Doc, type Docs } from "./shared";

// 5. Kompres PDF: "Aman" (teks utuh, simpan ulang ringkas) atau "Kuat" (halaman jadi gambar JPEG).
type Method = "lossless" | "raster";

export function TabCompress({ d, setSave }: { d: Docs; setSave: (fn: (() => void) | null) => void }) {
  const busy = useBusy();
  const toast = useToast();
  const [method, setMethod] = useState<Method>("lossless");
  const [quality, setQuality] = useState<Quality>("sedang");
  const [result, setResult] = useState<{ docId: string; before: number; after: number; label: string } | null>(null);
  const a = d.active;

  const compress = (doc: Doc, label: (l: string) => void) => method === "lossless"
    ? compressLossless(doc.bytes)
    : previewOf(doc).then((p) => compressRaster(p, quality, (i, n) => label(`Mengompres halaman ${i}/${n}…`)));
  const methodLabel = method === "lossless" ? "Kompres aman" : `Kompres kuat (${COMPRESS_PRESETS[quality].label.split(" — ")[0]})`;

  const apply = () => a && busy.run("Mengompres…", async (label) => {
    const out = await compress(a, label);
    if (out.byteLength >= a.size) {
      toast(`Hasil tidak lebih kecil (${formatBytes(out.byteLength)}). Dokumen tidak diubah${method === "lossless" ? " — coba metode Kuat" : ""}.`, "warning", 7000);
      return;
    }
    await d.update(a, out, method === "lossless" ? "Kompres aman" : "Kompres kuat");
    setResult({ docId: a.id, before: a.size, after: out.byteLength, label: methodLabel });
    toast("Dokumen berhasil dikecilkan.", "success");
  });
  const download = () => a && busy.run("Mengompres…", async (label) => downloadBytes(await compress(a, label), withSuffix(a.name, "-kompres")));

  useEffect(() => { setSave(a ? () => void download() : null); });

  if (!a) return <Hint>Tambahkan PDF di panel Dokumen untuk memperkecil ukurannya.</Hint>;
  return (
    <div className="space-y-4">
      <Hint>Memperkecil ukuran <b>{a.name}</b> ({formatBytes(a.size)}, {a.pageCount} halaman).</Hint>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col">
          <span className="text-fg-2">Metode</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={`${inputCls} mt-1 !w-auto`}>
            <option value="lossless">Aman — teks tetap utuh</option><option value="raster">Kuat — ubah halaman jadi gambar</option>
          </select>
        </label>
        {method === "raster" && (
          <label className="flex flex-col">
            <span className="text-fg-2">Kualitas gambar</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className={`${inputCls} mt-1 !w-auto`}>
              {(Object.keys(COMPRESS_PRESETS) as Quality[]).map((k) => <option key={k} value={k}>{COMPRESS_PRESETS[k].label}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-fg-2">
        {method === "lossless"
          ? "Aman: struktur PDF disimpan ulang lebih ringkas. Biasanya 0–25% lebih kecil; teks tetap bisa dipilih & dicari."
          : <span className="text-warning">Kuat: setiap halaman diubah menjadi gambar — ukuran jauh lebih kecil, tetapi teks tidak bisa dipilih/dicari lagi.</span>}
      </p>
      <Actions>
        <button type="button" className={btnPrimary} onClick={apply}><span className="material-symbols-outlined !text-base">check</span>Terapkan ke dokumen</button>
        <button type="button" className={btnGhost} onClick={download}><span className="material-symbols-outlined !text-base">download</span>Unduh hasil kompresi</button>
      </Actions>
      {result && result.docId === a.id && (
        <div className="rounded-lg bg-success/10 p-3 text-sm text-success">
          Berhasil dikecilkan {(((result.before - result.after) / result.before) * 100).toFixed(1)}% · {result.label} · {formatBytes(result.before)} → {formatBytes(result.after)}
        </div>
      )}
    </div>
  );
}
