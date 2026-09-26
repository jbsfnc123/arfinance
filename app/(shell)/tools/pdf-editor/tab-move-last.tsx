"use client";

import { useEffect } from "react";
import { downloadBytes, downloadZip, pageThumb } from "@/lib/modules/pdf/browser";
import { lastToFirstOrder, moveLastPageToFirst, uniqueNames } from "@/lib/modules/pdf/ops";
import { btnGhost, btnPrimary } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Actions, Hint, ThumbImage, previewOf, thumbKey, useBusy, type Docs } from "./shared";

const PREVIEW_LIMIT = 12;
const STEP = "Pindah halaman terakhir";

// 1. Pindah Halaman Terakhir ke Depan — satu atau semua dokumen sekaligus, nama file tetap.
export function TabMoveLast({ d, setSave }: { d: Docs; setSave: (fn: (() => void) | null) => void }) {
  const busy = useBusy();
  const toast = useToast();
  const a = d.active;

  async function applyActive() {
    if (!a) return;
    if (a.pageCount <= 1) return toast("Dokumen hanya 1 halaman — tidak ada yang dipindah.", "info");
    await busy.run("Memindahkan halaman…", async () => {
      const r = await moveLastPageToFirst(a.bytes);
      await d.update(a, r.bytes, STEP);
      toast("Halaman terakhir dipindah ke depan.", "success");
    });
  }

  async function applyAll() {
    await busy.run("Memproses semua dokumen…", async (label) => {
      let n = 0;
      for (const [i, x] of d.docs.entries()) {
        label(`Memproses ${i + 1}/${d.docs.length}…`);
        if (x.pageCount <= 1) continue;
        await d.update(x, (await moveLastPageToFirst(x.bytes)).bytes, STEP);
        n++;
      }
      toast(`${n} dokumen diproses${d.docs.length - n ? `, ${d.docs.length - n} dilewati (1 halaman)` : ""}.`, "success");
    });
  }

  async function downloadActive() {
    if (!a) return;
    await busy.run("Menyiapkan unduhan…", async () => downloadBytes((await moveLastPageToFirst(a.bytes)).bytes, a.name));
  }

  async function downloadAll() {
    await busy.run("Menyiapkan ZIP…", async () => {
      const names = uniqueNames(d.docs.map((x) => x.name));
      const files = [];
      for (const [i, x] of d.docs.entries()) files.push({ name: names[i], bytes: (await moveLastPageToFirst(x.bytes)).bytes });
      await downloadZip(files, "hasil-pdf.zip");
    });
  }

  useEffect(() => { setSave(a ? () => void downloadActive() : null); });

  if (!a) return <Hint>Tambahkan PDF di panel Dokumen. Alat ini memindahkan <b>halaman terakhir menjadi halaman pertama</b>, untuk satu atau semua dokumen sekaligus.</Hint>;
  const order = lastToFirstOrder(a.pageCount).slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-4">
      <Hint>Halaman terakhir dipindah menjadi halaman pertama; nama file tetap sama. Pratinjau di bawah menunjukkan urutan hasil untuk <b>{a.name}</b>.</Hint>
      <Actions>
        <button type="button" className={btnPrimary} onClick={applyActive}><span className="material-symbols-outlined !text-base">check</span>Terapkan ke dokumen</button>
        <button type="button" className={btnGhost} onClick={applyAll} disabled={d.docs.length < 2}>Terapkan ke semua dokumen</button>
        <button type="button" className={btnGhost} onClick={downloadActive}><span className="material-symbols-outlined !text-base">download</span>Unduh hasil</button>
        <button type="button" className={btnGhost} onClick={downloadAll}><span className="material-symbols-outlined !text-base">folder_zip</span>Unduh semua (ZIP)</button>
      </Actions>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {order.map((src, i) => (
          <div key={`${a.rev}-${i}`} className="rounded-xl border border-line bg-surface-2 p-2">
            <ThumbImage srcKey={`${thumbKey(a)}:${src}`} src={async () => pageThumb(thumbKey(a), await previewOf(a), src)} />
            <div className="mt-1 flex items-center gap-1 text-xs">
              <span className="rounded bg-surface px-1.5">{i + 1}</span>
              <span className={i === 0 && a.pageCount > 1 ? "text-accent" : "text-fg-2"}>{i === 0 && a.pageCount > 1 ? "dari halaman terakhir" : `asal hal. ${src + 1}`}</span>
            </div>
          </div>
        ))}
      </div>
      {a.pageCount > PREVIEW_LIMIT && <p className="text-xs text-fg-2">Pratinjau dibatasi {PREVIEW_LIMIT} halaman pertama dari {a.pageCount}.</p>}
    </div>
  );
}
