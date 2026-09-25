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

// Nilai sel yang diawali = + - @ bisa dieksekusi sebagai formula saat dibuka di Excel.
function safeCell(v: unknown) {
  return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v;
}

export async function downloadXlsx(fileName: string, sheetName: string, aoa: unknown[][]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(aoa.map((row) => row.map(safeCell)));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}
