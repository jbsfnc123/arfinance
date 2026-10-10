// Pecah PDF Faktur Pajak (Coretax) per faktur — port split_faktur.py (pypdf) ke Node (pdfjs-dist + pdf-lib), tanpa Python.
// Aturan sama: halaman tanpa nomor faktur baru, atau dengan nomor faktur yang sama, adalah lanjutan faktur sebelumnya;
// "Referensi: <No Invoice>" diambil dari halaman pertama yang memuatnya.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

export type FakturItem = {
  index: number;
  invoice: string;
  faktur: string;
  filename: string;
  pages: number;
  size: number;
  checked: boolean;
  status: string;
  no_po?: string;
  no_sj?: string;
  open_amt?: number;
};

const FAKTUR_RE = /(?:Kode dan\s*)?Nomor Seri Faktur Pajak\s*:\s*([0-9]+)/i;
const REF_RE = /\(?\s*Referensi\s*:\s*([^)\r\n]+)\)?/i;

/** Nomor faktur & referensi invoice dari teks satu halaman. */
export function parsePageText(txt: string) {
  const f = txt.match(FAKTUR_RE);
  const r = txt.match(REF_RE);
  let ref = r ? r[1].trim() : null;
  if (ref) ref = ref.replace(/\)+$/, "").trim();
  return { faktur: f ? f[1].trim() : null, ref: ref || null };
}

/** Kelompokkan halaman (teks per halaman) menjadi faktur. */
export function groupPages(texts: string[]) {
  const groups: { faktur: string; invoice: string | null; pages: number[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  texts.forEach((txt, i) => {
    const { faktur, ref } = parsePageText(txt);
    if (cur && (!faktur || faktur === cur.faktur)) {
      cur.pages.push(i);
      if (!cur.invoice && ref) cur.invoice = ref;
      return;
    }
    cur = { faktur: faktur ?? `DOC_${groups.length + 1}`, invoice: ref, pages: [i] };
    groups.push(cur);
  });
  return groups.map((g, i) => ({ ...g, invoice: g.invoice || g.faktur || `DOC_${i + 1}` }));
}

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
    const filename = `${g.faktur.replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
    fs.writeFileSync(path.join(outDir, filename), bytes);
    items.push({ index: i + 1, invoice: g.invoice, faktur: g.faktur, filename, pages: g.pages.length, size: bytes.length, checked: true, status: "Ready" });
  }
  return { items, totalPages: texts.length };
}
