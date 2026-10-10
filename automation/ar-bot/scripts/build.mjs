// Build AR Bot portable → dist/ARBot:
//   bin\node.exe                 Node portabel (salinan node yang menjalankan build)
//   app\server.mjs, runner.mjs   bundel esbuild (parser & RPC AR Workspace ikut dibundel)
//   app\ui\                      UI (Vite + React + Tailwind, token AR Workspace)
//   app\node_modules\            puppeteer-core & pdfjs-dist (eksternal)
//   AR Bot.vbs / run-hidden.vbs  peluncur tanpa jendela CMD
//   ARBot.ico                    ikon pintasan
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist", "ARBot");
const APP = path.join(OUT, "app");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const EXTERNAL = ["puppeteer-core", "pdfjs-dist"];
const step = (m) => console.log(`\n▶ ${m}`);

step("Bersihkan dist (folder app saja; node_modules dipakai ulang bila versi sama)");
fs.mkdirSync(APP, { recursive: true });
for (const f of ["server.mjs", "runner.mjs", "ui"]) fs.rmSync(path.join(APP, f), { recursive: true, force: true });

step("UI (vite build)");
execSync("npx vite build --logLevel warn", { cwd: ROOT, stdio: "inherit" });
fs.cpSync(path.join(ROOT, "dist", "ui"), path.join(APP, "ui"), { recursive: true });

step("Bundel server & runner (esbuild)");
await build({
  entryPoints: { server: path.join(ROOT, "src/server/main.ts"), runner: path.join(ROOT, "src/runner/main.ts") },
  outdir: APP,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  tsconfig: path.join(ROOT, "tsconfig.json"),
  external: EXTERNAL,
  // Paket CJS di dalam bundel ESM butuh require/__dirname.
  banner: { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __fu(new URL('.', import.meta.url));" },
  legalComments: "none",
  logLevel: "warning",
});

step("Dependensi eksternal (npm install --omit=dev)");
const deps = Object.fromEntries(EXTERNAL.map((d) => [d, JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", d, "package.json"), "utf8")).version]));
const appPkg = { name: "ar-bot-app", private: true, version: pkg.version, type: "module", dependencies: deps };
const pkgFile = path.join(APP, "package.json");
const same = fs.existsSync(pkgFile) && fs.readFileSync(pkgFile, "utf8") === JSON.stringify(appPkg, null, 2) && fs.existsSync(path.join(APP, "node_modules"));
fs.writeFileSync(pkgFile, JSON.stringify(appPkg, null, 2));
if (!same) execSync("npm install --omit=dev --omit=optional --no-audit --no-fund --loglevel=error", { cwd: APP, stdio: "inherit" });

step("Node portabel");
fs.mkdirSync(path.join(OUT, "bin"), { recursive: true });
const nodeDst = path.join(OUT, "bin", "node.exe");
if (!fs.existsSync(nodeDst) || fs.statSync(nodeDst).size !== fs.statSync(process.execPath).size) fs.copyFileSync(process.execPath, nodeDst);

step("Peluncur");
// Jalankan relatif terhadap lokasi file .vbs (folder bisa dipindah).
fs.writeFileSync(path.join(OUT, "AR Bot.vbs"), [
  'Set sh = CreateObject("WScript.Shell")',
  'Set fs = CreateObject("Scripting.FileSystemObject")',
  "root = fs.GetParentFolderName(WScript.ScriptFullName)",
  "sh.CurrentDirectory = root",
  'sh.Run """" & root & "\\bin\\node.exe"" """ & root & "\\app\\server.mjs""", 0, False',
  "",
].join("\r\n"));
fs.writeFileSync(path.join(OUT, "run-hidden.vbs"), [
  "' Dipakai Task Scheduler: jalankan rangkaian tanpa jendela, tunggu sampai selesai.",
  'Set sh = CreateObject("WScript.Shell")',
  'Set fs = CreateObject("Scripting.FileSystemObject")',
  "root = fs.GetParentFolderName(WScript.ScriptFullName)",
  "sh.CurrentDirectory = root",
  "If WScript.Arguments.Count < 1 Then WScript.Quit 2",
  'code = sh.Run("""" & root & "\\bin\\node.exe"" """ & root & "\\app\\runner.mjs"" --chain """ & WScript.Arguments(0) & """", 0, True)',
  "WScript.Quit code",
  "",
].join("\r\n"));

step("Ikon");
const ico = path.join(OUT, "ARBot.ico");
const svg = fs.readFileSync(path.join(ROOT, "src/ui/public/icon.svg"), "utf8");
try {
  const { default: puppeteer } = await import("puppeteer-core");
  const exe = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage();
  const pngs = [];
  for (const s of [256, 48, 32, 16]) {
    await page.setViewport({ width: s, height: s });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${s}" height="${s}" `)}</body></html>`);
    pngs.push({ s, buf: Buffer.from(await page.screenshot({ omitBackground: true, type: "png" })) });
  }
  await browser.close();
  // ICO berisi PNG (didukung Windows Vista+).
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(({ s, buf }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  fs.writeFileSync(ico, Buffer.concat([head, ...pngs.map((p) => p.buf)]));
} catch (e) {
  console.warn(`  (ikon dilewati: ${e.message})`);
}

const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`\n✔ Build selesai: ${OUT} (${(size(OUT) / 1048576).toFixed(0)} MB)`);
