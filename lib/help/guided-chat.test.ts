import { describe, expect, it } from "vitest";
import { MENU_REGISTRY } from "@/lib/menu";
import { MENU_HELP } from "./menu-help";
import { findTopic, followUps, GENERAL_TOPICS, menuHref, MENU_TOPICS, searchTopics, topicsFor } from "./guided-chat";

const all = [...GENERAL_TOPICS, ...Object.values(MENU_TOPICS).flat()];

describe("chat terarah AR Helpdesk", () => {
  it("setiap menu internal punya daftar pertanyaan", () => {
    for (const g of MENU_REGISTRY) for (const m of g.children) {
      if (m.external) continue;
      expect(topicsFor(m.href).length, m.href).toBeGreaterThan(0);
    }
  });
  it("setiap menu internal punya penjelasan di MENU_HELP", () => {
    const hrefs = new Set(MENU_HELP.map((h) => h.href));
    for (const g of MENU_REGISTRY) for (const m of g.children) if (!m.external) expect(hrefs.has(m.href), m.href).toBe(true);
  });
  it("id unik, rujukan next & go valid", () => {
    const ids = all.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const hrefs = new Set(MENU_REGISTRY.flatMap((g) => g.children.map((c) => c.href)));
    for (const t of all) {
      for (const n of t.next ?? []) expect(ids, `${t.id} → ${n}`).toContain(n);
      if (t.go) expect(hrefs.has(t.go), `${t.id} go ${t.go}`).toBe(true);
    }
  });
  it("jawaban singkat & padat, tanpa pantun", () => {
    for (const t of all) {
      if (t.id === "umum.menu") continue;
      expect(t.a.length, t.id).toBeGreaterThan(0);
      expect(t.a.length, t.id).toBeLessThanOrEqual(5);
      for (const line of t.a) expect(line.length, `${t.id}: ${line}`).toBeLessThanOrEqual(200);
      expect(t.a.join(" ").toLowerCase()).not.toContain("pantun");
    }
  });
  it("cocokkan sub-halaman ke menu terdekat", () => {
    expect(menuHref("/collection/case")).toBe("/collection/case");
    expect(menuHref("/collection")).toBe("/collection");
    expect(menuHref("/")).toBe("/");
    expect(topicsFor("/collection").some((t) => t.id === "umum.menu")).toBe(true);
  });
  it("pencarian teks bebas menemukan topik relevan", () => {
    expect(searchTopics("cara upload aging terbaru", "/collection").map((t) => t.id)).toContain("umum.upload");
    expect(searchTopics("jadwal bayar", "/collection")[0].id).toBe("col.status");
    expect(searchTopics("lupa pin", "/")[0].id).toBe("umum.pin");
    expect(searchTopics("xyzzy qwerty", "/")).toEqual([]);
    expect(searchTopics("apa ya kak", "/")).toEqual([]);
  });
  it("pertanyaan lanjutan mengutamakan next dan tidak mengulang topik", () => {
    const t = findTopic("umum.upload", "/collection")!;
    const f = followUps(t, "/collection");
    expect(f[0].id).toBe("umum.kosong");
    expect(f.map((x) => x.id)).not.toContain("umum.upload");
  });
  it("fungsi menu diambil dari MENU_HELP halaman aktif", () => {
    expect(findTopic("umum.menu", "/mitra10")!.a[0]).toBe(MENU_HELP.find((h) => h.href === "/mitra10")!.text[0]);
  });
});
