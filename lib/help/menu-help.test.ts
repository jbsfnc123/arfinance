import { describe, expect, it } from "vitest";
import { menuLabel } from "@/lib/chat-context";
import { MENU_HELP } from "./menu-help";

describe("penjelasan menu AR Helpdesk", () => {
  it("kunci menu sama dengan nama halaman yang dikirim ke chatbot", () => {
    for (const h of MENU_HELP) expect(menuLabel(h.href), h.href).toBe(h.menu);
  });
  it("setiap halaman yang keterangannya dihapus punya penjelasan", () => {
    const hrefs = new Set(MENU_HELP.map((h) => h.href));
    for (const href of ["/billing/email-customer", "/monitor-surat-jalan", "/pengaturan/upload", "/dashboard/collection", "/akun",
      "/database", "/mitra10", "/rkm", "/mutasi-bank", "/tukar-faktur/upload", "/tools/pdf-editor", "/cek-harga"]) {
      expect(hrefs.has(href), href).toBe(true);
    }
    expect(MENU_HELP.every((h) => h.text.length > 0)).toBe(true);
  });
});
