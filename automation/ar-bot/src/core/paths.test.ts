import path from "node:path";
import { describe, expect, it } from "vitest";
import { menuFolder, uniqueName } from "./paths";

describe("folder unduhan user", () => {
  it("nama unik bila bentrok", () => {
    const have = new Set(["D/a.xlsx", "D/a (2).xlsx"].map((f) => f.replace("/", path.sep)));
    expect(uniqueName("D", "b.xlsx", (f) => have.has(f))).toBe("b.xlsx");
    expect(uniqueName("D", "a.xlsx", (f) => have.has(f))).toBe("a (3).xlsx");
  });
  it("subfolder menu tanpa karakter terlarang", () => {
    expect(menuFolder("Invoice & Payment Date Comparison")).toBe("Invoice & Payment Date Comparison");
    expect(menuFolder("A/B: C?")).toBe("A B C");
  });
});
