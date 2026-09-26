import { num } from "@/lib/local/pack";
import type { Target } from "@/lib/local/datasets";

// Slide Collection Presentasi AR diisi otomatis dari menu lain:
//   target per marketing group  = Upload Target Bulanan (ar_targets)
//   realisasi akhir bulan       = Alloc in Target (pembayaran ERP atas invoice target bulan itu) — sama dengan Dashboard Collection
//   s/d minggu W                = realisasi sampai akhir minggu ke-W (hari 7·W)
//   target bulan berikutnya     = ar_targets bulan berikutnya (bila sudah di-upload)
//   Collection %                = total realisasi / total target (pecahan, seperti workbook)
// Nilai manual di Data Center tetap menimpa (prioritas manual > auto).

export const GROUPS = ["Traditional", "Reseller", "Modern Market Nasional", "Modern Market", "End User - Project"] as const;

// Port groupIdx_/rawGroup_ app lama: "01-Traditional" → 0, "16-Modern Market National" → 2, "04-Proyek" / "End User …" → 4.
export function groupIdx(marketing: string | null | undefined) {
  let t = String(marketing ?? "").trim();
  const p = t.indexOf("-");
  if (p > 0 && p <= 3 && /^\d+$/.test(t.slice(0, p))) t = t.slice(p + 1);
  const s = t.trim().toLowerCase();
  if (s === "traditional") return 0;
  if (s === "reseller") return 1;
  if (s === "modern market national" || s === "modern market nasional") return 2;
  if (s === "modern market") return 3;
  if (s === "proyek" || s === "project" || s.startsWith("end user")) return 4;
  return -1;
}

const nextMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
};

export function deckCollection(input: {
  month: string; week: number; targets: Target[]; payments: { invoice_no: string; payment_date: string; amount: number }[];
}): Record<string, number> {
  const out: Record<string, number> = {};
  const tgt = [0, 0, 0, 0, 0], act = [0, 0, 0, 0, 0], w = [0, 0, 0, 0, 0], next = [0, 0, 0, 0, 0];
  const groupOf = new Map<string, number>();
  let hasTarget = false, hasNext = false;
  const nm = nextMonth(input.month);
  for (const t of input.targets) {
    const g = groupIdx(t.marketing);
    if (t.month === input.month) {
      hasTarget = true;
      groupOf.set(t.invoice_no, g);
      if (g >= 0) tgt[g] += num(t.target);
    } else if (t.month === nm) {
      hasNext = true;
      if (g >= 0) next[g] += num(t.target);
    }
  }
  if (!hasTarget) return out; // tanpa target bulan itu: biarkan slide memakai input manual / riwayat
  const wEnd = `${input.month}-${String(Math.min(7 * Math.max(1, input.week), 31)).padStart(2, "0")}`;
  for (const p of input.payments) {
    if (p.payment_date?.slice(0, 7) !== input.month) continue;
    const g = groupOf.get(p.invoice_no);
    if (g === undefined || g < 0) continue;
    act[g] += num(p.amount);
    if (p.payment_date <= wEnd) w[g] += num(p.amount);
  }
  for (let i = 0; i < 5; i++) {
    out[`coll_tgt:${i}`] = tgt[i];
    out[`coll_act:${i}`] = act[i];
    out[`coll_w:${i}`] = w[i];
    if (hasNext) out[`tgt_next:${i}`] = next[i];
  }
  const T = tgt.reduce((a, b) => a + b, 0);
  if (T) out["collpct:0"] = act.reduce((a, b) => a + b, 0) / T;
  return out;
}
