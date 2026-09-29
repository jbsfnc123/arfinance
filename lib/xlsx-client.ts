// Baca/tulis Excel di browser. SheetJS dimuat saat dibutuhkan supaya bundle awal kecil.
// Tanggal dibaca sebagai serial Excel (raw), lalu diubah oleh lib/parsers/date —
// menghindari pergeseran zona waktu dari objek Date.

export async function readFirstSheetRows(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
}

// Semua sheet (nama + baris), mis. file mutasi bank yang berisi beberapa rekening.
export async function readAllSheets(file: File): Promise<{ name: string; rows: unknown[][] }[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true }),
  }));
}

// Nilai sel yang diawali = + - @ bisa dieksekusi sebagai formula saat dibuka di Excel.
function safeCell(v: unknown) {
  return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v;
}

/**
 * Nama sheet yang diterima Excel/SheetJS: tanpa \ / : * ? [ ], tidak diawali/diakhiri petik, maks. 31 karakter,
 * tidak kosong, bukan nama cadangan Excel "History", dan unik (tanpa beda kapital) dalam satu workbook.
 * Tanpa ini SheetJS melempar error dan tombol download terlihat tidak bereaksi (Fase 36: modal History Pembayaran).
 */
export function safeSheetName(name: string, used: Set<string> = new Set()) {
  let base = name.replace(/[\\\/:*?[\]]+/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").trim().slice(0, 31).trim() || "Sheet";
  if (/^history$/i.test(base)) base = "History 1";
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - ` (${i})`.length)} (${i})`;
  used.add(n.toLowerCase());
  return n;
}

/** Nama file aman untuk semua OS: tanpa \ / : * ? " < > | & karakter kontrol, maks. 150 karakter + ekstensi. */
export function safeFileName(name: string, ext = ".xlsx") {
  const stem = (name.toLowerCase().endsWith(ext) ? name.slice(0, -ext.length) : name)
    .replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().replace(/^[. ]+|[. ]+$/g, "").slice(0, 150);
  return `${stem || "export"}${ext}`;
}

export async function downloadXlsx(fileName: string, sheetName: string, aoa: unknown[][]) {
  return downloadXlsxSheets(fileName, [{ name: sheetName, rows: aoa }]);
}

// Beberapa sheet sekaligus. Nilai teks tetap teks (NPWP/ID TKU tidak berubah jadi angka).
// Nama file & sheet selalu dibersihkan; error lain dilempar ke pemanggil (tampilkan toast di sana).
export async function downloadXlsxSheets(fileName: string, sheets: { name: string; rows: unknown[][] }[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows.map((row) => row.map(safeCell))), safeSheetName(s.name, used));
  }
  XLSX.writeFile(wb, safeFileName(fileName));
}
