// Pecah PDF Faktur Pajak (Coretax) per faktur — port split_faktur.py (pypdf) ke Node (pdfjs-dist + pdf-lib), tanpa Python.
// Aturan sama: halaman tanpa nomor faktur baru, atau dengan nomor faktur yang sama, adalah lanjutan faktur sebelumnya;
// "Referensi: <No Invoice>" diambil dari halaman pertama yang memuatnya.
// Tipe & aturan pengelompokan halaman dipakai bersama AR Workspace (tab BOT, Fase 93): satu sumber di lib.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { fakturFileName, groupPages, type FakturItem } from "@/lib/modules/m10/faktur";

export { groupPages, parsePageText, type FakturItem } from "@/lib/modules/m10/faktur";

/** Teks per halaman. Baris dipisah newline (setara extract_text pypdf) agar regex Referensi berhenti di akhir baris. */
export async function pageTexts(buf: Buffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true });
  const doc = await task.promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let s = "";
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      s += it.str;
      s += it.hasEOL ? "\n" : "";
    }
    out.push(s);
  }
  await task.destroy();
  return out;
}

/** Pecah `pdfBuf` ke `outDir` (isi lama dihapus) → daftar faktur. */
export async function splitFaktur(pdfBuf: Buffer, outDir: string): Promise<{ items: FakturItem[]; totalPages: number }> {
  const texts = await pageTexts(pdfBuf);
  if (!texts.length) throw new Error("File PDF kosong atau tidak memiliki halaman.");
  const groups = groupPages(texts);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const src = await PDFDocument.load(pdfBuf, { ignoreEncryption: true });
  const items: FakturItem[] = [];
  for (const [i, g] of groups.entries()) {
    const doc = await PDFDocument.create();
    for (const pg of await doc.copyPages(src, g.pages)) doc.addPage(pg);
    const bytes = await doc.save();
    const filename = fakturFileName(g.faktur);
    fs.writeFileSync(path.join(outDir, filename), bytes);
    items.push({ index: i + 1, invoice: g.invoice, faktur: g.faktur, filename, pages: g.pages.length, size: bytes.length, checked: true, status: "Ready" });
  }
  return { items, totalPages: texts.length };
}
