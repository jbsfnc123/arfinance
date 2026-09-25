// Parser angka gabungan dari rawNum_ (Presentasi/js/core/util.js) dan ToNumber
// (Mutasi Bank/vba/mdlParse.bas). Menerima format Indonesia & Inggris:
//   "1.234.567" → 1234567   "1.234,56" → 1234.56   "1,234,567.89" → 1234567.89
//   "610,500.00 CR" → 610500   "(1.500)" → -1500   "Rp 2.000" → 2000
// Satu pemisah dengan tepat 3 digit di belakangnya dianggap pemisah ribuan.
export function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  let s = String(value).trim();
  if (!s || s === "-") return 0;

  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return 0;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    // Pemisah yang muncul terakhir adalah desimal.
    s = lastComma > lastDot
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const count = s.split(sep).length - 1;
    const after = s.length - s.lastIndexOf(sep) - 1;
    s = count === 1 && after !== 3
      ? s.replace(sep, ".")                 // desimal: "1,5" / "2.75"
      : s.split(sep).join("");              // ribuan: "1.234" / "1,234,567"
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}
