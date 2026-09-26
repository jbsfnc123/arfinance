// Supabase REST mengembalikan maksimal 1.000 baris per permintaan (max_rows), berapa pun .limit() yang diminta.
// fetchAll mengambil halaman demi halaman (.range) sampai habis, agar daftar tidak terpotong diam-diam.

export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** `page(from, to)` harus membuat query BARU tiap panggilan dan memakai urutan yang stabil (mis. order id). */
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>, opts: { size?: number; max?: number } = {}) {
  const { size = PAGE_SIZE, max = 200_000 } = opts;
  const data: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data: rows, error } = await page(from, from + size - 1);
    if (error) return { data, error };
    data.push(...(rows ?? []));
    if (!rows || rows.length < size) break;
  }
  return { data, error: null };
}
