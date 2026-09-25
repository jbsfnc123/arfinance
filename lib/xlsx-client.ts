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

export async function downloadXlsx(fileName: string, sheetName: string, aoa: unknown[][]) {
  return downloadXlsxSheets(fileName, [{ name: sheetName, rows: aoa }]);
}

// Beberapa sheet sekaligus. Nilai teks tetap teks (NPWP/ID TKU tidak berubah jadi angka).
export async function downloadXlsxSheets(fileName: string, sheets: { name: string; rows: unknown[][] }[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows.map((row) => row.map(safeCell))), s.name);
  }
  XLSX.writeFile(wb, fileName);
}
