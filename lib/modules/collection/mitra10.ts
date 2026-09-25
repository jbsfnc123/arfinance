import { daysBetween } from "@/lib/parsers/date";
import { monthKey } from "@/lib/format";
import type { CollectionRow } from "./view-model";

// Port Dashboard Mitra 10 (Aplikasi Utama/Script.html): invoice Catur Mitra Sejati Sentosa
// milik satu collection, dengan KPI dan akumulasi per bulan invoice.

export type Mitra10Month = {
  ym: string; // "" = tanpa tanggal
  cInv: number; cSudah: number; cBelum: number; cJadwal: number;
  nInv: number; nSudah: number; nBelum: number; nJadwal: number;
};

export function mitra10Summary(rows: CollectionRow[]) {
  let totalPiutang = 0;
  let jadwalNom = 0;
  let jadwalInv = 0;
  let sumHari = 0;
  let nHari = 0;
  const months = new Map<string, Mitra10Month>();
  const blank = (ym: string): Mitra10Month =>
    ({ ym, cInv: 0, cSudah: 0, cBelum: 0, cJadwal: 0, nInv: 0, nSudah: 0, nBelum: 0, nJadwal: 0 });
  const total = blank("TOTAL");

  for (const r of rows) {
    const amt = r.open_amt;
    totalPiutang += amt;
    if (r.janji_bayar) {
      jadwalNom += amt;
      jadwalInv++;
      if (r.tanggal_tukar) {
        sumHari += daysBetween(r.janji_bayar, r.tanggal_tukar);
        nHari++;
      }
    }
    const ym = monthKey(r.invoice_date);
    const m = months.get(ym) ?? blank(ym);
    for (const t of [m, total]) {
      t.cInv++; t.nInv += amt;
      if (r.metode_tukar) { t.cSudah++; t.nSudah += amt; } else { t.cBelum++; t.nBelum += amt; }
      if (r.janji_bayar) { t.cJadwal++; t.nJadwal += amt; }
    }
    months.set(ym, m);
  }

  return {
    totalPiutang,
    totalInv: rows.length,
    jadwalNom,
    jadwalInv,
    avgHari: nHari ? Math.floor(sumHari / nHari + 0.5) : null,
    nHari,
    months: [...months.values()].sort((a, b) => (a.ym === "" ? 1 : b.ym === "" ? -1 : a.ym.localeCompare(b.ym))),
    total,
  };
}
