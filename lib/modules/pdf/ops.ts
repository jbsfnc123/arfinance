import { degrees, PDFDocument } from "pdf-lib";

// Operasi PDF murni (pdf-lib) — dipakai PDF Editor di browser, dapat dites di Node.
// Port dari "Tools Support/pdf-editor-local/script.js". Tidak ada yang dikirim ke server.

// dataUrl hanya untuk tampilan di browser (dan simpan sementara posisi tempel gambar).
export type ImageAsset = { name: string; bytes: Uint8Array; mime: "image/png" | "image/jpeg"; width: number; height: number; dataUrl?: string };
export type Paper = "auto" | "a4" | "letter";
export type Orientation = "auto" | "portrait" | "landscape";
export type Margin = "none" | "small" | "medium";

export const PAPER = { a4: [595.28, 841.89], letter: [612, 792] } as const;
export const MARGINS: Record<Margin, number> = { none: 0, small: 18, medium: 36 };
const AUTO_PAGE_LONG_SIDE = 842; // pt, sisi panjang A4

// pdf.js/pdf-lib bisa melepas (detach) buffer → selalu bekerja dengan salinan.
const copy = (b: Uint8Array) => b.slice();

export async function pageCount(bytes: Uint8Array) {
  return (await PDFDocument.load(copy(bytes))).getPageCount();
}

// 1. Halaman terakhir dipindah ke depan: [n-1, 0..n-2]. Dokumen 1 halaman tidak diubah.
export async function moveLastPageToFirst(bytes: Uint8Array) {
  const src = await PDFDocument.load(copy(bytes));
  const total = src.getPageCount();
  if (total <= 1) return { bytes, order: total ? [0] : [], changed: false };
  const order = [total - 1, ...Array.from({ length: total - 1 }, (_, i) => i)];
  const out = await PDFDocument.create();
  for (const p of await out.copyPages(src, order)) out.addPage(p);
  return { bytes: await out.save(), order, changed: true };
}

export const lastToFirstOrder = (total: number) =>
  total <= 1 ? Array.from({ length: total }, (_, i) => i) : [total - 1, ...Array.from({ length: total - 1 }, (_, i) => i)];

function embed(doc: PDFDocument, a: ImageAsset) {
  return a.mime === "image/png" ? doc.embedPng(a.bytes) : doc.embedJpg(a.bytes);
}

export function fitContain(iw: number, ih: number, boxW: number, boxH: number) {
  const s = Math.min(boxW / iw, boxH / ih);
  return { w: iw * s, h: ih * s };
}

// Ukuran halaman untuk satu foto sesuai kertas/orientasi/margin (pt).
export function imagePageSize(a: { width: number; height: number }, paper: Paper, orient: Orientation, marginPt = 0): [number, number] {
  if (paper === "auto") {
    const s = AUTO_PAGE_LONG_SIDE / Math.max(a.width, a.height);
    return [a.width * s + marginPt * 2, a.height * s + marginPt * 2];
  }
  const [short, long] = PAPER[paper];
  const landscape = orient === "portrait" ? false : orient === "landscape" ? true : a.width > a.height;
  return landscape ? [long, short] : [short, long];
}

// Foto dipasang proporsional & di tengah (tidak pernah gepeng/terpotong).
export async function addImagePage(doc: PDFDocument, a: ImageAsset, paper: Paper, orient: Orientation, marginPt = 0) {
  const [pw, ph] = imagePageSize(a, paper, orient, marginPt);
  const page = doc.addPage([pw, ph]);
  const img = await embed(doc, a);
  const box = fitContain(a.width, a.height, Math.max(1, pw - marginPt * 2), Math.max(1, ph - marginPt * 2));
  page.drawImage(img, { x: (pw - box.w) / 2, y: (ph - box.h) / 2, width: box.w, height: box.h });
  return page;
}

// 2. Tempel gambar. Posisi overlay = pecahan (0–1) halaman dengan titik asal kiri-atas.
export type Overlay = { id: string; asset: ImageAsset; x: number; y: number; w: number; h: number };

export function overlayToPdfRect(o: { x: number; y: number; w: number; h: number }, W: number, H: number) {
  return { x: W * o.x, y: H - H * o.y - H * o.h, width: W * o.w, height: H * o.h };
}

export async function applyOverlays(bytes: Uint8Array, overlays: Record<number, Overlay[]>) {
  const doc = await PDFDocument.load(copy(bytes));
  const pages = doc.getPages();
  for (const [idx, list] of Object.entries(overlays)) {
    const page = pages[Number(idx)];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    for (const o of list) page.drawImage(await embed(doc, o.asset), overlayToPdfRect(o, W, H));
  }
  return doc.save();
}

// 3. Gabung PDF & foto: tiap entri = satu halaman (halaman PDF sumber atau foto), dengan rotasi tambahan.
export type MergeEntry =
  | { kind: "doc"; docId: string; page: number; rotation: number }
  | { kind: "image"; asset: ImageAsset };

export async function mergePages(entries: MergeEntry[], sources: Map<string, Uint8Array>, photoSize: Paper) {
  const out = await PDFDocument.create();
  const loaded = new Map<string, PDFDocument>();
  for (const e of entries) {
    if (e.kind === "image") {
      await addImagePage(out, e.asset, photoSize, "auto", 0);
      continue;
    }
    let src = loaded.get(e.docId);
    if (!src) {
      const b = sources.get(e.docId);
      if (!b) continue;
      src = await PDFDocument.load(copy(b));
      loaded.set(e.docId, src);
    }
    const [p] = await out.copyPages(src, [e.page]);
    if (e.rotation) p.setRotation(degrees((p.getRotation().angle + e.rotation) % 360));
    out.addPage(p);
  }
  return out.save();
}

// 4. Gambar ke PDF: tiap foto satu halaman.
export async function imagesToPdf(assets: ImageAsset[], opt: { paper: Paper; orient: Orientation; margin: Margin }) {
  const out = await PDFDocument.create();
  for (const a of assets) await addImagePage(out, a, opt.paper, opt.orient, MARGINS[opt.margin]);
  return out.save();
}

// 5a. Kompres "Aman": simpan ulang dengan object streams (teks tetap utuh).
export async function compressLossless(bytes: Uint8Array) {
  const doc = await PDFDocument.load(copy(bytes));
  return doc.save({ useObjectStreams: true });
}

// 5b. Kompres "Kuat": halaman yang sudah dirender jadi JPEG (lihat render.ts) disusun ulang, ukuran asli.
export async function pdfFromPageImages(pages: { jpeg: Uint8Array; width: number; height: number }[]) {
  const out = await PDFDocument.create();
  for (const p of pages) {
    const page = out.addPage([p.width, p.height]);
    page.drawImage(await out.embedJpg(p.jpeg), { x: 0, y: 0, width: p.width, height: p.height });
  }
  return out.save({ useObjectStreams: true });
}

export const COMPRESS_PRESETS = {
  rendah: { scale: 96 / 72, quality: 0.55, label: "Rendah — paling kecil (96 dpi)" },
  sedang: { scale: 120 / 72, quality: 0.7, label: "Sedang — seimbang (120 dpi)" },
  tinggi: { scale: 150 / 72, quality: 0.82, label: "Tinggi — paling tajam (150 dpi)" },
} as const;
export type Quality = keyof typeof COMPRESS_PRESETS;

// ── Nama file ────────────────────────────────────────────────────
export function withSuffix(name: string, suffix: string) {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? `${name}${suffix}` : `${name.slice(0, dot)}${suffix}${name.slice(dot)}`;
}

// Nama unik dalam satu ZIP: "a.pdf", "a-2.pdf", "a-3.pdf", …
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = n.toLowerCase();
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    return c === 1 ? n : withSuffix(n, `-${c}`);
  });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
