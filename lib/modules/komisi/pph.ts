// Kalkulator PPh komisi (tanpa database). Orang pribadi bukan pegawai: PPh 21 = tarif Pasal 17 atas 50% bruto,
// progresif atas DPP kumulatif semua baris. Badan: PPh 23 = 2% bruto.
export type Penerima = "orang" | "badan";

export const LAPISAN_PASAL17: readonly [number, number][] = [
  [60_000_000, 0.05], [250_000_000, 0.15], [500_000_000, 0.25], [5_000_000_000, 0.3], [Infinity, 0.35],
];

export function pphPasal17(dpp: number): number {
  let sisa = Math.max(0, dpp), bawah = 0, pajak = 0;
  for (const [atas, tarif] of LAPISAN_PASAL17) {
    const kena = Math.min(sisa, atas - bawah);
    if (kena <= 0) break;
    pajak += kena * tarif; sisa -= kena; bawah = atas;
  }
  return pajak;
}

export type BarisHasil = { bruto: number; dpp: number; tarif: string; pph: number; neto: number };

export function hitungKomisi(penerima: Penerima, brutos: number[]): { rows: BarisHasil[]; bruto: number; pph: number; neto: number } {
  let dppKum = 0;
  const rows = brutos.map((b) => {
    const bruto = Math.max(0, Math.floor(b || 0));
    if (penerima === "badan") {
      const pph = Math.floor(bruto * 0.02);
      return { bruto, dpp: bruto, tarif: "2%", pph, neto: bruto - pph };
    }
    const dpp = Math.floor(bruto / 2);
    const pph = Math.floor(pphPasal17(dppKum + dpp)) - Math.floor(pphPasal17(dppKum));
    const tarifs = LAPISAN_PASAL17.filter(([atas], i) => {
      const bawah = i ? LAPISAN_PASAL17[i - 1][0] : 0;
      return dpp > 0 && dppKum < atas && dppKum + dpp > bawah;
    }).map(([, t]) => `${Math.round(t * 100)}%`);
    dppKum += dpp;
    return { bruto, dpp, tarif: tarifs.join(" + ") || "-", pph, neto: bruto - pph };
  });
  const bruto = rows.reduce((s, r) => s + r.bruto, 0), pph = rows.reduce((s, r) => s + r.pph, 0);
  return { rows, bruto, pph, neto: bruto - pph };
}
