"use client";

import { useEffect, useMemo, useRef } from "react";
import { downloadBytes, isImage, isPdf, loadImageAsset, pageThumb, rotateAsset } from "@/lib/modules/pdf/browser";
import { mergePages, type ImageAsset, type MergeEntry, type Paper } from "@/lib/modules/pdf/ops";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Actions, Dropzone, Hint, ThumbGrid, previewOf, reorder, thumbKey, uid, useBusy, type Doc, type Docs } from "./shared";

// 3. Gabung PDF & foto: semua halaman tampil sebagai thumbnail; seret untuk mengurutkan,
// putar 90°, hapus per halaman. Foto menjadi satu halaman (A4 / Letter / ikut foto).

export type MergeItem =
  | { uid: string; kind: "doc"; docId: string; page: number; rotation: number }
  | { uid: string; kind: "image"; asset: ImageAsset };
export type MergeState = { items: MergeItem[]; photoSize: Paper; initialized: boolean };

export const fromDocs = (docs: Doc[], extras: MergeItem[] = []): MergeItem[] => [
  ...docs.flatMap((x) => Array.from({ length: x.pageCount }, (_, p): MergeItem => ({ uid: uid(), kind: "doc", docId: x.id, page: p, rotation: 0 }))),
  ...extras,
];

export function TabMerge({ d, m, setM, setSave, onPdfFiles }: {
  d: Docs; m: MergeState; setM: (fn: (m: MergeState) => MergeState) => void;
  setSave: (fn: (() => void) | null) => void; onPdfFiles: (f: File[]) => Promise<Doc[]>;
}) {
  const busy = useBusy();
  const toast = useToast();

  // Pertama kali dibuka: susun dari semua dokumen.
  const init = useRef(false);
  useEffect(() => {
    if (!init.current && !m.initialized && d.docs.length) {
      init.current = true;
      setM((s) => ({ ...s, items: fromDocs(d.docs), initialized: true }));
    }
  }, [d, m.initialized, setM]);

  // Dokumen yang dihapus dari panel ikut hilang dari daftar gabung.
  const ids = useMemo(() => new Set(d.docs.map((x) => x.id)), [d.docs]);
  useEffect(() => {
    if (m.items.some((it) => it.kind === "doc" && !ids.has(it.docId))) {
      setM((s) => ({ ...s, items: s.items.filter((it) => it.kind !== "doc" || ids.has(it.docId)) }));
    }
  }, [ids, m.items, setM]);

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    if (pdfs.length) {
      // Halaman PDF baru ditambahkan di akhir daftar.
      const added = await onPdfFiles(pdfs);
      setM((s) => ({ ...s, initialized: true, items: [...s.items, ...fromDocs(added)] }));
    }
    for (const f of files.filter((x) => !isPdf(x) && isImage(x))) {
      try {
        const asset = await loadImageAsset(f);
        setM((s) => ({ ...s, initialized: true, items: [...s.items, { uid: uid(), kind: "image", asset }] }));
      } catch (e) { toast((e as Error).message, "danger", 7000); }
    }
  }

  const docName = (id: string) => d.docs.find((x) => x.id === id)?.name ?? "?";
  const thumbs = m.items.map((it) => {
    if (it.kind === "image") return { uid: it.uid, src: async () => it.asset.dataUrl!, srcKey: `${it.uid}:${it.asset.dataUrl!.length}:${it.asset.width}`, label: it.asset.name, note: "foto" };
    const doc = d.docs.find((x) => x.id === it.docId);
    return {
      uid: it.uid, srcKey: `${doc ? thumbKey(doc) : it.docId}:${it.page}:${it.rotation}`, label: `${docName(it.docId)} · hal. ${it.page + 1}`,
      src: async () => (doc ? pageThumb(thumbKey(doc), await previewOf(doc), it.page, it.rotation) : ""),
    };
  });

  async function rotate(u: string) {
    const it = m.items.find((x) => x.uid === u);
    if (!it) return;
    if (it.kind === "doc") setM((s) => ({ ...s, items: s.items.map((x) => (x.uid === u && x.kind === "doc" ? { ...x, rotation: (x.rotation + 90) % 360 } : x)) }));
    else {
      const asset = await rotateAsset(it.asset, 90);
      setM((s) => ({ ...s, items: s.items.map((x) => (x.uid === u ? { ...x, asset } as MergeItem : x)) }));
    }
  }

  const build = () => {
    const entries: MergeEntry[] = m.items.map((it) => (it.kind === "doc" ? { kind: "doc", docId: it.docId, page: it.page, rotation: it.rotation } : { kind: "image", asset: it.asset }));
    return mergePages(entries, new Map(d.docs.map((x) => [x.id, x.bytes])), m.photoSize);
  };
  const apply = () => busy.run("Menggabungkan…", async () => {
    await d.addPdf("gabungan.pdf", await build(), "Gabung PDF", true);
    toast("gabungan.pdf dibuat dan menjadi dokumen aktif.", "success");
  });
  const download = () => busy.run("Menyiapkan unduhan…", async () => downloadBytes(await build(), "gabungan.pdf"));

  useEffect(() => { setSave(m.items.length ? () => void download() : null); });

  const pdfPages = m.items.filter((x) => x.kind === "doc").length;
  const photos = m.items.length - pdfPages;

  return (
    <div className="space-y-4">
      <Hint>Semua halaman dari dokumen (dan foto tambahan) tampil di bawah. <b>Seret</b> untuk mengatur urutan, putar atau hapus per halaman, lalu terapkan. Foto menjadi satu halaman.</Hint>
      <Actions>
        <button type="button" className={btnPrimary} onClick={apply} disabled={!m.items.length}><span className="material-symbols-outlined !text-base">check</span>Terapkan (buat gabungan.pdf)</button>
        <button type="button" className={btnGhost} onClick={download} disabled={!m.items.length}><span className="material-symbols-outlined !text-base">download</span>Unduh hasil</button>
        <button type="button" className={btnGhost} onClick={() => setM((s) => ({ ...s, items: fromDocs(d.docs, s.items.filter((x) => x.kind === "image")), initialized: true }))} disabled={!d.docs.length}>
          <span className="material-symbols-outlined !text-base">refresh</span>Susun ulang dari dokumen
        </button>
        <button type="button" className={`${btnGhost} hover:text-danger`} disabled={!m.items.length}
          onClick={() => { if (window.confirm("Kosongkan daftar halaman gabung?")) setM((s) => ({ ...s, items: [] })); }}>Reset</button>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-2">Ukuran halaman foto</span>
          <select value={m.photoSize} onChange={(e) => setM((s) => ({ ...s, photoSize: e.target.value as Paper }))} className={`${inputCls} !w-auto`}>
            <option value="a4">A4</option><option value="letter">Letter</option><option value="auto">Ikut ukuran foto</option>
          </select>
        </label>
        <span className="text-xs text-fg-2">{pdfPages} halaman PDF · {photos} foto · total {m.items.length}</span>
      </Actions>
      <Dropzone compact onFiles={(f) => void addFiles(f)} accept="application/pdf,.pdf,image/*" title="Tambah PDF atau foto ke gabungan" />
      {m.items.length > 0 && (
        <ThumbGrid items={thumbs}
          onMove={(f, t, after) => setM((s) => ({ ...s, items: reorder(s.items, f, t, after) }))}
          onRotate={(u) => void rotate(u)}
          onRemove={(u) => setM((s) => ({ ...s, items: s.items.filter((x) => x.uid !== u) }))} />
      )}
    </div>
  );
}
