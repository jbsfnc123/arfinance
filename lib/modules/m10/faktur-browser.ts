"use client";

// Pecah PDF Faktur Pajak Coretax di browser (Fase 93, tab BOT): pdf.js (teks per halaman) + pdf-lib (salin halaman).
// Aturan sama dengan AR Bot lokal (lib/modules/m10/faktur.ts). Tidak ada file yang dikirim ke server saat memecah.
import { closePdf, openPdf } from "@/lib/modules/pdf/browser";
import { fakturFileName, groupPages, type FakturItem } from "./faktur";

export async function pageTextsBrowser(bytes: Uint8Array): Promise<string[]> {
  const doc = await openPdf(bytes);
  try {
    const out: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      let s = "";
      for (const it of tc.items) {
        if (!("str" in it)) continue;
        s += it.str;
        s += it.hasEOL ? "\n" : "";
      }
      out.push(s);
    }
    return out;
  } finally { closePdf(doc); }
}

/** PDF gabungan → daftar faktur + PDF per faktur (Blob). */
export async function splitFakturBrowser(file: File): Promise<{ items: FakturItem[]; files: Map<string, Blob>; totalPages: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const texts = await pageTextsBrowser(bytes);
  if (!texts.length) throw new Error("File PDF kosong atau tidak memiliki halaman.");
  const groups = groupPages(texts);
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const items: FakturItem[] = [];
  const files = new Map<string, Blob>();
  for (const [i, g] of groups.entries()) {
    const doc = await PDFDocument.create();
    for (const pg of await doc.copyPages(src, g.pages)) doc.addPage(pg);
    const out = await doc.save();
    const filename = fakturFileName(g.faktur);
    files.set(filename, new Blob([out.slice().buffer as ArrayBuffer], { type: "application/pdf" }));
    items.push({ index: i + 1, invoice: g.invoice, faktur: g.faktur, filename, pages: g.pages.length, size: out.length, checked: true, status: "Ready" });
  }
  return { items, files, totalPages: texts.length };
}
