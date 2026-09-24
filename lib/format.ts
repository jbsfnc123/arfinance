// Format tampilan gaya Indonesia (port dari Script.html: rupiah, monthLabel, fmtDate).

export const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function rupiah(n: number | null | undefined) {
  return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
}

// "2026-09-15" → "15/09/2026"
export function fmtDate(isoDate: string | null | undefined) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// "2026-09" → "September 2026"; kosong → "(Tanpa Tgl)"
export function monthLabel(ym: string) {
  if (!ym) return "(Tanpa Tgl)";
  const [y, m] = ym.split("-");
  return `${BULAN_ID[Number(m) - 1]} ${y}`;
}

export function monthKey(isoDate: string | null | undefined) {
  return isoDate ? isoDate.slice(0, 7) : "";
}

// Timestamp ISO → "25/09/2026, 14.05" (Asia/Jakarta), seperti label "Data per".
export function fmtTimestamp(ts: string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}, ${get("hour")}.${get("minute")}`;
}
