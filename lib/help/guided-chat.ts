import { menuLabel } from "@/lib/chat-context";
import { MENU_HELP } from "@/lib/help/menu-help";
import { GENERAL_TOPICS, MENU_TOPICS, type Topic } from "@/lib/help/guided-topics";

export { ACTION, CHAT_TEXT, GENERAL_TOPICS, MENU_TOPICS, type Topic } from "@/lib/help/guided-topics";

// Chat terarah AR Helpdesk (Fase 67): pertanyaan & jawaban siap pakai per menu, dijawab langsung di browser tanpa
// Agent AI. Gaya jawaban: singkat, jelas, padat, ramah santai ("Kak"), tanpa pantun. Teks hanya dirender sebagai
// teks biasa (React), **tebal** dibuat elemen <strong>.
//
// Alur sesi: Sapaan + daftar pertanyaan menu yang dibuka → Jawaban + pertanyaan lanjutan → Konfirmasi (sudah jelas /
// masih bingung) → Penutup. Pindah menu saat chat terbuka = sesi baru untuk menu itu.

// ── Mesin ────────────────────────────────────────────────────────────────────────────────────────────────────────
const ALL_TOPICS = new Map<string, Topic>();
for (const t of GENERAL_TOPICS) ALL_TOPICS.set(t.id, t);
for (const list of Object.values(MENU_TOPICS)) for (const t of list) ALL_TOPICS.set(t.id, t);

/** href menu paling cocok untuk path (prefix terpanjang). */
export function menuHref(path: string): string {
  let best = "";
  for (const href of Object.keys(MENU_TOPICS)) {
    if ((path === href || (href !== "/" && path.startsWith(href + "/"))) && href.length > best.length) best = href;
  }
  return best || (path === "/" ? "/" : "");
}

/** Penjelasan fungsi menu dari MENU_HELP (maks. 4 poin pertama agar tetap singkat). */
function menuOverview(path: string): Topic | null {
  const href = menuHref(path) || path;
  const help = MENU_HELP.find((h) => h.href === href);
  if (!help) return null;
  return { id: "umum.menu", q: GENERAL_TOPICS.find((t) => t.id === "umum.menu")!.q, a: help.text.slice(0, 4) };
}

/** Pilihan pertanyaan untuk halaman aktif: topik menu + "Fungsi menu ini apa?" (bila ada penjelasan). */
export function topicsFor(path: string): Topic[] {
  const own = MENU_TOPICS[menuHref(path)] ?? [];
  const overview = menuOverview(path);
  return overview ? [...own, overview] : own;
}

export function generalTopics(): Topic[] {
  return GENERAL_TOPICS.filter((t) => t.id !== "umum.menu");
}

export function findTopic(id: string, path: string): Topic | null {
  if (id === "umum.menu") return menuOverview(path);
  return ALL_TOPICS.get(id) ?? null;
}

export function menuName(path: string) {
  return menuLabel(path);
}

const STOP = new Set(["yang", "di", "ke", "dari", "dan", "atau", "ini", "itu", "apa", "cara", "gimana", "bagaimana", "kenapa",
  "mengapa", "kak", "ka", "kakak", "min", "tolong", "mau", "ingin", "bisa", "tidak", "gak", "ga", "nggak", "saya", "aku",
  "untuk", "dengan", "ada", "pada", "kok", "sih", "dong", "ya", "nya", "the", "menu"]);

export function tokens(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Cari topik paling relevan untuk teks bebas. Topik menu aktif sedikit diutamakan. Maks `limit` hasil. */
export function searchTopics(query: string, path: string, limit = 3): Topic[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  const own = new Set((MENU_TOPICS[menuHref(path)] ?? []).map((t) => t.id));
  const scored: { t: Topic; s: number }[] = [];
  for (const t of ALL_TOPICS.values()) {
    if (t.id === "umum.menu") continue;
    const title = tokens(t.q);
    const body = tokens(`${t.k ?? ""} ${t.a.join(" ")}`);
    let s = 0;
    for (const w of words) {
      if (title.some((x) => x === w)) s += 3;
      else if (title.some((x) => x.startsWith(w) || w.startsWith(x))) s += 2;
      if (body.some((x) => x === w || (w.length >= 4 && x.startsWith(w)))) s += 1;
    }
    if (s > 0) scored.push({ t, s: s + (own.has(t.id) ? 1 : 0) });
  }
  scored.sort((a, b) => b.s - a.s);
  const top = scored[0]?.s ?? 0;
  return scored.filter((x) => x.s >= Math.max(2, top / 2)).slice(0, limit).map((x) => x.t);
}

/** Pertanyaan lanjutan setelah jawaban: `next` topik, sisanya topik lain di menu yang sama. */
export function followUps(topic: Topic, path: string, limit = 3): Topic[] {
  const out: Topic[] = [];
  const seen = new Set([topic.id]);
  const push = (t: Topic | null | undefined) => { if (t && !seen.has(t.id) && out.length < limit) { seen.add(t.id); out.push(t); } };
  for (const id of topic.next ?? []) push(findTopic(id, path));
  for (const t of topicsFor(path)) push(t);
  return out;
}
