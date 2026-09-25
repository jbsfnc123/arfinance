// Parser tanggal gabungan dari rawDate_ (Presentasi) dan ToDate2 (Mutasi Bank VBA).
// Selalu day-first. Mengembalikan string ISO "YYYY-MM-DD" (tanpa zona waktu) atau null.
//   Date | serial Excel (20000–80000) | "dd/mm/yyyy" "dd-mm-yyyy" "dd.mm.yyyy" |
//   "19 Sep , 2026" "1 Agustus 2026" | "yyyy-mm-dd"

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, peb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7,
  aug: 8, agu: 8, agt: 8, agus: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function excelSerialToISO(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number") {
    return value >= 20000 && value <= 80000 ? excelSerialToISO(value) : null;
  }

  const s = String(value).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);

  m = /^(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(\d{4})$/.exec(s);
  if (m) {
    const key = m[2].toLowerCase();
    const month = MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)];
    if (month) return iso(+m[3], month, +m[1]);
  }

  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return null;
}

// Tanggal hari ini di Asia/Jakarta sebagai ISO "YYYY-MM-DD".
export function todayJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}

// Selisih hari a − b untuk dua tanggal ISO.
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);
}
