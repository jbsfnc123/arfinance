import { describe, expect, it } from "vitest";
import { buildRows, monthWeeks, parseCbdSales, salesDatesById, splitEmails, weeklySales, type EmailData } from ".";

describe("monthWeeks (cut-off Sabtu)", () => {
  it("Oktober 2026: 1–3, 4–10, 11–17, 18–24, 25–31", () => {
    expect(monthWeeks("2026-10").map((w) => [w.start.slice(8), w.end.slice(8)])).toEqual(
      [["01", "03"], ["04", "10"], ["11", "17"], ["18", "24"], ["25", "31"]]);
    expect(monthWeeks("2026-10")[0].label).toBe("1–3 Okt");
  });
  it("bulan yang dimulai hari Sabtu & Februari", () => {
    // 1 Agustus 2026 = Sabtu → minggu pertama hanya 1 hari
    expect(monthWeeks("2026-08").slice(0, 2).map((w) => w.label)).toEqual(["1 Agu", "2–8 Agu"]);
    const feb = monthWeeks("2027-02");
    expect(feb[0].start).toBe("2027-02-01");
    expect(feb.at(-1)!.end).toBe("2027-02-28");
    expect(feb.every((w, i) => i === 0 || w.start > feb[i - 1].end)).toBe(true);
  });
});

describe("splitEmails", () => {
  it("alamat dipisah & sisa teks jadi catatan", () => {
    expect(splitEmails("happy@a.co.id\n happy.finance@Gmail.com")).toEqual({ emails: ["happy@a.co.id", "happy.finance@gmail.com"], rest: "" });
    expect(splitEmails("Kirim ke Adm Sales Surabaya")).toEqual({ emails: [], rest: "Kirim ke Adm Sales Surabaya" });
  });
});

describe("buildRows", () => {
  const data: EmailData = {
    groups: [{ id: 1, term: "CBD", payment_group: "Anga", pic_ar: "Leti", keterangan: null, email_note: null, updated_at: "" }],
    customers: [
      { id: 10, term: "CBD", level: "BP", group_id: null, business_partner: "Toko A", bp_value: "1017843", bp_key: "1017843-PKP",
        payment_group: null, pic_ar: "Ulfa", keterangan: "CC AR", email_note: null, updated_at: "" },
      { id: 11, term: "CBD", level: "Group", group_id: 1, business_partner: "Anga Batam", bp_value: "1022879", bp_key: null,
        payment_group: null, pic_ar: null, keterangan: null, email_note: null, updated_at: "" },
    ],
    emails: [{ customer_id: 10, group_id: null, email: "a@x.com" }, { customer_id: null, group_id: 1, email: "anga@x.com" }],
    lookup: [{ bp_key: "1017843-PKP", payment_group: "PG Database", collection_name: "Jenni", marketing: "01-Traditional", sales_name: null, branch: "JKT", bp_name: "Toko A", in_aging: true }],
  };
  const weeks = monthWeeks("2026-10");
  it("tab BP: lookup mengisi Payment Group & Collection, minggu silang tanpa data penjualan", () => {
    const [r] = buildRows(data, "CBD", "BP", weeks);
    expect(r).toMatchObject({ payment_group: "PG Database", pg_from_db: true, collection: "Jenni", pic_ar: "Ulfa", emails: "a@x.com", match: "Cocok", w1: "✗", w5: "✗" });
  });
  it("tab Group: PIC & email dari Payment Group", () => {
    const [r] = buildRows(data, "CBD", "Group", weeks);
    expect(r).toMatchObject({ payment_group: "Anga", pg_from_db: false, pic_ar: "Leti", emails: "anga@x.com", match: "Tidak cocok" });
  });
});

describe("penjualan mingguan (Fase 61)", () => {
  const H = ["Organization", "Account Date", "Document Type", "Transaction Date", "Business Partner", "Payment amount", "Document Status"];
  const sheets = [{ name: "Sheet0", rows: [H,
    ["TRA", 46296, "AR Receipt (Prepaid)", 46296, "Mita Suhaini_1042563", 100, "Completed"],
    ["TRA", 46297, "AR Receipt (Prepaid-ESPAY)", 46297, "Cipta Baru_1014793-2 (CBD)", 50, "Completed"],
    ["TRA", 46297, "AR Receipt (Prepaid)", 46297, "Mita Suhaini_1042563", 10, "Completed"],
    ["TRA", 46298, "AR Receipt (Prepaid)", 46298, "Batal_1099999", 10, "Reversed"],
    ["TRA", 46298, "AR Receipt", 46298, "standard_1007787", 10, "Completed"],
    ["TRA", 46298, "AR Receipt (Prepaid)", 46298, "Nama_Pakai_1000111", 10, "Completed"],
  ] }];
  it("parseCbdSales: hanya Prepaid/ESPAY, Reversed dibuang, Value setelah _ terakhir, tanpa nominal", () => {
    const r = parseCbdSales(sheets);
    expect(r).toMatchObject({ from: "2026-10-01", to: "2026-10-03", receipts: 4, reversed: 1, bps: 3, noValue: 0 });
    expect(r.marks).toEqual([
      { bp_value: "1042563", sale_date: "2026-10-01" }, { bp_value: "1014793-2 (CBD)", sale_date: "2026-10-02" },
      { bp_value: "1042563", sale_date: "2026-10-02" }, { bp_value: "1000111", sale_date: "2026-10-03" },
    ]);
    expect(() => parseCbdSales([{ name: "x", rows: [["a", "b"]] }])).toThrow(/CBD sales/);
  });
  it("salesDatesById: CBD cocok persis / angka depan unik; TOP via Key BP ERP", () => {
    const c = (id: number, term: "CBD" | "TOP", bp_value: string, bp_key: string | null) => ({ id, term, level: "BP" as const, group_id: null,
      business_partner: `BP${id}`, bp_value, bp_key, payment_group: null, pic_ar: null, keterangan: null, email_note: null, updated_at: "" });
    const data: EmailData = { groups: [], emails: [], lookup: [],
      customers: [c(1, "CBD", "1042563", null), c(2, "CBD", "1014793-2 (CBD)", null), c(3, "CBD", "1000111 - Jkt", null), c(4, "TOP", "1000258", "1000258-PKP")],
      cbdMarks: [{ bp_value: "1042563", sale_date: "2026-10-01" }, { bp_value: "1014793-2 (cbd)", sale_date: "2026-10-02" }, { bp_value: "1000111", sale_date: "2026-10-03" }],
      topSales: [{ bp_key: "1000258-PKP", invoice_date: "2026-10-12" }] };
    const m = salesDatesById(data);
    expect([...m.get(1)!]).toEqual(["2026-10-01"]);
    expect([...m.get(2)!]).toEqual(["2026-10-02"]);
    expect([...m.get(3)!]).toEqual(["2026-10-03"]);
    const weeks = monthWeeks("2026-10");
    expect(weeklySales(m.get(4), weeks)).toEqual([false, false, true, false, false]);
    expect(buildRows(data, "CBD", "BP", weeks)[0]).toMatchObject({ w1: "✓", w2: "✗" });
  });
});
