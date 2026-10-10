import { describe, expect, it } from "vitest";
import { protect, unprotect } from "./dpapi";

describe.runIf(process.platform === "win32")("DPAPI", () => {
  it("enkripsi bolak-balik & teks sandi tidak terlihat", () => {
    const plain = JSON.stringify({ jasperPassword: "Rahasia#123 ünïcode" });
    const blob = protect(plain);
    expect(blob).not.toContain("Rahasia");
    expect(Buffer.from(blob, "base64").toString("latin1")).not.toContain("Rahasia");
    expect(unprotect(blob)).toBe(plain);
  }, 60_000);
});
