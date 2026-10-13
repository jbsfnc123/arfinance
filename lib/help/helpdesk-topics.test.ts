import { describe, expect, it } from "vitest";
import { helpdeskEngine } from "./helpdesk-engine";
import { HELP_TOPICS } from "./topics";
import { MENU_HELP } from "./menu-help";

const eng = helpdeskEngine(HELP_TOPICS);

describe("topik AR Helpdesk", () => {
  it("id unik, related & pages tidak yatim", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const hrefs = new Set(MENU_HELP.map((h) => h.href));
    for (const t of HELP_TOPICS) {
      for (const r of t.related ?? []) expect(ids, `${t.id} → ${r}`).toContain(r);
      for (const p of t.pages ?? []) expect(hrefs.has(p), `${t.id} → ${p}`).toBe(true);
      expect(t.q.length).toBeLessThanOrEqual(60);
    }
  });
  it("setiap halaman punya minimal 2 topik", () => {
    for (const h of MENU_HELP) expect(eng.forPage(h.href).length, h.href).toBeGreaterThanOrEqual(2);
  });
  it("topik halaman: khusus halaman dulu, otomatis terakhir; sub-path ikut halaman induk", () => {
    const m10 = eng.forPage("/mitra10").map((t) => t.id);
    expect(m10[0]).toBe("m10-update");
    expect(m10.at(-1)).toBe("/mitra10#detail");
    expect(eng.forPage("/collection/case")[0].id).toBe("/collection/case#fungsi");
    expect(eng.forPage("/tidak-ada")).toEqual([]);
  });
  it("pencarian teks bebas", () => {
    expect(eng.search("maksud GR", "/collection")[0].topic.id).toBe("gr");
    expect(eng.search("cara update data", "/mitra10")[0].topic.id).toBe("m10-update");
    expect(eng.search("bagaimana cara mengunggah data?", "/")[0].topic.id).toBe("update-data");
    expect(eng.search("apa itu kuitansi", "/rkm")[0].topic.id).toBe("kwitansi");
    expect(eng.search("menu saya terkunci", "/")[0].topic.id).toBe("akses");
    expect(eng.search("apa ya", "/")).toEqual([]);
  });
  it("jawaban langsung hanya bila jelas cocok", () => {
    const sure = (q: string, p = "/") => eng.confident(eng.search(q, p), q)?.id ?? null;
    expect(sure("apa itu GR?")).toBe("gr");
    expect(sure("apa itu LTKP")).toBe("ltkp");
    expect(sure("kenapa omzet cabang surabaya turun bulan ini dibanding tahun lalu")).toBeNull();
  });
});
