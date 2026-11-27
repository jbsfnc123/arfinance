// Upload Faktur Pajak Mitra10 — logika murni bersama AR Bot (automation/ar-bot) & AR Workspace tab BOT (Fase 93).
// Pecah PDF Coretax per faktur: halaman tanpa nomor faktur baru, atau dengan nomor faktur yang sama, = lanjutan faktur
// sebelumnya; "Referensi: <No Invoice>" diambil dari halaman pertama yang memuatnya (port split_faktur.py).

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
  in_po?: boolean; // invoice ini ada di data PO terakhir (Excel/tempel PO, atau Import to BOT)
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

/** Nama file PDF per faktur (karakter terlarang Windows diganti "_"). */
export const fakturFileName = (faktur: string) => `${faktur.replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;

/** Satu baris data PO (Excel PO / Tempel PO / Import to BOT dari Kertas Kerja). */
export type PoRow = { invoice: string; no_po: string; no_sj: string; open_amt: number };

/**
 * Terapkan data PO ke `items` (salinan baru). Pencocokan No Invoice tanpa beda huruf besar/kecil.
 * `select` (pilih cepat): invoice yang ada di data PO dicentang, sisanya tidak. `in_po` menandai invoice dari data PO.
 */
export function applyPoList(items: FakturItem[], list: PoRow[], opts: { select?: boolean } = {}) {
  const next = items.map((i) => ({ ...i, in_po: false }));
  const byInv = new Map(next.map((i) => [i.invoice.trim().toUpperCase(), i]));
  let matched = 0, excelRows = 0;
  const unmatched: string[] = [];
  for (const row of list) {
    const inv = row.invoice.trim();
    if (!inv) continue;
    excelRows++;
    const it = byInv.get(inv.toUpperCase());
    if (!it) { unmatched.push(inv); continue; }
    if (!it.in_po) matched++;
    it.in_po = true;
    it.no_po = row.no_po.trim();
    it.no_sj = row.no_sj.trim();
    it.open_amt = row.open_amt;
  }
  if (opts.select) for (const it of next) it.checked = !!it.in_po;
  return { items: next, matched, excelRows, unmatchedExcel: unmatched, notInPo: next.filter((i) => !i.in_po).length };
}

/** Status sudah terunggah (tidak diproses lagi). */
export const isUploaded = (s?: string) => !!s && s.startsWith("Uploaded");
/** Status sukses mode Isi No Invoice. */
export const FILLED = "No Invoice Terisi";
export const isFilled = (s?: string) => !!s && s.startsWith(FILLED);
