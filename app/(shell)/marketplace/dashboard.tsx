"use client";

import type { EChartsOption } from "echarts";
import { platformOf, type Report, type Row } from "@/lib/modules/marketplace/parse";
import {
  buildRecon, buildReconAdj, fmt, groupSum, hasBalance, reconProblems, statusRefund, sumBy, sumOf, type AuditRow,
} from "@/lib/modules/marketplace/analysis";
import { AUDIT_COLS, auditForTable, orderTableCols, RECON_COLS, withGroups } from "@/lib/modules/marketplace/tables";
import type { TableSpec } from "@/components/data-table-modal";
import { Chart, CHART_GRID } from "@/components/chart";
import { card, inputCls } from "@/components/ui";

const PALETTE = ["#ee4d2d", "#8ab4f8", "#81c995", "#fdd663", "#c58af9", "#78d9ec", "#f28b82", "#a8dab5", "#9aa0a6", "#fcad70"];
const fmtShort = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(2).replace(".", ",") + " M";
  if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace(".", ",") + " jt";
  if (a >= 1e3) return s + (a / 1e3).toFixed(0) + " rb";
  return s + a;
};
const N = (v: unknown) => Number(v) || 0;

function countBy(rows: Row[], f: (r: Row) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

type Show = (spec: TableSpec) => void;
type Kpi = { lbl: string; val: number; note: string; count?: boolean; alert?: boolean; go: () => void };

const CHIP = { bad: "border-danger/50 text-danger", warn: "border-warning/50 text-warning", ok: "border-success/50 text-success", "": "border-line" };

export function Dashboard(props: { R: Report; audit: AuditRow[]; auditLimit: number; setAuditLimit: (v: number) => void; show: Show }) {
  const { R, audit, show } = props;
  const P = platformOf(R);
  const O = R.Orders;
  const drillOrders = (title: string, rows: Row[]) => show({ title, rows: withGroups(R, rows), cols: orderTableCols(R) });
  const bad = audit.filter((r) => r.status === "Kelebihan potong");
  const refundOrders = O.filter((r) => N(r.refund) !== 0);

  // ── KPI ──
  const kpis: Kpi[] = [];
  if (O.length) {
    const pendapatan = sumOf(R, "pendapatan", () => sumBy(O, "harga") + sumBy(O, "refund"));
    const pengeluaran = sumOf(R, "pengeluaran", () => P.feeGroups.reduce((a, g) => a + O.reduce((b, r) => b + groupSum(R, r, g), 0), 0));
    kpis.push(
      { lbl: "Total Pendapatan", val: pendapatan, note: `${P.labels.harga} ${fmtShort(sumOf(R, "harga", () => sumBy(O, "harga")))} · Refund ${fmtShort(sumOf(R, "refund", () => sumBy(O, "refund")))}`, go: () => drillOrders("Semua Pesanan", O) },
      { lbl: "Total Pengeluaran", val: pengeluaran, note: `${pendapatan ? ((Math.abs(pengeluaran) / pendapatan) * 100).toFixed(1) : 0}% dari pendapatan`, go: () => drillOrders("Semua Pesanan", O) },
      { lbl: P.labels.dilepas, val: sumOf(R, "dilepas", () => sumBy(O, "penghasilan")), note: "Dana yang diterima penjual", go: () => drillOrders("Semua Pesanan", O) },
      { lbl: "Jumlah Pesanan", val: O.length, count: true, note: `${refundOrders.length} pesanan ada refund`, go: () => drillOrders("Pesanan dengan Refund", refundOrders) },
      { lbl: "Selisih Refund", val: -bad.reduce((a, r) => a + r.selisih, 0), alert: bad.length > 0,
        note: bad.length ? `${bad.length} pesanan ditarik melebihi dana diterima` : "Semua refund sesuai",
        go: () => show({ title: "Analisis Refund — Kelebihan Potong", rows: auditForTable(bad), cols: AUDIT_COLS }) },
    );
  }
  const balanceCols = [
    { k: "waktu", l: "Waktu" }, { k: "tipe", l: "Tipe Transaksi" }, { k: "no", l: "No. Pesanan", link: true },
    { k: "arah", l: "Arah" }, { k: "nilai", l: "Jumlah", n: true }, { k: "saldoAkhir", l: "Saldo Setelahnya", n: true },
    { k: "status", l: "Status" }, { k: "deskripsi", l: "Deskripsi" },
  ];
  if (hasBalance(R)) {
    const bs = R.balanceSummary;
    const last = R.Balance[0] ?? {};
    kpis.push(
      { lbl: "Saldo Masuk", val: bs["Total Saldo Masuk"] ?? sumBy(R.Balance.filter((b) => N(b.nilai) > 0), "nilai"), note: `${R.Balance.length.toLocaleString("id-ID")} transaksi saldo`, go: () => show({ title: "Mutasi Saldo", rows: R.Balance, cols: balanceCols }) },
      { lbl: "Saldo Keluar", val: bs["Total Saldo Keluar"] ?? sumBy(R.Balance.filter((b) => N(b.nilai) < 0), "nilai"), note: "Penarikan + penyesuaian", go: () => show({ title: "Mutasi Saldo — Transaksi Keluar", rows: R.Balance.filter((b) => b.arah === "Transaksi Keluar"), cols: balanceCols }) },
      { lbl: "Saldo Akhir", val: N(last.saldoAkhir), note: String(last.waktu ?? ""), go: () => show({ title: "Mutasi Saldo", rows: R.Balance, cols: balanceCols }) },
    );
    if (O.length) {
      const masalah = reconProblems(R);
      kpis.push({ lbl: "Rekonsiliasi Saldo", val: masalah.length, count: true, alert: masalah.length > 0,
        note: masalah.length ? "baris tidak cocok dengan mutasi saldo" : "Laporan cocok dengan mutasi saldo",
        go: () => show({ title: "Rekonsiliasi Saldo — Perlu Dicek", rows: masalah, cols: RECON_COLS }) });
    }
  }
  if (R.meta.platform === "shopee" && O.length) {
    kpis.push(
      { lbl: "Penyesuaian", val: R.adjustmentSummary["Total Penyesuaian"] ?? sumBy(R.Adjustment, "nilai"), note: `${R.Adjustment.length} transaksi`,
        go: () => show({ title: "Rincian Penyesuaian", rows: R.Adjustment, cols: [
          { k: "tanggal", l: "Tanggal" }, { k: "deskripsi", l: "Tipe" }, { k: "alasan", l: "Alasan" },
          { k: "no", l: "No. Pesanan", link: true }, { k: "cairLama", l: "Tgl Dana Dilepas" }, { k: "nilai", l: "Nilai", n: true }] }) },
      { lbl: "Selisih Ongkir", val: -R.ShippingDiscrepancy.reduce((a, r) => a + N(r.dibayar) - N(r.estimasi), 0), note: `${R.ShippingDiscrepancy.length} pesanan ongkir > estimasi`,
        go: () => show({ title: "Selisih Ongkos Kirim", rows: R.ShippingDiscrepancy.map((r) => ({ ...r, selisih: N(r.dibayar) - N(r.estimasi) })), cols: [
          { k: "no", l: "No. Pesanan", link: true }, { k: "estimasi", l: "Estimasi", n: true },
          { k: "dibayar", l: "Dibayar ke Jasa Kirim", n: true }, { k: "selisih", l: "Selisih", n: true }, { k: "alasan", l: "Alasan" }] }) },
    );
  } else if (R.meta.platform === "tiktok") {
    const wd = R.Withdrawals.filter((w) => N(w.nilai) < 0);
    kpis.push({ lbl: "Penarikan ke Bank", val: sumBy(wd, "nilai"), note: `${wd.length} kali penarikan`,
      go: () => show({ title: "Riwayat Penarikan", rows: R.Withdrawals, cols: [
        { k: "tglMinta", l: "Waktu Permintaan" }, { k: "jenis", l: "Jenis" }, { k: "refId", l: "ID Referensi" },
        { k: "nilai", l: "Total", n: true }, { k: "status", l: "Status" }, { k: "tglSukses", l: "Waktu Berhasil" }, { k: "rekening", l: "Rekening" }] }) });
  }

  // ── Analisis refund ──
  const auditChips: { l: string; cls: keyof typeof CHIP; rows: AuditRow[] }[] = [
    { l: "Kelebihan potong", cls: "bad", rows: bad },
    { l: "Biaya tidak dikembalikan", cls: "warn", rows: audit.filter((r) => r.status === "Biaya tidak dikembalikan") },
    { l: "Perlu cek manual", cls: "warn", rows: audit.filter((r) => r.status === "Perlu cek manual") },
    { l: "Hanya di mutasi saldo", cls: "warn", rows: audit.filter((r) => r.status === "Hanya di mutasi saldo") },
    { l: "Sesuai", cls: "ok", rows: audit.filter((r) => r.status === "Sesuai") },
    { l: "Semua", cls: "", rows: audit },
  ];
  const topAudit = audit.filter((r) => r.status !== "Sesuai").slice(0, 5);

  // ── Rekonsiliasi saldo ──
  const recon = hasBalance(R) && O.length ? buildRecon(R) : [];
  const adjLuar = hasBalance(R) && O.length ? buildReconAdj(R) : [];
  const reconChips = [
    { l: "Nominal beda", cls: "bad" as const, rows: recon.filter((r) => r.status === "Nominal beda") },
    { l: "Tanpa pesanan", cls: "bad" as const, rows: recon.filter((r) => r.status === "Tanpa pesanan") },
    { l: "Penyesuaian di luar laporan", cls: "warn" as const, rows: adjLuar },
    { l: "Belum masuk saldo", cls: "warn" as const, rows: recon.filter((r) => r.status === "Belum masuk saldo") },
    { l: "Cocok", cls: "ok" as const, rows: recon.filter((r) => r.status === "Cocok") },
    { l: "Semua", cls: "" as const, rows: [...recon, ...adjLuar] },
  ];
  const masalahSaldo = recon.length ? reconProblems(R) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <button key={k.lbl} type="button" onClick={k.go}
            className={`${card} p-4 text-left hover:border-accent ${k.alert ? "border-danger/60" : ""}`}>
            <div className="text-xs text-fg-2">{k.lbl}</div>
            <div className={`mt-1 text-lg font-medium ${k.count ? "" : k.val < 0 ? "text-danger" : "text-success"}`}>
              {k.count ? k.val.toLocaleString("id-ID") : fmt(k.val)}
            </div>
            <div className="text-xs text-fg-2">{k.note}</div>
          </button>
        ))}
      </div>

      {(O.length > 0 || hasBalance(R)) && (
        <section className={`${card} space-y-3 p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-medium">Analisis Selisih Refund</h2>
            <label className="text-xs text-fg-2">Toleransi selisih (Rp)
              <input type="number" value={props.auditLimit} onChange={(e) => props.setAuditLimit(Number(e.target.value) || 0)} className={`${inputCls} ml-2 !w-28 !py-1`} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {auditChips.map((c) => (
              <button key={c.l} type="button" onClick={() => show({ title: "Analisis Refund — " + c.l, rows: auditForTable(c.rows), cols: AUDIT_COLS })}
                className={`rounded-full border px-3 py-1 text-xs ${CHIP[c.cls]}`}>{c.l}: <b>{c.rows.length}</b></button>
            ))}
          </div>
          <p className="text-sm">
            {bad.length
              ? <>Total kelebihan potong: <b className="text-danger">{fmt(bad.reduce((a, r) => a + r.selisih, 0))}</b> dari {bad.length} pesanan.</>
              : "Tidak ada pesanan yang ditarik melebihi dana yang diterima."}
          </p>
          {topAudit.length > 0 && (
            <table className="w-full text-xs">
              <thead><tr>{["No. Pesanan", "Tanggal", "Diterima", "Ditarik", "Selisih", "Status"].map((h, i) => <th key={h} className={`px-2 py-1 font-medium text-fg-2 ${i >= 2 && i <= 4 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {topAudit.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-2 py-1">{r.no}</td><td className="px-2 py-1">{r.tanggal}</td>
                    <td className="px-2 py-1 text-right">{r.diterima === null ? "?" : r.diterima.toLocaleString("id-ID")}</td>
                    <td className="px-2 py-1 text-right">{r.ditarik.toLocaleString("id-ID")}</td>
                    <td className="px-2 py-1 text-right text-danger">{r.selisih.toLocaleString("id-ID")}</td>
                    <td className="px-2 py-1">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {recon.length > 0 && (
        <section className={`${card} space-y-3 p-4`}>
          <h2 className="font-medium">Rekonsiliasi Laporan vs Mutasi Saldo</h2>
          <div className="flex flex-wrap gap-2">
            {reconChips.map((c) => (
              <button key={c.l} type="button" onClick={() => show({ title: "Rekonsiliasi Saldo — " + c.l, rows: c.rows, cols: RECON_COLS })}
                className={`rounded-full border px-3 py-1 text-xs ${CHIP[c.cls]}`}>{c.l}: <b>{c.rows.length}</b></button>
            ))}
          </div>
          <p className="text-sm">
            {masalahSaldo.length
              ? <><b className="text-danger">{masalahSaldo.length}</b> baris perlu dicek. Dana masuk {fmt(sumBy(R.Balance.filter((b) => /penghasilan dari pesanan/i.test(String(b.tipe))), "nilai"))} vs laporan {fmt(sumBy(O, "penghasilan"))}.</>
              : "Semua cocok: dana masuk sama dengan laporan penghasilan."}
          </p>
        </section>
      )}

      {O.length === 0 ? (
        hasBalance(R) && <p className={`${card} p-4 text-sm text-fg-2`}>Mode arus kas: upload Laporan Penghasilan periode ini untuk grafik dan rekonsiliasi.</p>
      ) : (
        <Charts R={R} show={show} drillOrders={drillOrders} />
      )}
    </div>
  );
}

function Charts({ R, show, drillOrders }: { R: Report; show: Show; drillOrders: (t: string, rows: Row[]) => void }) {
  const P = platformOf(R);
  const O = R.Orders;
  const groupTotal = (g: string) => {
    const s = P.groups[g].summary;
    return s !== undefined && R.summary[s] !== undefined ? R.summary[s] : O.reduce((a, r) => a + groupSum(R, r, g), 0);
  };
  const drillGroup = (g: string) => {
    const G = P.groups[g];
    const rows = withGroups(R, O.filter((r) => groupSum(R, r, g) !== 0));
    show({ title: G.label + " per Pesanan", rows, cols: [
      { k: "no", l: "No. Pesanan", link: true }, { k: "tglPesan", l: "Tgl Pesan" },
      ...G.keys.filter((k) => rows.some((r) => N(r[k]))).map((k) => ({ k, l: P.cols[k] || k, n: true })),
      { k: "g_" + g, l: "Total " + G.label, n: true }, { k: "penghasilan", l: "Dana Diterima", n: true }] });
  };
  const refundOrders = O.filter((r) => N(r.refund) !== 0);

  // Alur dana: harga → refund → tiap kelompok biaya → dana diterima
  const flow = [
    { l: P.labels.harga, v: sumOf(R, "harga", () => sumBy(O, "harga")), go: () => drillOrders("Semua Pesanan", O) },
    { l: "Refund", v: sumOf(R, "refund", () => sumBy(O, "refund")), go: () => drillOrders("Pesanan dengan Refund", refundOrders) },
    ...Object.keys(P.groups).map((g) => ({ l: P.groups[g].label, v: groupTotal(g), go: () => drillGroup(g) })),
    { l: P.labels.dilepas, v: sumOf(R, "dilepas", () => sumBy(O, "penghasilan")), total: true, go: () => drillOrders("Semua Pesanan", O) },
  ];
  const fee = P.feeGroups.map((g) => ({ g, v: Math.abs(groupTotal(g)) }));
  const feeTotal = fee.reduce((a, b) => a + b.v, 0) || 1;

  const daysMap = new Map<string, { v: number; n: number }>();
  for (const r of O) {
    const d = String(r.tglCair || "(kosong)");
    const x = daysMap.get(d) ?? { v: 0, n: 0 };
    x.v += N(r.penghasilan); x.n++;
    daysMap.set(d, x);
  }
  const days = [...daysMap.keys()].sort();

  const pay = countBy(O, (r) => String(r.metodeBayar || "(kosong)"));
  const prodMap = new Map<string, { v: number; n: number }>();
  for (const it of R.Items) {
    const p = prodMap.get(String(it.produk)) ?? { v: 0, n: 0 };
    p.v += N(it.penghasilan); p.n++;
    prodMap.set(String(it.produk), p);
  }
  const top = [...prodMap.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 10);
  const key2 = P.labels.dist2Key;
  const f2 = key2 === "statusRefund" ? statusRefund : (r: Row) => String(r[key2] || "(kosong)");
  const dist2 = countBy(O, f2);

  const axis = { axisLabel: { formatter: (v: number) => fmtShort(v) }, splitLine: { lineStyle: { color: CHART_GRID } } };

  const charts: { title: string; option: EChartsOption; onClick: (i: number) => void; wide?: boolean }[] = [
    { title: "Alur Dana", wide: true, onClick: (i) => flow[i].go(), option: {
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", valueFormatter: (v) => fmt(Number(v)) },
      xAxis: { type: "category", data: flow.map((f) => f.l), axisLabel: { interval: 0, fontSize: 10 } },
      yAxis: { type: "value", ...axis },
      series: [{ type: "bar", data: flow.map((f) => ({ value: f.v, itemStyle: { color: f.total ? "#8ab4f8" : f.v < 0 ? "#f28b82" : "#81c995", borderRadius: 4 } })) }],
    } },
    { title: "Rincian Pengeluaran", onClick: (i) => drillGroup(fee[i].g), option: {
      tooltip: { trigger: "item", formatter: (p) => { const x = p as { name: string; value: number }; return `${x.name}: ${fmt(x.value)} (${((x.value / feeTotal) * 100).toFixed(1)}%)`; } },
      legend: { bottom: 0, textStyle: { fontSize: 10 } }, color: PALETTE,
      series: [{ type: "pie", radius: ["40%", "70%"], top: -20, label: { show: false }, data: fee.map((f) => ({ name: P.groups[f.g].label, value: f.v })) }],
    } },
    { title: "Penghasilan Harian (tanggal dana dilepas)", wide: true, onClick: (i) => drillOrders("Pesanan tanggal " + days[i], O.filter((r) => String(r.tglCair || "(kosong)") === days[i])), option: {
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true }, tooltip: { trigger: "axis" }, legend: { top: 0, textStyle: { fontSize: 10 } },
      xAxis: { type: "category", data: days.map((d) => d.slice(5)) },
      yAxis: [{ type: "value", ...axis }, { type: "value", splitLine: { show: false } }],
      series: [
        { name: "Penghasilan", type: "line", smooth: true, areaStyle: { opacity: 0.15 }, data: days.map((d) => daysMap.get(d)!.v), color: "#ee4d2d" },
        { name: "Jumlah pesanan", type: "line", smooth: true, yAxisIndex: 1, data: days.map((d) => daysMap.get(d)!.n), color: "#8ab4f8" },
      ],
    } },
    { title: P.labels.dist1, onClick: (i) => drillOrders(`${P.labels.dist1}: ${pay[i][0]}`, O.filter((r) => String(r.metodeBayar || "(kosong)") === pay[i][0])), option: {
      tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: { fontSize: 10 }, type: "scroll" }, color: PALETTE,
      series: [{ type: "pie", radius: ["40%", "70%"], top: -20, label: { show: false }, data: pay.map(([name, value]) => ({ name, value })) }],
    } },
    { title: "10 Produk Teratas (dana diterima)", wide: true, onClick: (i) => {
      const name = top[top.length - 1 - i][0];
      const byNo = new Map(O.map((o) => [String(o.no), o]));
      show({ title: "Produk: " + name, rows: R.Items.filter((it) => it.produk === name).map((it) => ({ ...(byNo.get(String(it.no)) ?? {}), ...it })), cols: [
        { k: "no", l: "No. Pesanan", link: true }, { k: "tglPesan", l: "Tgl Pesan" }, { k: "idProduk", l: "ID Produk" }, { k: "qty", l: "Qty", n: true },
        { k: "harga", l: P.labels.harga, n: true }, { k: "refund", l: "Refund", n: true }, { k: "penghasilan", l: "Dana Diterima", n: true }] });
    }, option: {
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true }, tooltip: { trigger: "axis", valueFormatter: (v) => fmt(Number(v)) },
      xAxis: { type: "value", ...axis },
      yAxis: { type: "category", data: [...top].reverse().map((t) => t[0].replace(/^Penguin\s+/i, "").slice(0, 40)), axisLabel: { fontSize: 10 } },
      series: [{ type: "bar", data: [...top].reverse().map((t) => t[1].v), itemStyle: { color: "#ee4d2d", borderRadius: 4 } }],
    } },
    { title: P.labels.dist2, onClick: (i) => drillOrders(`${P.labels.dist2}: ${dist2[i][0]}`, O.filter((r) => f2(r) === dist2[i][0])), option: {
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true }, tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: dist2.map((d) => d[0]), axisLabel: { interval: 0, rotate: 30, fontSize: 10 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: CHART_GRID } } },
      series: [{ type: "bar", data: dist2.map((d) => d[1]), itemStyle: { color: "#8ab4f8", borderRadius: 4 } }],
    } },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {charts.map((c) => (
        <section key={c.title} className={`${card} p-4 ${c.wide ? "lg:col-span-2" : ""}`}>
          <h2 className="text-sm font-medium">{c.title}</h2>
          <Chart option={c.option} height={260} onClick={c.onClick} />
        </section>
      ))}
    </div>
  );
}
