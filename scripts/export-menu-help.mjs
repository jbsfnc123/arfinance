// Bangkitkan file Apps Script chatbot AR Helpdesk dari lib/help (satu sumber).
//
//   node scripts/export-menu-help.mjs <folder-proyek-gas>
//
// Hasil:
// - <folder>/MenuHelp.js: `const MENU_HELP_ = { "<nama halaman>": "<penjelasan>" }` (konteks AI).
// - <folder>/Topics.js: `const HELPDESK_TOPICS_ = [...]` + `function helpdeskEngine(topics)` (mode terpandu tanpa AI; kode
//   mesin disalin dari lib/help/helpdesk-engine.ts agar pencocokan identik dengan yang diuji). Dipakai server (konteks AI)
//   dan disisipkan ke halaman chat oleh doGet.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { MENU_HELP } from "../lib/help/menu-help.ts";
import { HAND_TOPICS, pageTopics } from "../lib/help/helpdesk-topics.ts";
import { helpdeskEngine } from "../lib/help/helpdesk-engine.ts";

const dir = process.argv[2];
if (!dir) { console.error("Pemakaian: node scripts/export-menu-help.mjs <folder-proyek-gas>"); process.exit(1); }
const map = Object.fromEntries(MENU_HELP.map((h) => [h.menu, h.text.map((t) => `- ${t}`).join("\n")]));
const body = `// DIBANGKITKAN dari ar-workspace lib/help/menu-help.ts (scripts/export-menu-help.mjs) — jangan diedit manual.\n` +
  `// Penjelasan per halaman aplikasi yang tidak lagi tampil di layar; dipakai AR Helpdesk menjawab "maksudnya apa".\n` +
  `const MENU_HELP_ = ${JSON.stringify(map, null, 2)};\n`;
writeFileSync(join(dir, "MenuHelp.js"), body);
console.log(`MenuHelp.js: ${MENU_HELP.length} halaman, ${body.length} karakter`);

// Node menghapus anotasi tipe menjadi spasi, jadi toString() sudah JS polos; spasi berlebih dirapikan.
const topics = [...HAND_TOPICS, ...pageTopics(MENU_HELP)];
const engine = helpdeskEngine.toString().replace(/[ \t]+$/gm, "").replace(/(\S)[ \t]{2,}(?=\S)/g, "$1 ");
const topicsJs = `// DIBANGKITKAN dari ar-workspace lib/help/helpdesk-topics.ts & helpdesk-engine.ts (scripts/export-menu-help.mjs) — jangan diedit manual.\n` +
  `// Mode terpandu AR Helpdesk: topik pilihan yang dijawab tanpa AI.\n` +
  `const HELPDESK_TOPICS_ = ${JSON.stringify(topics)};\n\n${engine}\n`;

// Uji hasil di sandbox: kode harus jalan tanpa TypeScript dan hasilnya sama dengan mesin asli.
const ctx = vm.createContext({});
vm.runInContext(`${topicsJs}\nvar __e = helpdeskEngine(HELPDESK_TOPICS_);`, ctx);
const ref = helpdeskEngine(topics);
for (const [q, p] of [["maksud GR", "/collection"], ["cara update data", "/mitra10"], ["apa itu ltkp", "/"]]) {
  const a = vm.runInContext(`JSON.stringify(__e.search(${JSON.stringify(q)}, ${JSON.stringify(p)}).map(h => h.topic.id))`, ctx);
  if (a !== JSON.stringify(ref.search(q, p).map((h) => h.topic.id))) throw new Error(`Topics.js berbeda untuk "${q}"`);
}
writeFileSync(join(dir, "Topics.js"), topicsJs);
console.log(`Topics.js: ${topics.length} topik, ${topicsJs.length} karakter`);
