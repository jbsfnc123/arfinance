// Build runner AR Bot untuk bot cloud (Fase 93, GitHub Actions repo ARBOT) → dist/cloud/runner.mjs.
// Hanya runner (tanpa UI, server, node.exe, peluncur). puppeteer-core & pdfjs-dist eksternal: di-resolve dari
// automation/ar-bot/node_modules saat jalan. Paket yang dipakai kode lib/ AR Workspace di-resolve dari node_modules ar-bot
// (nodePaths) sehingga runner cloud tidak perlu `npm ci` di root repo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist", "cloud");
fs.rmSync(OUT, { recursive: true, force: true });
const r = await build({
  entryPoints: { runner: path.join(ROOT, "src/runner/main.ts") },
  outdir: OUT,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  tsconfig: path.join(ROOT, "tsconfig.json"),
  external: ["puppeteer-core", "pdfjs-dist"],
  nodePaths: [path.join(ROOT, "node_modules")],
  banner: { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __fu(new URL('.', import.meta.url));" },
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
});
const rootModules = Object.keys(r.metafile.inputs).filter((f) => /^(\.\.\/)+node_modules\//.test(f) && !f.includes("automation/ar-bot/node_modules"));
if (rootModules.length) console.log(`Peringatan: ${rootModules.length} file dari node_modules root ikut dibundel, mis. ${rootModules.slice(0, 3).join(", ")}`);
console.log(`OK → ${path.relative(ROOT, path.join(OUT, "runner.mjs"))} (${(fs.statSync(path.join(OUT, "runner.mjs")).size / 1024).toFixed(0)} KB)`);
