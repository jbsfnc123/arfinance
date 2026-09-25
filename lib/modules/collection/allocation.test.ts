import { describe, expect, it } from "vitest";
import { collectionAllocation } from "./allocation";
import { fmtBytes, quotaState } from "@/lib/modules/usage";
import type { AgingLine, Target } from "@/lib/local/datasets";

const line = (p: Partial<AgingLine>): AgingLine => ({
  line_no: 1, invoice_no: null, payment_group: null, marketing: null, collection_name: null, sales_name: null, bp_key: null,
  business_partner: null, tax_name: null, invoice_date: null, due_date: null, open_amt: 0, cur_0_30: 0, cur_31_60: 0,
  due_1_7: 0, due_8_30: 0, due_31_60: 0, due_61_90: 0, due_90: 0, days: null, branch: null, no_po: null, no_sj: null, ...p,
});
const target = (p: Partial<Target>): Target => ({
  month: "2026-09", invoice_no: "", target: 0, marketing: null, collection_name: null, business_partner: null, due_date: null, branch: null, ...p,
});

describe("alokasi harian per collection", () => {
  const agingAll = [
    line({ invoice_no: "A2", collection_name: "Budi", bp_key: "BP1" }),
    line({ invoice_no: "X1", collection_name: "Budi", bp_key: "BP1" }),
    line({ invoice_no: "T1", collection_name: "Sari", bp_key: "BP2" }), // aging kalah dari target
    line({ invoice_no: "S1", collection_name: "Sari", bp_key: "BP2" }),
  ];
  const targets = [
    target({ invoice_no: "T1", collection_name: "Budi", target: 1000 }),
    target({ invoice_no: "T2", collection_name: "Budi", target: 1000 }),
    target({ month: "2026-08", invoice_no: "A2", collection_name: "Sari", target: 500 }), // bulan lain diabaikan
  ];
  const invoices = [{ invoice_no: "B1", bp_key: "BP1" }, { invoice_no: "Z1", bp_key: "BPX" }];
  const payments = [
    { invoice_no: "T1", payment_date: "2026-09-01", amount: 600 },  // target → Budi (in target)
    { invoice_no: "T2", payment_date: "2026-09-01", amount: 400 },  // target → Budi (in target)
    { invoice_no: "A2", payment_date: "2026-09-03", amount: 250 },  // aging → Budi (di luar target)
    { invoice_no: "B1", payment_date: "2026-09-03", amount: 50 },   // BP1 → Budi (di luar target)
    { invoice_no: "S1", payment_date: "2026-09-03", amount: 999 },  // Sari
    { invoice_no: "Z1", payment_date: "2026-09-05", amount: 70 },   // tak terpetakan
    { invoice_no: "A2", payment_date: "2026-08-20", amount: 10 },   // bulan lain
  ];
  const a = collectionAllocation({ month: "2026-09", collection: "Budi", payments, invoices, targets, agingAll });

  it("prioritas pemetaan target > aging > BP, dipisah in target / di luar target", () => {
    expect(a.days).toHaveLength(30);
    expect(a.days[0]).toEqual({ date: "2026-09-01", inTarget: 1000, outside: 0 });
    expect(a.days[2]).toEqual({ date: "2026-09-03", inTarget: 0, outside: 300 });
    expect(a).toMatchObject({ inTarget: 1000, outside: 300, total: 1300, target: 2000, pctTarget: 0.5, avgPerActiveDay: 650 });
  });

  it("pembayaran tanpa collection dilaporkan, bulan ber-pembayaran terdaftar", () => {
    expect(a).toMatchObject({ unmapped: 70, unmappedCount: 1 });
    expect(a.months).toEqual(["2026-09", "2026-08"]); // A2 Agustus terpetakan lewat aging ke Budi
  });
});

describe("kuota Supabase", () => {
  it("warna & sisa", () => {
    expect(quotaState(100, 1000)).toMatchObject({ left: 900, pct: 0.1, level: "success" });
    expect(quotaState(700, 1000).level).toBe("warning");
    expect(quotaState(950, 1000).level).toBe("danger");
    expect(quotaState(1200, 1000).left).toBe(0);
  });
  it("format ukuran", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(52219027)).toBe("49,8 MB");
  });
});
