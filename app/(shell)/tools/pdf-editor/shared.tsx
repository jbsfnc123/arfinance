"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { closePdf, forgetThumbs, isImage, isPdf, openPdf } from "@/lib/modules/pdf/browser";
import { useToast } from "@/components/toast";

// ── Dokumen bersama (hanya di memori browser; hilang saat halaman ditutup) ──
export type Doc = {
  id: string; name: string; bytes: Uint8Array; pageCount: number; size: number;
  steps: string[]; rev: number; prev: { bytes: Uint8Array; steps: string[]; pageCount: number } | null;
};

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Pratinjau pdf.js per dokumen (dibuka sekali per revisi, dilepas saat diganti).
const previews = new Map<string, { rev: number; doc: Promise<PDFDocumentProxy> }>();
export function previewOf(d: Doc) {
  const hit = previews.get(d.id);
  if (hit && hit.rev === d.rev) return hit.doc;
  if (hit) { hit.doc.then(closePdf, () => undefined); forgetThumbs(`${d.id}@${hit.rev}`); }
  const doc = openPdf(d.bytes);
  previews.set(d.id, { rev: d.rev, doc });
  return doc;
}
function dropPreview(id: string) {
  const hit = previews.get(id);
  if (hit) { hit.doc.then(closePdf, () => undefined); forgetThumbs(`${id}@${hit.rev}`); previews.delete(id); }
}
export const thumbKey = (d: Doc) => `${d.id}@${d.rev}`;

export function useDocs() {
  const toast = useToast();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = docs.find((d) => d.id === activeId) ?? null;

  const addPdf = useCallback(async (name: string, bytes: Uint8Array, step = "Diunggah", makeActive = false) => {
    const pdf = await openPdf(bytes); // validasi: PDF rusak/berpassword ditolak
    const doc: Doc = { id: uid(), name, bytes, pageCount: pdf.numPages, size: bytes.byteLength, steps: [step], rev: 0, prev: null };
    previews.set(doc.id, { rev: 0, doc: Promise.resolve(pdf) });
    setDocs((ds) => [...ds, doc]);
    setActiveId((cur) => (makeActive || !cur ? doc.id : cur));
    return doc;
  }, []);

  // Hasil alat diterapkan ke dokumen: dicek dulu bisa dibaca, simpan versi lama untuk "Batalkan".
  const update = useCallback(async (d: Doc, bytes: Uint8Array, step: string) => {
    const pdf = await openPdf(bytes);
    const next: Doc = { ...d, bytes, size: bytes.byteLength, pageCount: pdf.numPages, steps: [...d.steps, step], rev: d.rev + 1,
      prev: { bytes: d.bytes, steps: d.steps, pageCount: d.pageCount } };
    dropPreview(d.id);
    previews.set(d.id, { rev: next.rev, doc: Promise.resolve(pdf) });
    setDocs((ds) => ds.map((x) => (x.id === d.id ? next : x)));
    return next;
  }, []);

  const undo = useCallback((d: Doc) => {
    if (!d.prev) return;
    dropPreview(d.id);
    setDocs((ds) => ds.map((x) => (x.id === d.id && x.prev
      ? { ...x, bytes: x.prev.bytes, steps: x.prev.steps, pageCount: x.prev.pageCount, size: x.prev.bytes.byteLength, rev: x.rev + 1, prev: null } : x)));
    toast("Langkah terakhir dibatalkan.", "info");
  }, [toast]);

  const remove = useCallback((id: string) => {
    dropPreview(id);
    const rest = docs.filter((x) => x.id !== id);
    setDocs(rest);
    if (activeId === id) setActiveId(rest[0]?.id ?? null);
  }, [docs, activeId]);

  const clear = useCallback(() => {
    docs.forEach((d) => dropPreview(d.id));
    setDocs([]);
    setActiveId(null);
  }, [docs]);

  return { docs, active, activeId, setActiveId, addPdf, update, undo, remove, clear };
}
export type Docs = ReturnType<typeof useDocs>;

// Pisahkan file masuk: PDF → dokumen, gambar → dikembalikan ke pemanggil; lainnya dilewati.
export function classify(files: File[]) {
  const pdfs = files.filter(isPdf);
  const images = files.filter((f) => !isPdf(f) && isImage(f));
  return { pdfs, images, rejected: files.length - pdfs.length - images.length };
}

// ── Indikator proses (dengan label progres) ──────────────────────
type Busy = { run: <T>(label: string, fn: (setLabel: (l: string) => void) => Promise<T>) => Promise<T | undefined> };
export const BusyContext = createContext<Busy>({ run: async () => undefined });
export const useBusy = () => useContext(BusyContext);

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [label, setLabel] = useState<string | null>(null);
  const count = useRef(0);
  const run: Busy["run"] = useCallback(async (l, fn) => {
    count.current++;
    setLabel(l);
    try {
      return await fn((x) => setLabel(x));
    } catch (e) {
      toast((e as Error).message || "Terjadi kesalahan.", "danger", 7000);
      return undefined;
    } finally {
      count.current--;
      if (!count.current) setLabel(null);
    }
  }, [toast]);
  return (
    <BusyContext.Provider value={{ run }}>
      {children}
      {label && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm shadow-lg">
            <span className="material-symbols-outlined animate-spin text-accent">progress_activity</span>{label}
          </div>
        </div>
      )}
    </BusyContext.Provider>
  );
}

// ── Area seret / pilih file ──────────────────────────────────────
export function Dropzone({ onFiles, accept, title, hint, compact }: {
  onFiles: (files: File[]) => void; accept: string; title: string; hint?: string; compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div role="button" tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); onFiles([...e.dataTransfer.files]); }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center ${compact ? "p-4" : "p-10"} ${over ? "border-accent bg-surface-2" : "border-line hover:bg-surface-2"}`}>
      <span className={`material-symbols-outlined text-accent ${compact ? "" : "!text-4xl"}`}>upload_file</span>
      <span className="text-sm font-medium">{title}</span>
      {hint && <span className="text-xs text-fg-2">{hint}</span>}
      <input ref={input} type="file" multiple accept={accept} className="hidden"
        onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </div>
  );
}

// ── Grid thumbnail: seret untuk mengurutkan, putar, hapus ────────
export type Thumb = { uid: string; src: () => Promise<string>; srcKey: string; label: string; note?: string };

export function ThumbGrid({ items, onMove, onRotate, onRemove }: {
  items: Thumb[]; onMove: (from: string, to: string, after: boolean) => void; onRotate: (uid: string) => void; onRemove: (uid: string) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((t, i) => (
        <div key={t.uid} draggable
          onDragStart={(e) => { setDrag(t.uid); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => setDrag(null)}
          onDragOver={(e) => { if (drag) e.preventDefault(); }}
          onDrop={(e) => {
            if (!drag || drag === t.uid) return;
            e.preventDefault(); e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onMove(drag, t.uid, e.clientX > r.left + r.width / 2);
            setDrag(null);
          }}
          className={`group rounded-xl border bg-surface-2 p-2 ${drag === t.uid ? "opacity-40" : "border-line"}`}>
          <ThumbImage src={t.src} srcKey={t.srcKey} />
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className="rounded bg-surface px-1.5">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-fg-2" title={t.label}>{t.label}{t.note ? ` · ${t.note}` : ""}</span>
            <button type="button" title="Putar 90°" onClick={() => onRotate(t.uid)} className="rounded p-0.5 hover:bg-surface">
              <span className="material-symbols-outlined !text-base">rotate_right</span>
            </button>
            <button type="button" title="Hapus" onClick={() => onRemove(t.uid)} className="rounded p-0.5 hover:bg-surface hover:text-danger">
              <span className="material-symbols-outlined !text-base">close</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThumbImage({ src, srcKey }: { src: () => Promise<string>; srcKey: string }) {
  const [state, setState] = useState<{ key: string; url: string | null }>({ key: "", url: null });
  const fn = useRef(src);
  useEffect(() => { fn.current = src; });
  useEffect(() => {
    let alive = true;
    fn.current().then((u) => { if (alive) setState({ key: srcKey, url: u }); }, () => undefined);
    return () => { alive = false; };
  }, [srcKey]);
  const url = state.key === srcKey ? state.url : null;
  return (
    <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- dataURL lokal, bukan aset untuk dioptimasi */}
      {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
        : <span className="material-symbols-outlined animate-spin text-fg-2">progress_activity</span>}
    </div>
  );
}

// Pindahkan elemen `from` ke sebelum/sesudah `to`.
export function reorder<T extends { uid: string }>(list: T[], from: string, to: string, after: boolean) {
  const item = list.find((x) => x.uid === from);
  if (!item) return list;
  const rest = list.filter((x) => x.uid !== from);
  const idx = rest.findIndex((x) => x.uid === to);
  if (idx < 0) return list;
  rest.splice(after ? idx + 1 : idx, 0, item);
  return rest;
}

// Tombol aksi seragam di tiap tab.
export function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-fg-2">{children}</p>;
}
