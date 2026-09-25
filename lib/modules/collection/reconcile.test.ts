import { describe, expect, it } from "vitest";
import { allocationSeries, reconcileCollected } from "./reconcile";
import type { AgingLine, Target } from "@/lib/local/datasets";

const t = (invoice_no: string, target: number, bp = "BP"): Target => ({
  month: "2026-09", invoice_no, target, marketing: null, collection_name: null, business_partner: bp, due_date: null, branch: null,
});
const line = (line_no: number, invoice_no: string, open_amt: number) => ({ line_no, invoice_no, open_amt }) as AgingLine;
const pay = (invoice_no: string, payment_date: string, amount: number) => ({ invoice_no, payment_date, amount });

describe("rekonsiliasi Terkumpul vs Allocated in Target", () => {
  const r = reconcileCollected({
    month: "2026-09",
    targets: [
      t("OK", 1000), t("PPN", 1110000), t("HILANG", 500000), t("SI/1", 300000, "Gias A"), t("CM/1", -50000, "Gias B"),
      t("POT", 2000000), t("LUAR", 400000), t("OPEN", 700000), t("MKT06", 900000),
    ],
    // MKT06 masih open (walau tersaring filter Collection) → bukan terkumpul
    agingAll: [line(1, "OPEN", 200000), line(2, "MKT06", 900000)],
    payments: [
      pay("OK", "2026-09-02", 1000), pay("PPN", "2026-09-03", 1000000), pay("SI/1", "2026-09-04", 250000),
      pay("POT", "2026-09-05", 1930000), pay("LUAR", "2026-08-30", 400000),
    ],
  });
  const cat = Object.fromEntries(r.categories.map((c) => [c.category, c.rows.map((x) => x.invoice_no).sort()]));

  it("kategori penyebab", () => {
    expect(cat).toEqual({
      cm: ["CM/1", "SI/1"], ppn: ["PPN"], hilang: ["HILANG"], luar_bulan: ["LUAR"], potongan: ["POT"], turun: ["OPEN"],
    });
  });

  it("total selisih = terkumpul − allocated in target; invoice masih open tidak dihitung terkumpul", () => {
    expect(r.selisih).toBe(r.terkumpul - r.allocT);
    expect(r.categories.reduce((a, c) => a + c.selisih, 0)).toBe(r.selisih);
    expect(r.categories.flatMap((c) => c.rows).some((x) => x.invoice_no === "MKT06")).toBe(false);
  });

  it("deret alokasi target per hari, kumulatif berhenti di hari ini", () => {
    const a = allocationSeries({ month: "2026-09", today: "2026-09-04", targets: [t("A", 100), t("B", 50)],
      payments: [pay("A", "2026-09-01", 60), pay("X", "2026-09-01", 5), pay("B", "2026-09-04", 50), pay("A", "2026-09-10", 40)] });
    expect(a.target).toBe(150);
    expect(a.days[0]).toMatchObject({ allocT: 60, alloc: 65, cumAllocT: 60, cumAlloc: 65 });
    expect(a.days[3].cumAllocT).toBe(110);
    expect(a.days[9].cumAllocT).toBeNull();
    expect(a.totalAllocT).toBe(150);
  });
});
