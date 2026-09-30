import { describe, expect, it } from "vitest";
import { parseCsv, parseSjCsv, parseSjDate, SJ_HEADERS } from "./parse";
import {
  activeSet, defaultPeriod, eventRoles, FLAG, filterRows, fmtAvg, historyRows, HISTORY_HEADER, receiverImpact, recognize, ROLE_LABEL,
  STATUS_DONE, STATUS_OPEN, summarize, trendSeries, type SjEvent,
} from "./compute";

const TODAY = "2026-09-30";
const REC = activeSet([{ id: 1, name: "Bintang Anugia Arragi", active: true }, { id: 2, name: "Wienda Aswar", active: true }]);
let nextId = 1;
/** Kejadian sintetis: seq = urutan upload, row = nomor baris file. */
function ev(sj: string, receiver: string | null, receive: string | null, o: Partial<SjEvent> = {}): SjEvent {
  return {
    id: nextId++, seq: 1, row_no: nextId, batch_id: 1, sj_no: sj, sj_key: sj.toUpperCase(), area: "Jakarta", tanggal_sj: "2026-09-01",
    tanggal_sj_raw: "01 Sep 2026", business_partner: "Toko A", locator: "TRA-JKT D1", send_date: null, sender: null,
    receive_date: receive, receive_date_raw: receive ?? "-", receiver, faktur: "Ya", send_receipt_doc_no: null, ...o,
  };
}
const one = (evs: SjEvent[], rec = REC) => recognize(evs, rec, TODAY)[0];

describe("pengakuan Receiver", () => {
  it("dua Receiver diakui, termasuk variasi kapital & spasi berlebih", () => {
    expect(one([ev("SJ/1", "  bintang   ANUGIA arragi ", "2026-09-03")]).status).toBe(STATUS_DONE);
    expect(one([ev("SJ/2", "WIENDA aswar", "2026-09-02")]).receiver).toBe("WIENDA aswar"); // nama asli tampil
  });
  it("Receiver lain / kosong tetap Belum diterima (tanpa fuzzy)", () => {
    expect(one([ev("SJ/3", "Marselia Angelia", "2026-09-05")]).status).toBe(STATUS_OPEN);
    expect(one([ev("SJ/4", "Wienda Aswr", "2026-09-05")]).status).toBe(STATUS_OPEN);
    expect(one([ev("SJ/5", null, "2026-09-05")]).flags).toContain(FLAG.dateNoReceiver);
  });
});

describe("penerimaan pertama yang diakui menjadi acuan (urutan sumber)", () => {
  it("Bintang lalu Wienda → Bintang & tanggal baris Bintang", () => {
    const r = one([ev("SJ/10", "Bintang Anugia Arragi", "2026-09-04"), ev("SJ/10", "Wienda Aswar", "2026-09-02")]);
    expect([r.receiver, r.receive_date, r.durasi]).toEqual(["Bintang Anugia Arragi", "2026-09-04", 3]);
    expect(r.flags).toContain(FLAG.multi);
  });
  it("Wienda lalu Bintang → Wienda", () => {
    const r = one([ev("SJ/11", "Wienda Aswar", "2026-09-06"), ev("SJ/11", "Bintang Anugia Arragi", "2026-09-02")]);
    expect([r.receiver, r.receive_date]).toEqual(["Wienda Aswar", "2026-09-06"]);
  });
  it("Receiver lain lalu Bintang → Bintang", () => {
    const r = one([ev("SJ/12", "Marselia Angelia", "2026-09-02"), ev("SJ/12", "Bintang Anugia Arragi", "2026-09-05")]);
    expect([r.status, r.receiver, r.durasi]).toEqual([STATUS_DONE, "Bintang Anugia Arragi", 4]);
  });
  it("semua Receiver di luar daftar → Belum diterima + penanda", () => {
    const r = one([ev("SJ/13", "Marselia Angelia", "2026-09-02"), ev("SJ/13", null, null)]);
    expect(r.status).toBe(STATUS_OPEN);
    expect(r.flags).toContain(FLAG.onlyOther);
    expect(r.umur).toBe(29);
  });
  it("diakui pertama tanpa tanggal, diakui kedua bertanggal → acuan tetap baris pertama, tanggal ditandai", () => {
    const r = one([ev("SJ/14", "Wienda Aswar", null), ev("SJ/14", "Bintang Anugia Arragi", "2026-09-03")]);
    expect([r.status, r.receiver, r.receive_date, r.durasi]).toEqual([STATUS_DONE, "Wienda Aswar", null, null]);
    expect(r.flags).toContain(FLAG.recvDateInvalid);
  });
  it("duplikat tidak bersebelahan & input teracak: acuan tetap menurut (upload, nomor baris), bukan urutan array/tanggal", () => {
    const a = ev("SJ/15", "Wienda Aswar", "2026-09-09", { seq: 1, row_no: 50 });
    const b = ev("SJ/16", "Bintang Anugia Arragi", "2026-09-02", { seq: 1, row_no: 51 });
    const c = ev("SJ/15", "Bintang Anugia Arragi", "2026-09-02", { seq: 1, row_no: 900 });
    const rows = recognize([c, b, a], REC, TODAY); // urutan array = hasil sort tabel/DB
    const r = rows.find((x) => x.sj_key === "SJ/15")!;
    expect([r.receiver, r.receive_date, r.laporan]).toEqual(["Wienda Aswar", "2026-09-09", 2]);
  });
  it("antar-upload: kejadian di upload terbit lebih dulu diutamakan; upload berikutnya hanya melengkapi", () => {
    const old = ev("SJ/17", null, null, { seq: 1, row_no: 5 });
    const later = ev("SJ/17", "Bintang Anugia Arragi", "2026-09-03", { seq: 2, row_no: 2 });
    const r = one([later, old]);
    expect([r.status, r.receiver]).toEqual([STATUS_DONE, "Bintang Anugia Arragi"]);
    const first = ev("SJ/18", "Wienda Aswar", "2026-09-05", { seq: 1, row_no: 9 });
    const second = ev("SJ/18", "Bintang Anugia Arragi", "2026-09-02", { seq: 2, row_no: 1 });
    expect(one([second, first]).receiver).toBe("Wienda Aswar");
  });
  it("peran tiap kejadian untuk detail riwayat", () => {
    const e1 = ev("SJ/19", "Marselia Angelia", "2026-09-02"), e2 = ev("SJ/19", "Wienda Aswar", "2026-09-03"), e3 = ev("SJ/19", "Bintang Anugia Arragi", "2026-09-04"), e4 = ev("SJ/19", null, null);
    const roles = eventRoles([e3, e1, e4, e2], REC);
    expect([roles.get(e1.id), roles.get(e2.id), roles.get(e3.id), roles.get(e4.id)]).toEqual(["tidak-diakui", "acuan", "diakui-setelah", "kosong"]);
  });
});

describe("tanggal & durasi", () => {
  it("hari yang sama = 0 hari; umur belum diterima dari hari ini", () => {
    expect(one([ev("SJ/20", "Wienda Aswar", "2026-09-01")]).durasi).toBe(0);
    expect(one([ev("SJ/21", null, null, { tanggal_sj: "2026-09-25" })]).umur).toBe(5);
  });
  it("durasi negatif ditandai & tidak jadi 0; tanggal masa depan & Tanggal SJ invalid dikeluarkan", () => {
    const neg = one([ev("SJ/22", "Wienda Aswar", "2026-08-28")]);
    expect([neg.durasi, neg.flags.includes(FLAG.negative)]).toEqual([null, true]);
    const fut = one([ev("SJ/23", "Wienda Aswar", "2026-10-05")]);
    expect([fut.durasi, fut.flags.includes(FLAG.future)]).toEqual([null, true]);
    const bad = one([ev("SJ/24", "Wienda Aswar", "2026-09-03", { tanggal_sj: null, tanggal_sj_raw: "31 Feb 2026" })]);
    expect([bad.status, bad.durasi, bad.flags.includes(FLAG.sjDateInvalid)]).toEqual([STATUS_DONE, null, true]);
  });
});

describe("ringkasan", () => {
  it("rata-rata satu kali per SJ (duplikat tidak dihitung ganda), sampel & dikecualikan, total = rata-rata semua durasi", () => {
    const rows = recognize([
      ev("A", "Wienda Aswar", "2026-09-03"), ev("A", "Bintang Anugia Arragi", "2026-09-10"), // durasi 2 (acuan Wienda)
      ev("B", "Bintang Anugia Arragi", "2026-09-05"), // 4
      ev("C", "Bintang Anugia Arragi", "2026-09-07"), // 6
      ev("D", "Wienda Aswar", null), // dikecualikan
      ev("E", null, null),
    ], REC, TODAY);
    const s = summarize(rows);
    expect([s.total, s.done, s.open, s.sample, s.excluded, s.avg]).toEqual([5, 4, 1, 3, 1, 4]);
    expect(s.quality).toEqual({ multi: 1, onlyOther: 0, dateIssues: 1, sourceRows: 6, unique: 5 });
    // per Receiver: Wienda (2), Bintang (4, 6 → 5) — rata-rata total 4, bukan rata-rata antar-Receiver (3,5)
    expect(s.byReceiver.find((r) => r.receiver === "Bintang Anugia Arragi")!.avg).toBe(5);
    expect(s.byReceiver.find((r) => r.receiver === "Wienda Aswar")!.avg).toBe(2);
  });
  it("sampel kosong → '—', bukan 0 hari", () => {
    const s = summarize(recognize([ev("X", null, null)], REC, TODAY));
    expect([s.avg, fmtAvg(s.avg)]).toEqual([null, "—"]);
    expect(fmtAvg(3.25)).toBe("3,3 hari");
  });
  it("bucket umur & rekonsiliasi: filter yang sama untuk KPI dan Kertas Kerja", () => {
    const rows = recognize([
      ev("P", null, null, { tanggal_sj: "2026-09-29" }), ev("Q", null, null, { tanggal_sj: "2026-09-20", area: "Medan" }),
      ev("R", null, null, { tanggal_sj: "2026-08-01" }), ev("S", "Wienda Aswar", "2026-09-02"),
    ], REC, TODAY);
    const f = { from: "2026-09-01", to: "2026-09-30", area: "" };
    const shown = filterRows(rows, f);
    const s = summarize(shown);
    expect([shown.length, s.total, s.done + s.open]).toEqual([3, 3, 3]);
    expect(s.ageBuckets.map((b) => b.count)).toEqual([1, 0, 1, 0, 0]);
    expect(filterRows(rows, { ...f, area: "Medan" }).map((r) => r.sj_key)).toEqual(["Q"]);
  });
});

describe("perubahan daftar Receiver", () => {
  it("menambah Marselia mengubah status SJ yang hanya diterima Marselia; menonaktifkan Wienda menggeser acuan", () => {
    const evs = [
      ev("M1", "Marselia Angelia", "2026-09-02"),
      ev("M2", "Wienda Aswar", "2026-09-02"), ev("M2", "Bintang Anugia Arragi", "2026-09-04"),
      ev("M3", "Wienda Aswar", "2026-09-03"),
    ];
    const withM = activeSet([{ id: 1, name: "Bintang Anugia Arragi", active: true }, { id: 2, name: "Wienda Aswar", active: true }, { id: 3, name: "Marselia Angelia", active: true }]);
    expect(receiverImpact(evs, REC, withM, TODAY)).toEqual({ statusChanged: 1, refChanged: 0 });
    const noW = activeSet([{ id: 1, name: "Bintang Anugia Arragi", active: true }, { id: 2, name: "Wienda Aswar", active: false }]);
    expect(receiverImpact(evs, REC, noW, TODAY)).toEqual({ statusChanged: 1, refChanged: 1 });
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

describe("periode, tren & ekspor riwayat", () => {
  it("periode bawaan = bulan Tanggal SJ terbaru yang tidak di masa depan", () => {
    const rows = recognize([ev("A", null, null, { tanggal_sj: "2026-08-15" }), ev("B", null, null, { tanggal_sj: "2026-09-02" }),
      ev("C", null, null, { tanggal_sj: "2026-12-01" })], REC, TODAY);
    expect(defaultPeriod(rows, TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(defaultPeriod(recognize([ev("D", null, null, { tanggal_sj: "2024-02-10" })], REC, TODAY), TODAY)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(defaultPeriod([], TODAY)).toEqual({ from: "", to: "" });
  });
  it("tren harian ≤ 45 hari, selain itu mingguan (Senin) tanpa kehilangan jumlah", () => {
    const daily = [{ date: "2026-09-01", done: 1, open: 2 }, { date: "2026-09-03", done: 3, open: 0 }];
    expect(trendSeries(daily).map((t) => t.label)).toEqual(["2026-09-01", "2026-09-03"]);
    const long = [{ date: "2026-06-03", done: 2, open: 1 }, { date: "2026-06-05", done: 1, open: 1 }, { date: "2026-09-01", done: 4, open: 0 }];
    const w = trendSeries(long);
    expect(w.every((t) => t.weekly)).toBe(true);
    expect(w[0]).toMatchObject({ label: "2026-06-01", done: 3, open: 2 }); // 3 & 5 Juni 2026 = minggu Senin 1 Juni
    expect(w.reduce((a, t) => a + t.done + t.open, 0)).toBe(9);
  });
  it("rekonsiliasi: KPI total = baris Kertas Kerja = SJ unik di ekspor; ekspor memuat SEMUA baris sumber dengan peran", () => {
    const evs = [
      ev("R/1", null, null, { seq: 1, row_no: 2 }), ev("R/1", "Wienda Aswar", "2026-09-04", { seq: 1, row_no: 3 }),
      ev("R/1", "Bintang Anugia Arragi", "2026-09-05", { seq: 2, row_no: 2 }), ev("R/2", "Marselia Angelia", "2026-09-06", { seq: 1, row_no: 4 }),
      ev("R/3", null, null, { tanggal_sj: "2026-08-01", seq: 1, row_no: 5 }),
    ];
    const rows = filterRows(recognize(evs, REC, TODAY), { from: "2026-09-01", to: "2026-09-30", area: "" });
    const byKey = new Map<string, SjEvent[]>();
    for (const e of evs) byKey.set(e.sj_key, [...(byKey.get(e.sj_key) ?? []), e]);
    const out = historyRows(rows, byKey, REC);
    expect(summarize(rows).total).toBe(rows.length);
    expect(new Set(out.map((r) => r[0])).size).toBe(rows.length);
    expect(out).toHaveLength(4); // R/1 (3 baris) + R/2 (1 baris); R/3 di luar periode
    const role = HISTORY_HEADER.indexOf("Peran baris");
    expect(out.filter((r) => r[0] === "R/1").map((r) => r[role])).toEqual([ROLE_LABEL.kosong, ROLE_LABEL.acuan, ROLE_LABEL["diakui-setelah"]]);
    expect(out.find((r) => r[0] === "R/2")![role]).toBe(ROLE_LABEL["tidak-diakui"]);
  });
});
