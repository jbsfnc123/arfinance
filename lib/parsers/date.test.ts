import { describe, expect, it } from "vitest";
import { parseDate } from "./date";

describe("parseDate — tahun di depan dengan titik/garis miring (GR Date EDI Mitra10)", () => {
  it("2026.11.12 & 2026/11/12 → ISO; format lama tetap", () => {
    expect(parseDate("2026.11.12")).toBe("2026-11-12");
    expect(parseDate("2026/1/5")).toBe("2026-01-05");
    expect(parseDate("2026-11-12")).toBe("2026-11-12");
    expect(parseDate("12.11.2026")).toBe("2026-11-12");
  });
});
