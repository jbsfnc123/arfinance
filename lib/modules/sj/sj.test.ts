import { describe, expect, it } from "vitest";
import { docRows, parseCsv, parseSjCsv, parseSjDate, receiptCandidates, SJ_HEADERS } from "./parse";
import {
  activeSet, buildRows, defaultPeriod, FLAG, filterChoices, filterRows, fmtAvg, receiverImpact, receiverNames, STATUS_DONE, STATUS_OPEN, summarize, trendSeries,
  type SjDocRec, type SjReceipt,
} from "./compute";

// Model Fase 85: daftar = SJ dari laporan Serah Terima (bukan Aging); tanggal awal = Tanggal SJ; filter Area & Locator.
const TODAY = "2026-09-30";
const REC = activeSet([{ id: 1, name: "Bintang Anugia Arragi", active: true }, { id: 2, name: "Wienda Aswar", active: true }]);
const ag = (sj_key: string, tanggal_sj: string | null, o: Partial<SjDocRec> = {}): SjDocRec =>
  ({ sj_key, sj_no: sj_key, tanggal_sj, business_partner: "Toko A", area: "Jakarta", locator: null, send_date: null, ...o });
const rc = (sj_key: string, receive_date: string, receiver: string): SjReceipt =>
  ({ sj_key, sj_no: sj_key, receive_date, receiver, file_name: "a.csv", recorded_at: "2026-09-30T00:00:00Z" });
const one = (a: SjDocRec, r?: SjReceipt, rec = REC) => buildRows([a], r ? [r] : [], rec, TODAY)[0];

describe("baris per SJ dari laporan", () => {
  it("tanpa penerimaan = Belum diterima, umur dari Tanggal SJ", () => {
    const r = one(ag("SJ/1", "2026-09-10"));
    expect([r.status, r.umur, r.durasi, r.receiver]).toEqual([STATUS_OPEN, 20, null, null]);
  });
  it("dengan penerimaan diakui = Sudah diterima, durasi = Receive Date − Tanggal SJ", () => {
    const r = one(ag("SJ/2", "2026-09-01"), rc("SJ/2", "2026-09-04", "Wienda Aswar"));
    expect([r.status, r.durasi, r.umur, r.receiver, r.receive_date]).toEqual([STATUS_DONE, 3, null, "Wienda Aswar", "2026-09-04"]);
  });
  it("filter Receiver tetap berlaku: Receiver yang dinonaktifkan → Belum diterima + penanda", () => {
    const onlyBintang = activeSet([{ id: 1, name: "Bintang Anugia Arragi", active: true }, { id: 2, name: "Wienda Aswar", active: false }]);
    const r = one(ag("SJ/3", "2026-09-01"), rc("SJ/3", "2026-09-04", "wienda  ASWAR"), onlyBintang);
    expect(r.status).toBe(STATUS_OPEN);
    expect(r.flags).toContain(FLAG.inactive);
    expect(one(ag("SJ/3", "2026-09-01"), rc("SJ/3", "2026-09-04", "wienda  ASWAR")).status).toBe(STATUS_DONE); // spasi/kapital
    const names = receiverNames([{ id: 2, name: "Wienda Aswar", active: true }]);
    expect(buildRows([ag("SJ/3", "2026-09-01")], [rc("SJ/3", "2026-09-04", "wienda  ASWAR")], REC, TODAY, names)[0].receiver).toBe("Wienda Aswar"); // nama baku
  });
  it("durasi negatif & tanggal masa depan ditandai dan tidak dijadikan 0; Tanggal SJ kosong ditandai", () => {
    const neg = one(ag("SJ/4", "2026-09-10"), rc("SJ/4", "2026-09-05", "Wienda Aswar"));
    expect([neg.durasi, neg.flags]).toEqual([null, [FLAG.negative]]);
    const fut = one(ag("SJ/5", "2026-09-10"), rc("SJ/5", "2026-10-05", "Wienda Aswar"));
    expect([fut.durasi, fut.flags.includes(FLAG.future)]).toEqual([null, true]);
    const nod = one(ag("SJ/6", null));
    expect([nod.umur, nod.flags]).toEqual([null, [FLAG.noTanggalSj]]);
  });
  it("penerimaan untuk SJ yang tidak ada di laporan tidak menambah baris", () => {
    expect(buildRows([ag("SJ/1", "2026-09-01")], [rc("SJ/X", "2026-09-02", "Wienda Aswar")], REC, TODAY)).toHaveLength(1);
  });
});

describe("ringkasan", () => {
  const aging = [ag("A", "2026-09-01"), ag("B", "2026-09-02", { area: "Bandung", locator: "TRA-BDG D1" }), ag("C", "2026-09-03", { locator: "TRA-JKT D5" }), ag("D", "2026-09-10"), ag("E", "2026-09-28")];
  const rows = buildRows(aging, [rc("A", "2026-09-04", "Wienda Aswar"), rc("B", "2026-09-03", "Bintang Anugia Arragi"), rc("C", "2026-09-01", "Wienda Aswar")], REC, TODAY);
  it("rata-rata dari durasi valid (negatif dikecualikan), sampel & dikecualikan, total = jumlah baris", () => {
    const s = summarize(rows);
    expect([s.total, s.done, s.open, s.avg, s.sample, s.excluded]).toEqual([5, 3, 2, 2, 2, 1]); // (3 + 1) / 2
    expect(s.byLocator.find((x) => x.locator === "TRA-BDG D1")).toMatchObject({ total: 1, done: 1, open: 0, avg: 1 });
    expect(s.byLocator.find((x) => x.locator === "(tanpa Locator)")).toMatchObject({ total: 3, done: 1, open: 2, avg: 3 });
    expect(s.byArea.find((x) => x.area === "Bandung")).toMatchObject({ total: 1, done: 1, avg: 1 });
    expect(s.oldestOpen?.sj_key).toBe("D");
    expect(s.ageBuckets.map((b) => b.count)).toEqual([1, 0, 0, 1, 0]); // E 2 hari, D 20 hari
    expect(s.quality.dateIssues).toBe(1);
  });
  it("sampel kosong → '—', bukan 0 hari", () => {
    expect(fmtAvg(summarize(buildRows([ag("Z", "2026-09-01")], [], REC, TODAY)).avg)).toBe("—");
    expect(fmtAvg(2)).toBe("2,0 hari");
  });
  it("filter periode (Tanggal SJ), Area & Locator dipakai bersama; periode bawaan = bulan Tanggal SJ terbaru", () => {
    const F = { from: "", to: "", area: "", locator: "" };
    expect(filterRows(rows, { ...F, from: "2026-09-02", to: "2026-09-10" }).map((r) => r.sj_key)).toEqual(["B", "C", "D"]);
    expect(filterRows(rows, { ...F, area: "Jakarta" }).map((r) => r.sj_key)).toEqual(["A", "C", "D", "E"]);
    expect(filterRows(rows, { ...F, area: "Jakarta", locator: "TRA-JKT D5" }).map((r) => r.sj_key)).toEqual(["C"]);
    expect(defaultPeriod(rows, TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("opsi filter dinamis: Area mengikuti Locator & periode, dan sebaliknya", () => {
    const F = { from: "", to: "", area: "", locator: "" };
    expect(filterChoices(rows, F).area).toEqual([{ value: "Bandung", n: 1 }, { value: "Jakarta", n: 4 }]);
    expect(filterChoices(rows, { ...F, locator: "TRA-BDG D1" }).area).toEqual([{ value: "Bandung", n: 1 }]);
    expect(filterChoices(rows, { ...F, area: "Jakarta" }).locator.map((o) => o.value)).toEqual(["TRA-JKT D5"]);
    expect(filterChoices(rows, { ...F, from: "2026-09-03", to: "2026-09-03", locator: "TRA-BDG D1" }).locator).toEqual([{ value: "TRA-BDG D1", n: 0 }, { value: "TRA-JKT D5", n: 1 }]);
  });
  it("tren harian ≤ 45 hari, selain itu mingguan", () => {
    expect(trendSeries(summarize(rows).trend).every((t) => !t.weekly)).toBe(true);
    const long = trendSeries([{ date: "2026-06-03", done: 1, open: 0 }, { date: "2026-09-01", done: 0, open: 1 }]);
    expect(long.every((t) => t.weekly) && long[0].label === "2026-06-01").toBe(true);
  });
  it("dampak Receiver: menonaktifkan Wienda mengubah status SJ dipantau yang diterimanya", () => {
    const after = activeSet([{ id: 1, name: "Bintang Anugia Arragi", active: true }]);
    const receipts = [rc("A", "2026-09-04", "Wienda Aswar"), rc("B", "2026-09-03", "Bintang Anugia Arragi"), rc("X", "2026-09-03", "Wienda Aswar")];
    expect(receiverImpact(receipts, new Set(aging.map((a) => a.sj_key)), REC, after)).toEqual({ statusChanged: 1 }); // X bukan SJ dipantau
  });
});

describe("kandidat penerimaan dari file", () => {
  const head = SJ_HEADERS.join(",");
  const line = (sj: string, recv: string, rdate: string) =>
    ["Jakarta", sj, "01 Sep 2026", "Toko A", "L", "02 Sep 2026", "Siti", rdate, recv, "-", "Ya", "-", "R", "PT X", "B 1", "Budi", "", "1"].join(",");
  it("per SJ baris PERTAMA dengan Receiver diakui & Receive Date valid; lainnya dilewati", () => {
    const p = parseSjCsv([head,
      line("sj/1", "-", "-"),                              // belum diterima
      line("SJ/1", "Marselia Angelia", "03 Sep 2026"),     // tidak diakui
      line("SJ/1", "Wienda  aswar", "05 Sep 2026"),        // ← dipakai (spasi/kapital dirapikan)
      line("SJ/1", "Bintang Anugia Arragi", "06 Sep 2026"),
      line("SJ/2", "Bintang Anugia Arragi", "-"),          // diakui tanpa tanggal → dilewati
      line("SJ/2", "Bintang Anugia Arragi", "07 Sep 2026"),// ← dipakai
      line("SJ/3", "-", "08 Sep 2026"),                    // tanggal tanpa Receiver → dilewati
    ].join("\n"));
    const c = receiptCandidates(p, REC);
    expect(c.map((x) => [x.sj_key, x.receive_date, x.receiver, x.line])).toEqual([
      ["SJ/1", "2026-09-05", "Wienda aswar", 4], ["SJ/2", "2026-09-07", "Bintang Anugia Arragi", 7],
    ]);
  });
});

describe("parser CSV", () => {
  const head = SJ_HEADERS.join(",");
  const line = (sj: string, recv: string, rdate: string, desc = "-") =>
    ["Jakarta", sj, "01 Sep 2026", "Toko A", "TRA-JKT D1", "02 Sep 2026", "Siti", rdate, recv, "-", "Ya", desc, "RO/1", "PT X", "B 1 AB", "Budi", "", "1041277"]
      .map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",");
  it("koma dalam kutip, kutip ganda, newline dalam kutip, CRLF & BOM", () => {
    const csv = "﻿" + [head, line("SJ/100", "Wienda Aswar", "03 Sep 2026", 'tolakan "A", PO\nexpired'), line("SJ/101", "-", "-")].join("\r\n");
    const r = parseSjCsv(csv);
    expect(r.rows.length).toBe(2);
    expect(r.rows[0].description).toBe('tolakan "A", PO\nexpired');
    expect([r.rows[0].tanggal_sj, r.rows[0].receive_date, r.rows[0].receiver]).toEqual(["2026-09-01", "2026-09-03", "Wienda Aswar"]);
    expect([r.rows[1].receiver, r.rows[1].receive_date, r.rows[1].receiver_raw]).toEqual([null, null, "-"]);
    expect(r.lines).toEqual([2, 4]); // baris ke-3 file adalah lanjutan Description
  });
  it("tanggal ketat 'DD Mon YYYY'; format lain & tanggal mustahil tidak ditebak", () => {
    expect([parseSjDate("05 Sep 2026"), parseSjDate("-"), parseSjDate(""), parseSjDate("2026-09-05"), parseSjDate("31 Feb 2026"), parseSjDate("05 Sept 2026")])
      .toEqual(["2026-09-05", null, null, "invalid", "invalid", "invalid"]);
  });
  it("SJ kosong dipisahkan dengan nomor baris & alasan; kolom wajib hilang → error jelas", () => {
    const r = parseSjCsv([head, line("", "Wienda Aswar", "03 Sep 2026"), line("SJ/102", "-", "-")].join("\n"));
    expect(r.bad).toEqual([{ line: 2, reason: "No. SJ kosong" }]);
    expect(r.rows.map((x) => x.sj_no)).toEqual(["SJ/102"]);
    expect(() => parseSjCsv("Area,Nomor\nJakarta,1")).toThrow(/SJ No\., Tanggal SJ, Receive Date, Receiver/);
    expect(() => parseCsv('a,"b\n')).toThrow(/tidak ditutup/);
  });
  it("statistik preview: SJ unik & berulang", () => {
    const r = parseSjCsv([head, line("SJ/1", "-", "-"), line("SJ/1", "Wienda Aswar", "03 Sep 2026"), line("SJ/2", "-", "-")].join("\n"));
    expect(r.stats).toMatchObject({ records: 3, uniqueSj: 2, repeatedSj: 1, withReceiver: 1 });
  });
});

describe("dokumen SJ dari laporan (Fase 85)", () => {
  const head = SJ_HEADERS.join(",");
  const line = (sj: string, tgl: string, send: string, loc = "TRA-JKT D5", area = "Jakarta") =>
    [area, sj, tgl, "Toko A", loc, send, "Siti", "-", "-", "-", "Ya", "-", "R", "PT X", "B 1", "Budi", "", "1"].join(",");
  it("satu dokumen per SJ; Send Date paling awal; field kosong diisi baris berikutnya; MR/… diabaikan", () => {
    const p = parseSjCsv([head,
      line("SJ/1", "01 Sep 2026", "03 Sep 2026", "-"),
      line("sj/1", "01 Sep 2026", "02 Sep 2026"),
      line("SJ/2", "05 Sep 2026", "-"),
      line("MR/9", "05 Sep 2026", "-"),
    ].join("\n"));
    expect(docRows(p)).toEqual([
      { sj_key: "SJ/1", sj_no: "SJ/1", tanggal_sj: "2026-09-01", area: "Jakarta", business_partner: "Toko A", locator: "TRA-JKT D5", send_date: "2026-09-02" },
      { sj_key: "SJ/2", sj_no: "SJ/2", tanggal_sj: "2026-09-05", area: "Jakarta", business_partner: "Toko A", locator: "TRA-JKT D5", send_date: null },
    ]);
  });
});
