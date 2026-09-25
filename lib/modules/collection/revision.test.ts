import { describe, expect, it } from "vitest";
import { revisionLookup, splitSj } from "./revision";
import { reconcileCollected } from "./reconcile";
import { computeSpvSummary } from "./rows";
import { parseTarget } from "./parse-target";
import { remarkKey } from "@/lib/modules/remarks";
import type { AgingLine, Target } from "@/lib/local/datasets";

const line = (line_no: number, invoice_no: string, no_sj: string, open_amt: number) =>
  ({ line_no, invoice_no, no_sj, open_amt, due_date: "2026-10-01" }) as AgingLine;
const t = (invoice_no: string, target: number, no_sj: string): Target => ({
  month: "2026-09", invoice_no, target, marketing: null, collection_name: null, business_partner: "Anyar", due_date: null, branch: null, no_sj,
});

describe("No SJ & revisi invoice", () => {
  it("splitSj memecah SJ gabungan", () => {
    expect(splitSj("SJ/112774/XXVI/TRA-SJ/112828/XXVI/TRA")).toEqual(["SJ/112774/XXVI/TRA", "SJ/112828/XXVI/TRA"]);
    expect(splitSj(" sj/1/xxvi/tra ")).toEqual(["SJ/1/XXVI/TRA"]);
    expect(splitSj("")).toEqual([]);
  });

  it("kunci keterangan: No SJ, fallback INV:", () => {
    expect(remarkKey(" sj/1/xxvi/tra ", "SI/1")).toBe("SJ/1/XXVI/TRA");
    expect(remarkKey("", "si/9")).toBe("INV:SI/9");
  });

  const aging = [line(1, "SI/NEW", "SJ/129920/XXVI/TRA", 6180035), line(2, "SI/B", "SJ/5/XXVI/TRA-SJ/6/XXVI/TRA", 100)];
  const targets = [t("SI/OLD", 6208252, "SJ/129920/XXVI/TRA"), t("SI/B", 100, "SJ/5/XXVI/TRA"), t("SI/LUNAS", 500, "SJ/9/XXVI/TRA")];

  it("invoice lama hilang + SJ sama di invoice baru → revisi", () => {
    const find = revisionLookup(aging, new Set(targets.map((x) => x.invoice_no)));
    expect(find("SI/OLD", "SJ/129920/XXVI/TRA")).toMatchObject({ replacements: ["SI/NEW"], open: 6180035 });
    expect(find("SI/LUNAS", "SJ/9/XXVI/TRA")).toBeNull();
    expect(find("SI/B", "SJ/5/XXVI/TRA")).toBeNull(); // masih ada di aging
  });

  it("dashboard: invoice revisi tidak dihitung terkumpul; rekonsiliasi kategori revisi", () => {
    const s = computeSpvSummary({ month: "2026-09", today: "2026-09-25", targets, ar: [], promises: [], notes: [], lastTagihanUpdate: null, agingAll: aging });
    expect(s.sisa).toBe(6180035 + 100);
    const r = reconcileCollected({ month: "2026-09", targets, agingAll: aging, payments: [{ invoice_no: "SI/NEW", payment_date: "2026-09-10", amount: 1000 }] });
    const rev = r.categories.find((c) => c.category === "revisi")!;
    expect(rev.rows[0]).toMatchObject({ invoice_no: "SI/OLD", pengganti: "SI/NEW", dibayar: 1000, sisa: 6180035 });
    expect(r.categories.some((c) => c.category === "hilang" && c.rows.some((x) => x.invoice_no === "SI/OLD"))).toBe(false);
  });

  it("parse target membaca kolom No SJ", () => {
    const p = parseTarget([
      ["Open Amt", "Payment Group", "Marketing ", "Collection Name", "Business Partner", "Invoice No", "Invoice Date", "Due Date", "Branch", "No SJ"],
      [20852245, "PG", "01-Traditional", "Yovita", "Alfa", "SI/092512/VII/XXVI/TRA", 46223, 46268, "Semarang", "SJ/112774/XXVI/TRA-SJ/112828/XXVI/TRA"],
    ]);
    expect(p.rows[0]).toMatchObject({ invoice_no: "SI/092512/VII/XXVI/TRA", target: 20852245, no_sj: "SJ/112774/XXVI/TRA-SJ/112828/XXVI/TRA" });
    expect(p.columns.no_sj).toBe(9);
  });
});
