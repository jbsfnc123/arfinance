// Bangkitkan MenuHelp.js untuk Apps Script chatbot AR Helpdesk dari lib/help/menu-help.ts & guided-topics.ts (satu sumber).
//
//   node scripts/export-menu-help.mjs <folder-proyek-gas>
//
// Hasil: <folder>/MenuHelp.js berisi
//   const MENU_HELP_ = { "<nama halaman>": "<penjelasan>" }   — penjelasan per halaman
//   const QNA_FAQ_   = { "<href>": "T: …\nJ: …" }              — tanya-jawab template yang sama dengan chat terarah
//   const QNA_STYLE_ = "…"                                      — aturan gaya jawaban (tempel di awal system prompt)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MENU_HELP } from "../lib/help/menu-help.ts";
import { GENERAL_TOPICS, MENU_TOPICS } from "../lib/help/guided-topics.ts";

const dir = process.argv[2];
if (!dir) { console.error("Pemakaian: node scripts/export-menu-help.mjs <folder-proyek-gas>"); process.exit(1); }
const plain = (s) => s.replace(/\*\*/g, "");
const faq = (list) => list.filter((t) => t.a.length).map((t) => `T: ${t.q}\nJ: ${t.a.map(plain).join(" ")}`).join("\n\n");
const map = Object.fromEntries(MENU_HELP.map((h) => [h.menu, h.text.map((t) => `- ${t}`).join("\n")]));
const qna = { umum: faq(GENERAL_TOPICS), ...Object.fromEntries(Object.entries(MENU_TOPICS).map(([href, list]) => [href, faq(list)])) };
const style = [
  "Gaya jawaban AR Helpdesk:",
  "- Singkat, jelas, padat: maksimal 3–5 poin atau 2–4 kalimat pendek. Langsung ke langkah/jawaban.",
  "- Bahasa Indonesia santai, lembut & ramah; sapa user dengan \"Kak\". Emoji maksimal satu, boleh tanpa emoji.",
  "- DILARANG pantun, puisi, lelucon panjang, kutipan, atau basa-basi pembuka/penutup.",
  "- Sebut nama menu & tombol persis seperti di aplikasi (huruf tebal). Jangan mengarang fitur yang tidak ada di panduan.",
  "- Bila tidak tahu, katakan singkat dan sarankan hubungi Admin/Super Admin AR.",
  "- Akhiri dengan satu pertanyaan konfirmasi pendek bila perlu, mis. \"Sudah terjawab, Kak?\".",
].join("\n");
const body = `// DIBANGKITKAN dari ar-workspace lib/help (scripts/export-menu-help.mjs) — jangan diedit manual.\n` +
  `// Penjelasan per halaman & tanya-jawab template; dipakai AR Helpdesk menjawab "maksudnya apa" dengan gaya singkat.\n` +
  `const MENU_HELP_ = ${JSON.stringify(map, null, 2)};\n\n` +
  `const QNA_FAQ_ = ${JSON.stringify(qna, null, 2)};\n\n` +
  `const QNA_STYLE_ = ${JSON.stringify(style)};\n`;
writeFileSync(join(dir, "MenuHelp.js"), body);
console.log(`MenuHelp.js: ${MENU_HELP.length} halaman, ${Object.keys(qna).length} grup tanya-jawab, ${body.length} karakter`);
