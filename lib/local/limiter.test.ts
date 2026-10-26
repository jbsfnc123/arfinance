import { describe, expect, it } from "vitest";
import { createLimiter, isTimeout, retryOnTimeout } from "./limiter";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("pembatas unduhan dataset", () => {
  it("maksimal 2 berjalan bersamaan, sisanya antre berurutan", async () => {
    const run = createLimiter(2);
    let active = 0, peak = 0;
    const order: number[] = [];
    const gates: (() => void)[] = [];
    const job = (i: number) => run(() => new Promise<number>((res) => {
      active++; peak = Math.max(peak, active); order.push(i);
      gates[i] = () => { active--; res(i); };
    }));
    const all = [0, 1, 2, 3].map(job);
    await tick();
    expect(order).toEqual([0, 1]);
    gates[1](); await tick();
    expect(order).toEqual([0, 1, 2]);
    gates[0](); gates[2](); await tick();
    gates[3]();
    expect(await Promise.all(all)).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });
  it("galat tidak menghentikan antrean", async () => {
    const run = createLimiter(1);
    const a = run(() => Promise.reject(new Error("x")));
    const b = run(() => Promise.resolve(2));
    await expect(a).rejects.toThrow("x");
    expect(await b).toBe(2);
  });
  it("timeout dicoba ulang, galat lain tidak", async () => {
    const sleep = async () => {};
    let n = 0;
    const r = await retryOnTimeout(async () => (++n < 3 ? { error: { code: "57014", message: "canceling statement due to statement timeout" } } : { error: null, data: 1 }), [1, 1], sleep);
    expect(n).toBe(3);
    expect(r.error).toBeNull();
    let m = 0;
    await retryOnTimeout(async () => { m++; return { error: { code: "42501", message: "Akses ditolak" } }; }, [1, 1], sleep);
    expect(m).toBe(1);
    expect(isTimeout({ message: "canceling statement due to statement timeout" })).toBe(true);
    expect(isTimeout(null)).toBe(false);
  });
});
