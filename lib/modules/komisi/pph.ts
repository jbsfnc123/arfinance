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

export type Lapisan = { komisi: number; dpp: number; tarif: number; pph: number };
export type BarisHasil = { bruto: number; dpp: number; pph: number; neto: number; lapisan: Lapisan[] };

// Pecah DPP baris per lapisan Pasal 17 mulai dari DPP kumulatif baris sebelumnya.
function pecahLapisan(bruto: number, dppAwal: number): Lapisan[] {
  const out: Lapisan[] = [];
  let sisa = Math.floor(bruto / 2), pos = dppAwal, bawah = 0;
  for (const [atas, tarif] of LAPISAN_PASAL17) {
    if (sisa <= 0) break;
    if (pos < atas) {
      const dpp = Math.min(sisa, atas - Math.max(pos, bawah));
      out.push({ komisi: dpp * 2, dpp, tarif, pph: Math.floor(dpp * tarif) });
      sisa -= dpp; pos += dpp;
    }
    bawah = atas;
  }
  if (out.length) out[out.length - 1].komisi += bruto - out.reduce((s, l) => s + l.komisi, 0);
  return out;
}

export function hitungKomisi(penerima: Penerima, brutos: number[]): { rows: BarisHasil[]; bruto: number; pph: number; neto: number } {
  let dppKum = 0;
  const rows = brutos.map((b): BarisHasil => {
    const bruto = Math.max(0, Math.floor(b || 0));
    const lapisan = penerima === "badan"
      ? (bruto ? [{ komisi: bruto, dpp: bruto, tarif: 0.02, pph: Math.floor(bruto * 0.02) }] : [])
      : pecahLapisan(bruto, dppKum);
    const dpp = lapisan.reduce((s, l) => s + l.dpp, 0), pph = lapisan.reduce((s, l) => s + l.pph, 0);
    if (penerima === "orang") dppKum += dpp;
    return { bruto, dpp, pph, neto: bruto - pph, lapisan };
  });
  const bruto = rows.reduce((s, r) => s + r.bruto, 0), pph = rows.reduce((s, r) => s + r.pph, 0);
  return { rows, bruto, pph, neto: bruto - pph };
}
