// Angka Dashboard Mutasi (port mdlDashboard.bas) dari hasil RPC mutasi_dashboard.

// exc/excN = nominal & jumlah transaksi yang ditandai manual "tidak dihitung" (tidak termasuk di mut).
export type MutasiDay = { date: string; mut: Record<string, number>; alloc: number; allocT: number; inv: number; exc?: number; excN?: number };
export type MutasiRaw = { accounts: string[]; target: number; targetCount: number; days: MutasiDay[]; months: string[] };

export type DailyRow = {
  date: string;
  perAccount: Record<string, number>;
  total: number;
  alloc: number;
  allocT: number;
  inv: number;
  // Kumulatif; null setelah hari ini (grafik berhenti di TODAY seperti NA() di Excel).
  cumAccount: Record<string, number | null>;
  cumTotal: number | null;
  cumAlloc: number | null;
  cumAllocT: number | null;
};

export function buildMutasi(raw: MutasiRaw, today: string) {
  const perAccount: Record<string, number> = Object.fromEntries(raw.accounts.map((a) => [a, 0]));
  let total = 0, alloc = 0, allocT = 0, inv = 0, excluded = 0, excludedCount = 0;
  const cum: Record<string, number> = { ...perAccount };
  let cTotal = 0, cAlloc = 0, cAllocT = 0;

  const daily: DailyRow[] = raw.days.map((d) => {
    const row: Record<string, number> = {};
    let dayTotal = 0;
    for (const a of raw.accounts) {
      const v = Number(d.mut[a] ?? 0);
      row[a] = v;
      dayTotal += v;
      perAccount[a] += v;
      cum[a] += v;
    }
    excluded += Number(d.exc ?? 0); excludedCount += Number(d.excN ?? 0);
    total += dayTotal; alloc += Number(d.alloc); allocT += Number(d.allocT); inv += Number(d.inv);
    cTotal += dayTotal; cAlloc += Number(d.alloc); cAllocT += Number(d.allocT);
    const future = d.date > today;
    return {
      date: d.date, perAccount: row, total: dayTotal, alloc: Number(d.alloc), allocT: Number(d.allocT), inv: Number(d.inv),
      cumAccount: Object.fromEntries(raw.accounts.map((a) => [a, future ? null : cum[a]])),
      cumTotal: future ? null : cTotal,
      cumAlloc: future ? null : cAlloc,
      cumAllocT: future ? null : cAllocT,
    };
  });

  const target = Number(raw.target);
  return {
    perAccount, total, alloc, allocT, inv, target, excluded, excludedCount,
    targetCount: Number(raw.targetCount),
    realisasi: target ? allocT / target : 0, // Realization / Target = Allocated in Target ÷ Target
    daily,
  };
}
