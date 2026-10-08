// Bot ERP (Fase 55): Jaspersoft "Aging Detail" → arsip Google Drive → database AR Workspace.
//   npm start                     jalankan penuh (dipakai Task Scheduler)
//   npm start -- --dry-run        hanya unduh & baca (tanpa Drive/database)
//   npm start -- --file <path>    pakai file yang sudah ada (lewati unduh)
//   npm start -- --no-drive       lewati arsip Drive
//   npm start -- --force          kirim walau file identik dengan upload sukses terakhir
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { todayJakarta } from "@/lib/parsers/date";
import { downloadAgingDetail } from "./jasper";
import { archiveToDrive } from "./drive";
import { commitAging, inspectAging, lastSuccess, readSheets, saveSuccess, sha256 } from "./ingest";
import { initLog, log } from "./log";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });
const DIRS = { downloads: path.join(ROOT, "downloads"), logs: path.join(ROOT, "logs") };
const STATE = path.join(ROOT, "logs", "last-success.json");
const LOCK = path.join(ROOT, "logs", "bot.lock");

// Satu proses saja (Task Scheduler + run manual tidak boleh login Jaspersoft bersamaan). Lock basi (PID mati atau
// > 60 menit) diabaikan.
function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  try {
    const held = JSON.parse(fs.readFileSync(LOCK, "utf8")) as { pid: number; at: number };
    let alive = true;
    try { process.kill(held.pid, 0); } catch { alive = false; }
    if (alive && held.pid !== process.pid && Date.now() - held.at < 60 * 60_000) {
      throw new Error(`Bot lain masih berjalan (PID ${held.pid}, mulai ${new Date(held.at).toLocaleTimeString("id-ID")}).`);
    }
  } catch (e) {
    if ((e as Error).message.startsWith("Bot lain")) throw e;
  }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now() }));
}
function releaseLock() {
  try {
    if ((JSON.parse(fs.readFileSync(LOCK, "utf8")) as { pid: number }).pid === process.pid) fs.rmSync(LOCK);
  } catch { /* tidak ada lock */ }
}

const { values: args } = parseArgs({
  options: { "dry-run": { type: "boolean" }, file: { type: "string" }, "no-drive": { type: "boolean" }, force: { type: "boolean" } },
});

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} belum diisi di automation/erp-bot/.env`);
  return v;
}
const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries) throw e;
      log(`   ${label} gagal (percobaan ${i}/${tries}): ${(e as Error).message} — ulang dalam 30 detik`);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}

async function main() {
  initLog(DIRS.logs);
  acquireLock();
  const reportDate = todayJakarta();
  log(`=== Bot ERP · Aging Detail · ${reportDate}${args["dry-run"] ? " · DRY RUN" : ""} ===`);

  // 1. Unduh
  const filePath = args.file ? path.resolve(args.file) : await withRetry("Unduh Jaspersoft", () => downloadAgingDetail({
    downloadDir: DIRS.downloads, logDir: DIRS.logs, headless: process.env.BOT_HEADLESS !== "false",
    username: need("JASPER_USERNAME"), password: need("JASPER_PASSWORD"),
  }));
  if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${filePath}`);
  const buf = fs.readFileSync(filePath);

  // 2. Baca & periksa (sebelum apa pun dikirim)
  const sheets = readSheets(buf);
  const info = inspectAging(sheets);
  log(`Baca: ${info.rows.toLocaleString("id-ID")} baris (sheet ${info.sheet}) · invoice terbaru ${info.month} · total Open Amt ${rp(info.total)}`);
  if (args["dry-run"]) { log("DRY RUN selesai — tidak ada yang dikirim ke Drive/database."); return; }

  // 3. Arsip Drive (gagal arsip tidak menghentikan update data)
  if (!args["no-drive"]) {
    try {
      const d = await withRetry("Arsip Drive", () => archiveToDrive(filePath, reportDate.slice(0, 7), { url: need("ERP_DRIVE_URL"), secret: need("ERP_DRIVE_SECRET") }), 2);
      log(`Drive: tersimpan di folder ${d.folder} · ${d.url}`);
    } catch (e) {
      log(`PERINGATAN arsip Drive gagal: ${(e as Error).message}`);
    }
  }

  // 4. Database
  const sha = sha256(buf);
  const last = lastSuccess(STATE);
  if (!args.force && last?.sha === sha) {
    log(`Database: file identik dengan upload sukses ${last.at} — dilewati.`);
    return;
  }
  const r = await commitAging(filePath, sheets, reportDate, {
    url: need("SUPABASE_URL"), anon: need("SUPABASE_ANON_KEY"), email: need("BOT_EMAIL"), password: need("BOT_PASSWORD"),
  });
  saveSuccess(STATE, sha);
  log(`Database: ${r.message}`);
}

main().then(() => { log("Selesai."); releaseLock(); process.exit(0); }).catch((e) => {
  try { log(`GAGAL: ${(e as Error).message ?? e}`); } catch { console.error(e); }
  releaseLock();
  process.exit(1);
});
