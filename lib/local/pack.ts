// Paket data kolumnar dari RPC pack_* : { n, cols: { kolom: [nilai per baris] } }.
// Nama kolom tidak diulang per baris → jauh lebih kecil daripada JSON per-objek.

export type Packed = { n: number; cols: Record<string, unknown[]> };

export function unpack<T = Record<string, unknown>>(p: Packed | null | undefined): T[] {
  if (!p || !p.n) return [];
  const keys = Object.keys(p.cols);
  const out = new Array<T>(p.n);
  for (let i = 0; i < p.n; i++) {
    const o: Record<string, unknown> = {};
    for (const k of keys) o[k] = p.cols[k][i];
    out[i] = o as T;
  }
  return out;
}

export function pack(rows: Record<string, unknown>[], keys?: string[]): Packed {
  const ks = keys ?? (rows[0] ? Object.keys(rows[0]) : []);
  const cols: Record<string, unknown[]> = {};
  for (const k of ks) cols[k] = rows.map((r) => r[k] ?? null);
  return { n: rows.length, cols };
}

// Angka dari numeric Postgres (bisa berupa string/number/null) → number.
export const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
