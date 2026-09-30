import { describe, expect, it } from "vitest";
import { deniedMessage } from "@/components/lock-dot";

describe("pesan menu tanpa akses", () => {
  it("singkat: Tidak memiliki akses <menu>, tanpa ajakan menghubungi Super Admin", () => {
    expect(deniedMessage("Dashboard › Collection")).toBe("Tidak memiliki akses Dashboard › Collection");
    expect(deniedMessage("Beranda")).not.toMatch(/Super Admin/);
  });
});
