// Pembatas unduhan paket dataset (Fase 71). Paket besar (pack_aging/erp/m10, 4–10 MB) yang diminta bersamaan berebut CPU
// database sehingga sebagian kena statement timeout. Maks. `max` unduhan berjalan sekaligus; sisanya antre (FIFO). Timeout
// dari database (SQLSTATE 57014) dicoba ulang dengan jeda.

export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) { active++; start(); }
  };
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => { active--; next(); });
      });
      next();
    });
  };
}

/** Galat batas waktu database (PostgREST mengirim code 57014). */
export const isTimeout = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === "57014" || /statement timeout/i.test(x.message ?? ""));
};

/** Jalankan `fn` (mengembalikan { error }) dan ulangi bila galatnya timeout, dengan jeda `delays` (ms). */
export async function retryOnTimeout<R extends { error: unknown }>(fn: () => Promise<R>, delays: number[] = [1500, 4000],
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<R> {
  let r = await fn();
  for (const d of delays) {
    if (!r.error || !isTimeout(r.error)) return r;
    await sleep(d);
    r = await fn();
  }
  return r;
}
