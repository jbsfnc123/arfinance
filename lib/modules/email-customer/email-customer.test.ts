import { describe, expect, it } from "vitest";
import { buildRows, monthWeeks, splitEmails, type EmailData } from ".";

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
  it("tab BP: lookup mengisi Payment Group & Collection, minggu silang", () => {
    const [r] = buildRows(data, "CBD", "BP", weeks);
    expect(r).toMatchObject({ payment_group: "PG Database", pg_from_db: true, collection: "Jenni", pic_ar: "Ulfa", emails: "a@x.com", match: "Cocok", w1: "✗", w5: "✗" });
  });
  it("tab Group: PIC & email dari Payment Group", () => {
    const [r] = buildRows(data, "CBD", "Group", weeks);
    expect(r).toMatchObject({ payment_group: "Anga", pg_from_db: false, pic_ar: "Leti", emails: "anga@x.com", match: "Tidak cocok" });
  });
});
