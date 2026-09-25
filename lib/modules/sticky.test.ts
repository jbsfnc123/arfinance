import { describe, expect, it } from "vitest";
import { sortNotes } from "./sticky";

const n = (id: number, created_at: string, pinned_at: string | null = null) => ({ id, created_at, pinned_at });

describe("urutan sticky notes", () => {
  it("di-pin di atas, pin terbaru paling atas, sisanya per waktu dibuat", () => {
    const list = [
      n(1, "2026-09-01"), n(2, "2026-09-02", "2026-09-10"), n(3, "2026-09-03"),
      n(4, "2026-09-04", "2026-09-12"), n(5, "2026-08-30"),
    ];
    expect(sortNotes(list).map((x) => x.id)).toEqual([4, 2, 5, 1, 3]);
  });
});
