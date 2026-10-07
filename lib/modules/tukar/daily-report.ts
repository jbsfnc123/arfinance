import { tukarKpi, type TukarDay } from "./dashboard";

// One matrix for screen and export; totals keep the existing sum-of-daily-values rule.
export function dailyReport(month: string, days: TukarDay[], collector: string) {
  const [year, m] = month.split("-").map(Number);
  const total = tukarKpi(days);
  const columns = days.map((d) => ({ day: d.day, sunday: new Date(Date.UTC(year, m - 1, d.day)).getUTCDay() === 0 }));
  const rows = [
    { label: "Invoice", values: days.map((d) => d.inv), total: total.totalInvoice },
    { label: "Business Partner", values: days.map((d) => d.bp), total: total.totalBP },
    { label: "Titik Lokasi", values: days.map((d) => d.lok), total: total.totalLokasi },
  ];
  return { columns, rows, activeDays: total.activeDays,
    excel: [
      ["Laporan Harian Kolektor"], ["Periode", month], ["Kolektor", collector || "Semua Kolektor"],
      ["Hari aktif", total.activeDays], [],
      ["Tanggal", ...columns.map((c) => c.day), "Total"],
      ...rows.map((r) => [r.label, ...r.values, r.total]),
    ],
  };
}
