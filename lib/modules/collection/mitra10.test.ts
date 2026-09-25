import { describe, expect, it } from "vitest";
import { mitra10Summary } from "./mitra10";
import { enrichRow, type RawRow } from "./view-model";

const raw = (p: Partial<RawRow>): RawRow => ({
  invoice_no: "I", payment_group: "Catur Mitra Sejati Sentosa - JKT", marketing: "02-Modern Market",
  collection_name: "Yovita Ulfa", business_partner: "Mitra10", bp_value: "", invoice_date: "2026-08-05",
  due_date: "2026-09-05", open_amt: 100, no_po: "", no_sj: "", catatan: null, janji_bayar: null,
  metode_tukar: null, tanggal_tukar: null, keterangan: null, resi: null, foto_path: null, ...p,
});

describe("mitra10Summary", () => {
  const s = mitra10Summary([
    raw({ invoice_no: "A", metode_tukar: "Kolektor", tanggal_tukar: "2026-08-10", janji_bayar: "2026-08-20" }),
    raw({ invoice_no: "B", open_amt: 300, metode_tukar: "WA", tanggal_tukar: "2026-08-12", janji_bayar: "2026-08-25" }),
    raw({ invoice_no: "C", invoice_date: "2026-09-02", open_amt: 50 }),
    raw({ invoice_no: "D", invoice_date: null, open_amt: 10 }),
  ].map((r) => enrichRow(r, "2026-09-25")));

  it("KPI", () => {
    expect(s).toMatchObject({ totalPiutang: 460, totalInv: 4, jadwalNom: 400, jadwalInv: 2, nHari: 2 });
    // (10 + 13) / 2 = 11,5 → dibulatkan ke atas = 12
    expect(s.avgHari).toBe(12);
  });

  it("per bulan invoice, tanpa tanggal paling akhir", () => {
    expect(s.months.map((m) => m.ym)).toEqual(["2026-08", "2026-09", ""]);
    expect(s.months[0]).toMatchObject({ cInv: 2, cSudah: 2, cBelum: 0, cJadwal: 2, nInv: 400 });
    expect(s.total).toMatchObject({ cInv: 4, cSudah: 2, cBelum: 2, nBelum: 60 });
  });
});
