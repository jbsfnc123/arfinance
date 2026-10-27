// Pembacaan nominal & pencocokan Open Amt (dipakai server, job, dan UI — tanpa dependensi).
// Format yang dikenali: EDI "1,804,249.5" · Indonesia "1.804.249,5" · "Rp 1.804.249" / "Rp.3,012,540" / "IDR …" · angka biasa.

/** Toleransi bawaan selisih Open Amt (Rp) — bisa diubah di Pengaturan. */
export const DEFAULT_TOLERANCE = 100;

/**
 * Teks/angka → nominal (boleh desimal), atau null bila kosong / tidak valid.
 * Pemisah desimal: bila ada "," dan "." → pemisah yang terakhir. Bila hanya satu jenis: muncul > 1 kali = ribuan;
 * muncul sekali dan diikuti tepat 3 digit = ribuan ("1.804" = 1804); selain itu desimal ("249,5" = 249,5).
 */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[\s ]/g, "").replace(/^(rp\.?|idr)/i, "").replace(/(rp\.?|idr)$/i, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  s = s.replace(/^(rp\.?|idr)/i, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let dec: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) dec = lastDot > lastComma ? "." : ",";
  else {
    const sep = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
    if (sep) {
      const count = s.split(sep).length - 1;
      const tail = s.length - s.lastIndexOf(sep) - 1;
      dec = count > 1 || tail === 3 ? null : sep;
    }
  }
  const [intPart, frac = ""] = dec ? [s.slice(0, s.lastIndexOf(dec)), s.slice(s.lastIndexOf(dec) + 1)] : [s, ""];
  if (dec && intPart.includes(dec)) return null; // pemisah desimal muncul lebih dari sekali, mis. "1.2.3,4,5"
  const digits = intPart.replace(/[.,]/g, "");
  if (!digits && !frac) return null;
  if (/[.,]/.test(frac)) return null;
  const n = Number(`${digits || "0"}${frac ? `.${frac}` : ""}`);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** Nominal yang ditampilkan di log (format asli, tanpa pembulatan berlebih). */
const show = (n: number) => String(Math.round(n * 100) / 100);

export type AmountCheck = { noSj: string; edi: string; app: number | null; ediValue: number | null; diff: number | null; ok: boolean };

/** Bandingkan nominal EDI (teks asli) dengan nominal aplikasi: cocok bila selisih ≤ toleransi. */
export function compareAmount(noSj: string, ediText: string, app: unknown, tol: number): AmountCheck {
  const ediValue = parseAmount(ediText), appValue = parseAmount(app);
  const diff = ediValue === null || appValue === null ? null : Math.abs(ediValue - appValue);
  return { noSj, edi: ediText, app: appValue, ediValue, diff, ok: diff !== null && diff <= tol };
}

/** Baris log: Open Amt EDI="1,804,249.5" | Aplikasi="1804249" | selisih=0.5 | toleransi=100 → COCOK */
export function formatAmountCheck(c: AmountCheck, tol: number) {
  const app = c.app === null ? "-" : show(c.app);
  const diff = c.diff === null ? "tidak terbaca" : show(c.diff);
  return `Open Amt EDI="${c.edi}" | Aplikasi="${app}" | selisih=${diff} | toleransi=${show(tol)} → ${c.ok ? "COCOK" : "TIDAK COCOK"}${c.noSj ? ` (SJ ${c.noSj})` : ""}`;
}

/** Toleransi dari pengaturan: angka ≥ 0, bawaan 100. */
export const toleranceOf = (v: unknown) => {
  const n = typeof v === "number" ? v : parseAmount(v);
  return n === null || !Number.isFinite(n) || n < 0 ? DEFAULT_TOLERANCE : Math.min(n, 1_000_000);
};
