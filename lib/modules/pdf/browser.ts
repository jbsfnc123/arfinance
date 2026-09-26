"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { COMPRESS_PRESETS, pdfFromPageImages, type ImageAsset, type Quality } from "./ops";

// Helper khusus browser untuk PDF Editor: pdf.js (render/thumbnail), gambar (canvas), unduh & ZIP.
// Semua berjalan lokal — tidak ada file yang dikirim ke server.

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function pdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjsPromise;
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  try {
    return await m.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  } catch (e) {
    const msg = (e as Error).name === "PasswordException" ? "terkunci password" : "rusak atau tidak bisa dibaca";
    throw new Error(`PDF ${msg}.`);
  }
}

export function closePdf(doc: PDFDocumentProxy | null | undefined) {
  if (doc) doc.destroy().catch(() => undefined);
}

export async function renderPage(doc: PDFDocumentProxy, index: number, scale: number, extraRotation = 0, canvas?: HTMLCanvasElement) {
  const page = await doc.getPage(index + 1);
  const viewport = page.getViewport({ scale, rotation: (page.rotate + extraRotation) % 360 });
  const c = canvas ?? document.createElement("canvas");
  c.width = Math.max(1, Math.round(viewport.width));
  c.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvasContext: c.getContext("2d")!, viewport }).promise;
  return c;
}

// Thumbnail di-cache per (kunci dokumen, halaman, rotasi) agar grid bisa diurutkan ulang tanpa render ulang.
const thumbs = new Map<string, string>();
export async function pageThumb(key: string, doc: PDFDocumentProxy, index: number, rotation = 0, scale = 0.55) {
  const k = `${key}:${index}:${rotation}`;
  const hit = thumbs.get(k);
  if (hit) return hit;
  const url = (await renderPage(doc, index, scale, rotation)).toDataURL("image/png");
  thumbs.set(k, url);
  return url;
}
export function forgetThumbs(key: string) {
  for (const k of [...thumbs.keys()]) if (k.startsWith(key + ":")) thumbs.delete(k);
}

// Kompres "Kuat": tiap halaman dirender ke JPEG (latar putih) lalu disusun ulang pada ukuran aslinya.
export async function compressRaster(doc: PDFDocumentProxy, quality: Quality, onProgress?: (i: number, n: number) => void) {
  const { scale, quality: q } = COMPRESS_PRESETS[quality];
  const pages: { jpeg: Uint8Array; width: number; height: number }[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    onProgress?.(i + 1, doc.numPages);
    const page = await doc.getPage(i + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Gagal membuat JPEG."))), "image/jpeg", q));
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: viewport.width / scale, height: viewport.height / scale });
    canvas.width = canvas.height = 0; // lepas memori
    page.cleanup();
  }
  return pdfFromPageImages(pages);
}

// ── Gambar ───────────────────────────────────────────────────────
export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif|tiff?)$/i;
export const HEIC_EXT = /\.(heic|heif)$/i;
export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
export const isImage = (f: File) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name) || HEIC_EXT.test(f.name);

const readDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(new Error("Gagal membaca file gambar."));
  r.readAsDataURL(b);
});
const decode = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error("decode"));
  i.src = src;
});
const dataUrlBytes = (u: string) => Uint8Array.from(atob(u.split(",")[1] ?? ""), (c) => c.charCodeAt(0));

function rasterize(img: HTMLImageElement, name: string, mime: "image/png" | "image/jpeg", w?: number, h?: number, draw?: (ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) => void): ImageAsset {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w ?? img.naturalWidth));
  c.height = Math.max(1, Math.round(h ?? img.naturalHeight));
  const ctx = c.getContext("2d")!;
  if (draw) draw(ctx, c); else ctx.drawImage(img, 0, 0);
  const dataUrl = c.toDataURL(mime, 0.92);
  return { name, dataUrl, bytes: dataUrlBytes(dataUrl), mime, width: c.width, height: c.height };
}

// Selalu PNG/JPEG (format lain dikonversi lewat canvas); HEIC ditolak dengan pesan jelas.
export async function loadImageAsset(file: Blob, fallbackName = "gambar"): Promise<ImageAsset> {
  const name = (file as File).name || fallbackName;
  const dataUrl = await readDataUrl(file);
  let img: HTMLImageElement;
  try {
    img = await decode(dataUrl);
  } catch {
    if (HEIC_EXT.test(name)) throw new Error(`"${name}" berformat HEIC/HEIF yang tidak bisa dibaca browser. Ubah dulu ke JPG atau PNG.`);
    throw new Error(`Format gambar "${name}" tidak didukung browser.`);
  }
  if (!img.naturalWidth || !img.naturalHeight) throw new Error(`Gambar "${name}" tidak punya ukuran yang valid.`);
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")).toLowerCase();
  if (mime === "image/png" || mime === "image/jpeg") {
    return { name, dataUrl, bytes: dataUrlBytes(dataUrl), mime, width: img.naturalWidth, height: img.naturalHeight };
  }
  return rasterize(img, name, "image/png");
}

export async function rotateAsset(a: ImageAsset, deg: number): Promise<ImageAsset> {
  const img = await decode(a.dataUrl!);
  const swap = Math.abs(deg) % 180 !== 0;
  return rasterize(img, a.name, a.mime, swap ? img.naturalHeight : img.naturalWidth, swap ? img.naturalWidth : img.naturalHeight, (ctx, c) => {
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  });
}

// Asset dari dataUrl tersimpan (pemulihan posisi tempel gambar).
export async function assetFromDataUrl(dataUrl: string, name: string): Promise<ImageAsset> {
  const img = await decode(dataUrl);
  const mime = dataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png";
  return { name, dataUrl, bytes: dataUrlBytes(dataUrl), mime, width: img.naturalWidth, height: img.naturalHeight };
}

// ── Unduh ────────────────────────────────────────────────────────
export function downloadBytes(bytes: Uint8Array | Blob, name: string, type = "application/pdf") {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadZip(files: { name: string; bytes: Uint8Array }[], zipName: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.bytes);
  downloadBytes(await zip.generateAsync({ type: "blob" }), zipName, "application/zip");
}
