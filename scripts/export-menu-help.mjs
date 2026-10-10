// Bangkitkan MenuHelp.js untuk Apps Script chatbot AR Helpdesk dari lib/help/menu-help.ts (satu sumber).
//
//   node scripts/export-menu-help.mjs <folder-proyek-gas>
//
// Hasil: <folder>/MenuHelp.js berisi `const MENU_HELP_ = { "<nama halaman>": "<penjelasan>" }`.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MENU_HELP } from "../lib/help/menu-help.ts";

const dir = process.argv[2];
if (!dir) { console.error("Pemakaian: node scripts/export-menu-help.mjs <folder-proyek-gas>"); process.exit(1); }
const map = Object.fromEntries(MENU_HELP.map((h) => [h.menu, h.text.map((t) => `- ${t}`).join("\n")]));
const body = `// DIBANGKITKAN dari ar-workspace lib/help/menu-help.ts (scripts/export-menu-help.mjs) — jangan diedit manual.\n` +
  `// Penjelasan per halaman aplikasi yang tidak lagi tampil di layar; dipakai AR Helpdesk menjawab "maksudnya apa".\n` +
  `const MENU_HELP_ = ${JSON.stringify(map, null, 2)};\n`;
writeFileSync(join(dir, "MenuHelp.js"), body);
console.log(`MenuHelp.js: ${MENU_HELP.length} halaman, ${body.length} karakter`);
