import { describe, expect, it } from "vitest";
import { agingOf } from "./aging";
import { parseBlankA4 } from "./parse-blank-a4";
import { parseTarget } from "./parse-target";
import { buildWaMessage, DEFAULT_WA_TEMPLATE, effectiveTemplate, normalizePhone, waLink } from "./wa-message";

// Baris Blank_A4 dengan kolom pada posisi yang dipakai (A,C,D,G,H,K,L,M,N,Z,AA).
function a4(p: {
  pg?: string; mkt?: string; coll?: string; value?: string; bp?: string;
  inv?: string; invDate?: unknown; due?: unknown; open?: unknown; po?: string; sj?: string;
}) {
  const r: unknown[] = new Array(27).fill("");
  r[0] = p.pg ?? "PG"; r[2] = p.mkt ?? "01-Traditional"; r[3] = p.coll ?? "Andi";
  r[6] = p.value ?? "1000258"; r[7] = p.bp ?? "Toko A"; r[10] = p.inv ?? "";
  r[11] = p.invDate ?? "15/02/2026"; r[12] = p.due ?? "15/03/2026"; r[13] = p.open ?? 1500000;
  r[25] = p.po ?? "PO1"; r[26] = p.sj ?? "SJ1";
  return r;
}
const HEADER = new Array(27).fill("h");

describe("parseBlankA4", () => {
  it("memetakan kolom dan mengubah tanggal ke ISO", () => {
    const { rows } = parseBlankA4([HEADER, a4({ inv: "INV-1", invDate: 46068, open: "1.234.567" })]);
    expect(rows).toEqual([{
      invoice_no: "INV-1", payment_group: "PG", marketing: "01-Traditional", collection_name: "Andi",
      business_partner: "Toko A", bp_value: "1000258", invoice_date: "2026-02-15",
      due_date: "2026-03-15", open_amt: 1234567, no_po: "PO1", no_sj: "SJ1",
    }]);
  });

  it("filter marketing, tanggal > 01/01/2026, dan duplikat", () => {
    const { rows, skipped } = parseBlankA4([
      HEADER,
      a4({ inv: "A", mkt: "99-Lain" }),
      a4({ inv: "B", invDate: "01/01/2026" }),
      a4({ inv: "C", invDate: "" }),
      a4({ inv: "D" }),
      a4({ inv: "D", open: 1 }),
      a4({ inv: "" }),
    ]);
    expect(rows.map((r) => r.invoice_no)).toEqual(["D"]);
    expect(skipped).toEqual({ marketing: 1, date: 2, duplicate: 1 });
  });

  it("duplikat dari baris yang ditolak dinilai ulang (perilaku lama)", () => {
    const { rows, skipped } = parseBlankA4([
      HEADER,
      a4({ inv: "X", mkt: "99-Lain" }),
      a4({ inv: "X" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual({ marketing: 1, date: 0, duplicate: 0 });
  });
});

describe("parseTarget", () => {
  it("mengenali header berdasarkan nama", () => {
    const res = parseTarget([
      ["Laporan Target"],
      ["No Invoice", "Business Partner", "Target", "Branch", "Due Date"],
      ["INV-1", "Toko A", "5.000.000", "Jakarta", "15/09/2026"],
      ["INV-2", "", "", "", ""],
      ["INV-1", "Toko A", "6.000.000", "Jakarta", "15/09/2026"],
    ]);
    expect(res.legacy).toBe(false);
    expect(res.skipped).toBe(1);
    expect(res.rows).toEqual([{
      invoice_no: "INV-1", target: 6000000, marketing: "", collection_name: "",
      business_partner: "Toko A", due_date: "2026-09-15", branch: "Jakarta",
    }]);
  });

  it("jatuh ke tata letak sheet Tagihan lama bila header tidak dikenali", () => {
    const res = parseTarget([
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      [2500000, "", "03-Reseller", "Budi", "Toko B", "INV-9", "", 46280, "", "Surabaya"],
    ]);
    expect(res.legacy).toBe(true);
    expect(res.rows[0]).toMatchObject({
      invoice_no: "INV-9", target: 2500000, marketing: "03-Reseller", collection_name: "Budi",
      business_partner: "Toko B", due_date: "2026-09-15", branch: "Surabaya",
    });
  });
});

describe("agingOf", () => {
  const today = "2026-09-25";
  it.each([
    [null, null, "-"],
    ["2026-09-25", 0, "Belum Jatuh Tempo"],
    ["2026-10-01", -6, "Belum Jatuh Tempo"],
    ["2026-09-24", 1, "1-30 Hari"],
    ["2026-08-26", 30, "1-30 Hari"],
    ["2026-08-25", 31, "31-60 Hari"],
    ["2026-07-27", 60, "31-60 Hari"],
    ["2026-07-26", 61, ">60 Hari"],
  ])("due %s → %s hari, %s", (due, days, bucket) => {
    expect(agingOf(due, today)).toEqual({ days, bucket });
  });
});

describe("pesan WA", () => {
  it("format sama dengan buildMessage lama", () => {
    const msg = buildWaMessage(
      [
        { invoice_no: "INV-1", due_date: "2026-09-15", open_amt: 1500000 },
        { invoice_no: "INV-2", due_date: "2026-10-01", open_amt: 250000 },
      ],
      "Andi",
      { header: "Halo {{collection}}", footer: "Total {{total}} - *{{collection}}*" },
    );
    expect(msg).toBe(
      "Halo Andi\n\nINV-1 | Jatuh Tempo 15/09/2026 | Rp 1.500.000\nINV-2 | Jatuh Tempo 01/10/2026 | Rp 250.000\n\n" +
        "*Total Tagihan Rp 1.750.000*\n\nTotal Rp 1.750.000 - *Andi*",
    );
  });

  it("prioritas template: perangkat → server → bawaan", () => {
    expect(effectiveTemplate(null, null)).toEqual(DEFAULT_WA_TEMPLATE);
    expect(effectiveTemplate(null, { header: "", footer: "F" })).toEqual({ header: DEFAULT_WA_TEMPLATE.header, footer: "F" });
    expect(effectiveTemplate({ header: "H" }, { header: "S", footer: "F" })).toEqual({ header: "H", footer: "F" });
  });

  it.each([
    ["0812-3456-789", "628123456789"],
    ["812 3456 789", "628123456789"],
    ["+62 812 3456 789", "628123456789"],
    ["", ""],
  ])("normalizePhone(%j) = %j", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("tautan wa.me", () => {
    expect(waLink("0812", "a b")).toBe("https://wa.me/62812?text=a%20b");
  });
});
