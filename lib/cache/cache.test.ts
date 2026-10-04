import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedQuery, MAX_ENTRY } from "./cached-query";
import { idbClear } from "./idb";
import { makeToken } from "./versions";

// Supabase tiruan: versi dataset & user bisa diganti per tes.
function fakeSupabase(versions: Record<string, string>, user = "u1") {
  const q = { select: () => Promise.resolve({ data: Object.entries(versions).map(([key, updated_at]) => ({ key, updated_at })), error: null }) };
  const ch = { on: () => ch, subscribe: () => ch };
  return {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: user } } } }) },
    from: () => q,
    channel: () => ch,
  } as never;
}

const later = () => new Promise((r) => setTimeout(r, 2100)); // lewati memo token 2 detik

describe("cache bertoken versi", () => {
  beforeEach(async () => { await idbClear(); });

  it("token dari dataset terkait", () => {
    expect(makeToken(new Map([["aging", "t1"], ["erp", "t2"]]), ["aging", "targets"])).toBe("aging@t1|targets@-");
  });

  it("token sama → dari cache; token berubah → muat ulang sekali; per user terpisah", async () => {
    const load = vi.fn(async () => ({ rows: [1, 2, 3] }));
    const v = { aging: "t1" };
    const a = await cachedQuery(fakeSupabase(v), { key: "coll", deps: ["aging"], load });
    const b = await cachedQuery(fakeSupabase(v), { key: "coll", deps: ["aging"], load });
    expect([a.fromCache, b.fromCache, load.mock.calls.length]).toEqual([false, true, 1]);

    const c = await cachedQuery(fakeSupabase(v, "u2"), { key: "coll", deps: ["aging"], load });
    expect(c.fromCache).toBe(false);

    await later();
    const d = await cachedQuery(fakeSupabase({ aging: "t2" }), { key: "coll", deps: ["aging"], load });
    expect([d.fromCache, load.mock.calls.length]).toEqual([false, 3]);

    const e = await cachedQuery(fakeSupabase({ aging: "t2" }), { key: "coll", deps: ["aging"], load, force: true });
    expect([e.fromCache, load.mock.calls.length]).toEqual([false, 4]);
  }, 10000);

  it("entri terlalu besar tidak disimpan", async () => {
    const big = "x".repeat(MAX_ENTRY + 10);
    const load = vi.fn(async () => big);
    await later();
    await cachedQuery(fakeSupabase({ aging: "t9" }), { key: "big", deps: ["aging"], load });
    const again = await cachedQuery(fakeSupabase({ aging: "t9" }), { key: "big", deps: ["aging"], load });
    expect(again.fromCache).toBe(false);
  }, 10000);

  it("periode Closed memakai cache saat Aging Oktober berubah, lalu menyegarkan saat versi closing berubah", async () => {
    const v = { aging: "a1", collection_closing: "c1" };
    const load = vi.fn(async () => ({ status: "closed" as const, revision: 1 }));
    const depsFor = (data: { status: "closed" | "open" }) => data.status === "closed" ? ["collection_closing"] as const : ["aging", "collection_closing"] as const;
    const opt = { key: "collection-period:2026-09", deps: ["aging", "collection_closing"] as const, depsFor, load };
    await cachedQuery(fakeSupabase(v), opt);
    await later();
    v.aging = "a2";
    expect((await cachedQuery(fakeSupabase(v), opt)).fromCache).toBe(true);
    await later();
    v.collection_closing = "c2";
    expect((await cachedQuery(fakeSupabase(v), opt)).fromCache).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  }, 12000);

  it("dua pemasangan dashboard serentak hanya memuat satu laporan", async () => {
    const load = vi.fn(async () => ({ status: "open" }));
    const opt = { key: "collection-period:2026-10", deps: ["aging"] as const, load };
    await Promise.all([cachedQuery(fakeSupabase({aging:"v1"}), opt),cachedQuery(fakeSupabase({aging:"v1"}), opt)]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
