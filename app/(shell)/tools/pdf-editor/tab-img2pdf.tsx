"use client";

import { useEffect } from "react";
import { downloadBytes, rotateAsset } from "@/lib/modules/pdf/browser";
import { imagesToPdf, type ImageAsset, type Margin, type Orientation, type Paper } from "@/lib/modules/pdf/ops";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Actions, Dropzone, Hint, ThumbGrid, reorder, useBusy, type Docs } from "./shared";

// 4. Gambar ke PDF: setiap foto satu halaman, selalu proporsional & di tengah.
export type ImgItem = { uid: string; asset: ImageAsset };
export type ImgState = { items: ImgItem[]; paper: Paper; orient: Orientation; margin: Margin };

export function TabImg2Pdf({ d, s, setS, onImages, setSave }: {
  d: Docs; s: ImgState; setS: (fn: (s: ImgState) => ImgState) => void; onImages: (f: File[]) => void; setSave: (fn: (() => void) | null) => void;
}) {
  const busy = useBusy();
  const toast = useToast();
  const build = () => imagesToPdf(s.items.map((x) => x.asset), { paper: s.paper, orient: s.orient, margin: s.margin });
  const apply = () => busy.run("Membuat PDF dari foto…", async () => {
    await d.addPdf("foto-ke-pdf.pdf", await build(), "Gambar ke PDF", true);
    toast("foto-ke-pdf.pdf dibuat dan menjadi dokumen aktif.", "success");
  });
  const download = () => busy.run("Menyiapkan unduhan…", async () => downloadBytes(await build(), "foto-ke-pdf.pdf"));

  useEffect(() => { setSave(s.items.length ? () => void download() : null); });

  return (
    <div className="space-y-4">
      <Hint>Pilih atau seret beberapa foto — setiap foto menjadi satu halaman PDF. Seret untuk mengurutkan, putar bila perlu. Foto tidak akan gepeng atau terpotong.</Hint>
      <Actions>
        <button type="button" className={btnPrimary} onClick={apply} disabled={!s.items.length}><span className="material-symbols-outlined !text-base">check</span>Terapkan (buat foto-ke-pdf.pdf)</button>
        <button type="button" className={btnGhost} onClick={download} disabled={!s.items.length}><span className="material-symbols-outlined !text-base">download</span>Unduh hasil</button>
        <button type="button" className={`${btnGhost} hover:text-danger`} disabled={!s.items.length}
          onClick={() => { if (window.confirm("Hapus semua foto dari daftar?")) setS((x) => ({ ...x, items: [] })); }}>Reset</button>
      </Actions>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col">
          <span className="text-fg-2">Ukuran kertas</span>
          <select value={s.paper} onChange={(e) => setS((x) => ({ ...x, paper: e.target.value as Paper }))} className={`${inputCls} mt-1 !w-auto`}>
            <option value="auto">Ikut ukuran foto (tanpa area kosong)</option><option value="a4">A4</option><option value="letter">Letter</option>
          </select>
        </label>
        {s.paper !== "auto" && (
          <label className="flex flex-col">
            <span className="text-fg-2">Orientasi</span>
            <select value={s.orient} onChange={(e) => setS((x) => ({ ...x, orient: e.target.value as Orientation }))} className={`${inputCls} mt-1 !w-auto`}>
              <option value="auto">Otomatis (ikut foto)</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
            </select>
          </label>
        )}
        <label className="flex flex-col">
          <span className="text-fg-2">Margin</span>
          <select value={s.margin} onChange={(e) => setS((x) => ({ ...x, margin: e.target.value as Margin }))} className={`${inputCls} mt-1 !w-auto`}>
            <option value="none">Tanpa margin</option><option value="small">Kecil</option><option value="medium">Sedang</option>
          </select>
        </label>
        <span className="text-xs text-fg-2">{s.items.length} foto</span>
      </div>
      <Dropzone compact={s.items.length > 0} onFiles={onImages} accept="image/*" title="Seret foto ke sini atau klik untuk memilih" hint="JPG, PNG, WebP, GIF, BMP (HEIC dari iPhone belum didukung browser)" />
      {s.items.length > 0 && (
        <ThumbGrid
          items={s.items.map((x) => ({ uid: x.uid, src: async () => x.asset.dataUrl!, srcKey: `${x.uid}:${x.asset.width}x${x.asset.height}:${x.asset.dataUrl!.length}`, label: x.asset.name, note: `${x.asset.width}×${x.asset.height}` }))}
          onMove={(f, t, after) => setS((x) => ({ ...x, items: reorder(x.items, f, t, after) }))}
          onRotate={async (u) => {
            const it = s.items.find((x) => x.uid === u);
            if (!it) return;
            const asset = await rotateAsset(it.asset, 90);
            setS((x) => ({ ...x, items: x.items.map((y) => (y.uid === u ? { ...y, asset } : y)) }));
          }}
          onRemove={(u) => setS((x) => ({ ...x, items: x.items.filter((y) => y.uid !== u) }))} />
      )}
    </div>
  );
}
