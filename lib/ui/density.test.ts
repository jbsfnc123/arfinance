import { describe, expect, it } from "vitest";
import { rowHeight } from "./density";

describe("tinggi baris per kepadatan", () => {
  it("Nyaman = dasar; Padat lebih rapat", () => {
    expect(rowHeight("comfortable", 34)).toBe(34);
    expect(rowHeight("compact", 34)).toBe(28);
    expect(rowHeight("comfortable", 40)).toBe(40);
    expect(rowHeight("compact", 40)).toBe(32);
  });
});
