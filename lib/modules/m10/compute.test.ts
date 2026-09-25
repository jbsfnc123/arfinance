import { describe, expect, it } from "vitest";
import { computeM10, m10AgingLines, m10Dashboard, usernameOf } from "./compute";
import type { AgingLine, Gr, Kwitansi, Worksheet } from "@/lib/local/datasets";

const line = (p: Partial<AgingLine>): AgingLine => ({
  line_no: 1, invoice_no: null, payment_group: null, marketing: null, collection_name: null, sales_name: null, bp_key: null,
  business_partner: null, tax_name: "Catur Mitra Sejati Sentosa", invoice_date: null, due_date: null, open_amt: 0, cur_0_30: 0,
  cur_31_60: 0, due_1_7: 0, due_8_30: 0, due_31_60: 0, due_61_90: 0, due_90: 0, days: null, branch: null, no_po: null, no_sj: null, ...p,
});
const ws = (p: Partial<Worksheet>): Worksheet => ({
  id: 1, payment_group: null, business_partner: null, invoice_no: null, invoice_date: null, due_date: null, open_amt: 0,
  branch: null, no_po: null, no_sj: "", ...p,
});
const gr = (p: Partial<Gr>): Gr => ({
  id: 1, no: null, store_no: null, delivery_to: null, gr_no: null, gr_date: null, po_no: null, po_date: null, vendor_ship_no: null,
  item_code: null, item_name: null, uom: null, qty_order: null, qty_received: null, status: null, sj_no: null, ...p,
});
const kw = (p: Partial<Kwitansi>): Kwitansi => ({
  id: 1, username: null, invoice_no: "K", vendor_invoice_no: null, invoice_date: null, kuitansi_no: null, kuitansi_date: null,
  accepted_date: null, pfi_no: null, gr_no: null, po_no: null, total_net: 0, ...p,
});

describe("Mitra10 compute", () => {
  it("username = 8 karakter kanan Payment Group", () => {
    expect(usernameOf("Catur Mitra Sejati Sentosa (Bali,Kalimantan,Lombok) Pengu683")).toBe("Pengu683");
    expect(usernameOf("  ")).toBe("kosong");
  });

  const aging = m10AgingLines([
    line({ line_no: 1, invoice_no: "SI1", open_amt: 2000000, no_sj: "SJ/1", no_po: "PO1", days: 10, cur_0_30: 2000000 }),
    line({ line_no: 2, invoice_no: "SI2", open_amt: 50000, no_sj: "SJ/2", no_po: "PO2", days: 20 }),
    line({ line_no: 3, invoice_no: "X", tax_name: "Lain", no_sj: "SJ/9" }),
  ], " catur mitra sejati sentosa ");
  const c = computeM10({
    aging,
    remarks: new Map([["SJ/2", "ltkp"]]),
    worksheet: [
      ws({ id: 1, payment_group: "CMSS - Pengu338", invoice_no: "SI1", invoice_date: "2026-09-03", open_amt: 2000000, no_sj: "SJ/1" }),
      ws({ id: 2, invoice_no: "SI2", invoice_date: "2026-09-04", open_amt: 50000, no_sj: "SJ/2" }),
      ws({ id: 3, invoice_no: "SI3", invoice_date: "2026-08-04", open_amt: 70000, no_sj: "SJ/3" }),
    ],
    gr: [gr({ id: 1, sj_no: "SJ/1", po_no: "po1" }), gr({ id: 2, sj_no: "SJ/2", po_no: "POX" }), gr({ id: 3, sj_no: "SJ/7", po_no: "" })],
    kwitansi: [
      kw({ id: 1, vendor_invoice_no: "SI1", kuitansi_no: "KW1", kuitansi_date: "2026-09-10", total_net: 1500000 }),
      kw({ id: 2, invoice_no: "K2", vendor_invoice_no: "SI1", total_net: 500000 }),
      kw({ id: 3, invoice_no: "K3", vendor_invoice_no: "SI2", total_net: 10000 }),
    ],
    schedule: [{ no_kw: "KW1", spp: null, nilai_kw: 0, tgl_tukar_faktur: "2026-09-10", jadwal_transfer: "2026-09-25", notes: null }],
  });

  it("Kertas Kerja: GR, Tukar Faktur (>10.000), Selisih, Status, Jadwal, Lama TF", () => {
    expect(c.worksheet[0]).toMatchObject({ username: "Pengu338", gr: "Done", tukar_faktur: "Done", selisih: 0, status: "Outstanding", jadwal_bayar: "2026-09-25", lama_tf: 7 });
    expect(c.worksheet[1]).toMatchObject({ username: "kosong", gr: "Done", tukar_faktur: "Pending", selisih: 40000, status: "Outstanding" });
    expect(c.worksheet[2]).toMatchObject({ gr: "Pending", status: "Lunas", lama_tf: null });
  });

  it("GR: PO Aging & Check (tidak peka huruf); Kwitansi: Aging & Selisih", () => {
    expect(c.gr.map((g) => [g.po_aging, g.check_status])).toEqual([["PO1", "Done"], ["PO2", "Check"], ["Kosong", "Check"]]);
    expect(c.kwitansi.map((k) => [k.jadwal_bayar, k.aging, k.selisih])).toEqual([["2026-09-25", 2000000, -500000], [null, 2000000, -1500000], [null, 50000, -40000]]);
  });

  it("dashboard", () => {
    const d = m10Dashboard(c, aging, [{ no_kw: "KW1", spp: null, nilai_kw: 0, tgl_tukar_faktur: "2026-09-10", jadwal_transfer: "2026-09-25", notes: null }],
      { month: null, today: "2026-09-25", lastAging: null });
    expect(d.month).toBe("2026-09");
    expect(d.summary).toMatchObject({ total: 3, outstanding: 2, lunas: 1, grPending: 0, siapTukar: 1, tfDone: 1, ltkp: 1, pendingPrev: 1, pendingCur: 1, openOutstanding: 2050000 });
    expect(d.grCheck).toBe(2);
    expect(d.agingNotInWorksheet).toBe(0);
    expect(d.aging).toMatchObject({ count: 2, totalOpen: 2050000, avgDays: 15 });
    expect(d.monthly).toEqual([{ month: "2026-08", invoice: 1, done: 0, avgLama: null }, { month: "2026-09", invoice: 2, done: 1, avgLama: 7 }]);
    expect(d.daily.find((x) => x.date === "2026-09-25")?.jadwal).toBe(2000000);
    expect(d.scheduleAvgDays).toBe(15);
  });
});
