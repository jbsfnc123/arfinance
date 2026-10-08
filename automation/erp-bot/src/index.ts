// Bot ERP (Fase 55–57): Jaspersoft → arsip Google Drive → database AR Workspace. Tiga tugas, berurutan:
//   1. Aging Detail (Excel)              → Snapshot Aging / Daftar Tagihan (aging_commit)
//   2. Send Invoice To Customer (CSV)    → Jadwal Tukar Faktur (schedule_replace; memakai Aging hasil tugas 1)
//   3. Serah Terima Surat Jalan (CSV, 7 hari terakhir) → Monitor Surat Jalan (sj_receipts_apply; insert-only,
//      data lama tidak dihapus/ditimpa; dicocokkan dengan Aging hasil tugas 1)
// Opsi:
//   npm start                            jalankan penuh (dipakai Task Scheduler)
//   npm start -- --dry-run               hanya unduh & baca (tanpa Drive/database)
//   npm start -- --only aging|jadwal|sj  satu tugas saja
//   npm start -- --file <xls>            Aging dari file yang sudah ada (lewati unduh)
//   npm start -- --jadwal-file <csv>     Jadwal dari file yang sudah ada (lewati unduh)
//   npm start -- --sj-file <csv>         Surat Jalan dari file yang sudah ada (lewati unduh)
//   npm start -- --no-drive              lewati arsip Drive
//   npm start -- --force                 kirim walau file identik dengan upload sukses terakhir
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { todayJakarta } from "@/lib/parsers/date";
import { downloadAgingDetail, downloadSendInvoice, downloadSerahTerimaSj, type JasperOptions } from "./jasper";
import { archiveToDrive } from "./drive";
import { commitAging, inspectAging, lastSuccess, readSheets, saveSuccess, sha256, type BotEnv } from "./ingest";
import { commitSchedule, inspectSchedule } from "./schedule";
import { commitSj, inspectSj } from "./sj";
import { initLog, log } from "./log";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });
const DIRS = { downloads: path.join(ROOT, "downloads"), logs: path.join(ROOT, "logs") };
// Status sukses terakhir per tugas (aging memakai nama lama last-success.json agar tidak mengirim ulang).
const STATE = {
  aging: path.join(DIRS.logs, "last-success.json"),
  jadwal: path.join(DIRS.logs, "last-success-jadwal.json"),
  sj: path.join(DIRS.logs, "last-success-sj.json"),
};
const LOCK = path.join(DIRS.logs, "bot.lock");

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
  options: {
    "dry-run": { type: "boolean" }, only: { type: "string" }, file: { type: "string" }, "jadwal-file": { type: "string" }, "sj-file": { type: "string" },
    "no-drive": { type: "boolean" }, force: { type: "boolean" },
  },
});

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} belum diisi di automation/erp-bot/.env`);
  return v;
}
const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const num = (n: number) => n.toLocaleString("id-ID");

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries) throw e;
      log(`   ${label} gagal (percobaan ${i}/${tries}): ${(e as Error).message} — ulang dalam 30 detik`);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}

const jasper = (): JasperOptions => ({
  downloadDir: DIRS.downloads, logDir: DIRS.logs, headless: process.env.BOT_HEADLESS !== "false",
  username: need("JASPER_USERNAME"), password: need("JASPER_PASSWORD"),
});
const botEnv = (): BotEnv => ({ url: need("SUPABASE_URL"), anon: need("SUPABASE_ANON_KEY"), email: need("BOT_EMAIL"), password: need("BOT_PASSWORD") });

// Arsip Drive: gagal arsip hanya peringatan, update data tetap jalan.
async function archive(filePath: string, month: string) {
  if (args["no-drive"]) return;
  try {
    const d = await withRetry("Arsip Drive", () => archiveToDrive(filePath, month, { url: need("ERP_DRIVE_URL"), secret: need("ERP_DRIVE_SECRET") }), 2);
    log(`Drive: tersimpan di folder ${d.folder} · ${d.url}`);
  } catch (e) {
    log(`PERINGATAN arsip Drive gagal: ${(e as Error).message}`);
  }
}

/** true bila file identik dengan upload sukses terakhir tugas ini (dan tidak --force). */
function unchanged(state: string, sha: string) {
  const last = lastSuccess(state);
  if (args.force || last?.sha !== sha) return false;
  log(`Database: file identik dengan upload sukses ${last.at} — dilewati.`);
  return true;
}

async function runAging(today: string) {
  log(`── Aging Detail ──`);
  const filePath = args.file ? path.resolve(args.file) : await withRetry("Unduh Aging Detail", () => downloadAgingDetail(jasper()));
  if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const sheets = readSheets(buf);
  const info = inspectAging(sheets);
  log(`Baca: ${num(info.rows)} baris (sheet ${info.sheet}) · invoice terbaru ${info.month} · total Open Amt ${rp(info.total)}`);
  if (args["dry-run"]) return;
  await archive(filePath, today.slice(0, 7));
  const sha = sha256(buf);
  if (unchanged(STATE.aging, sha)) return;
  const r = await commitAging(filePath, sheets, today, botEnv());
  saveSuccess(STATE.aging, sha);
  log(`Database: ${r.message}`);
}

async function runJadwal(today: string) {
  log(`── Jadwal Tukar Faktur (Send Invoice To Customer) ──`);
  const filePath = args["jadwal-file"] ? path.resolve(args["jadwal-file"]) : await withRetry("Unduh Send Invoice", () => downloadSendInvoice(jasper()));
  if (!filePath) { log("Tidak ada jadwal kirim hari ini (laporan kosong) — jadwal lama dibiarkan."); return; }
  if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const s = inspectSchedule(buf.toString("utf8"), today);
  log(`Baca: ${num(s.rows.length)} invoice · ${s.skipped} baris dilewati · delimiter ${JSON.stringify(s.delimiter)} · tanggal kirim ${s.dates.join(", ") || "-"}`);
  if (s.otherDates.length) log(`PERINGATAN: ada tanggal kirim selain hari ini (${s.otherDates.join(", ")}).`);
  if (!s.rows.length) { log("Tidak ada invoice terbaca — jadwal lama dibiarkan."); return; }
  if (args["dry-run"]) return;
  await archive(filePath, today.slice(0, 7));
  const sha = sha256(buf);
  if (unchanged(STATE.jadwal, sha)) return;
  const n = await commitSchedule(filePath, s.rows, botEnv());
  saveSuccess(STATE.jadwal, sha);
  log(`Database: jadwal kurir diganti — ${num(n)} invoice tersimpan.`);
}

async function runSj(today: string) {
  log(`── Serah Terima Surat Jalan (7 hari terakhir) ──`);
  const filePath = args["sj-file"] ? path.resolve(args["sj-file"]) : await withRetry("Unduh Serah Terima SJ", () => downloadSerahTerimaSj(jasper()));
  if (!filePath) { log("Laporan kosong — tidak ada data serah terima; data lama tetap."); return; }
  if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const parsed = inspectSj(buf.toString("utf8"));
  log(`Baca: ${num(parsed.stats.records)} baris · ${num(parsed.stats.uniqueSj)} SJ unik · ${num(parsed.stats.withReceiver)} baris ber-Receiver · ` +
    `${parsed.bad.length} baris bermasalah · ${parsed.stats.dateIssues} masalah tanggal`);
  if (!parsed.rows.length) { log("Tidak ada baris data — data lama tetap."); return; }
  if (args["dry-run"]) return;
  await archive(filePath, today.slice(0, 7));
  const sha = sha256(buf);
  if (unchanged(STATE.sj, sha)) return;
  const { candidates, result: r } = await commitSj(filePath, parsed, botEnv());
  saveSuccess(STATE.sj, sha);
  if (!r) { log("Database: tidak ada SJ dengan Receiver diakui & Receive Date valid — tidak ada yang dikirim."); return; }
  log(`Database: ${num(candidates)} SJ dikirim → ${num(r.saved)} Receive Date baru disimpan · ${num(r.existing)} sudah ada (tidak ditimpa) · ` +
    `${num(r.notInAging)} tidak ada di Aging · ${num(r.notRecognized)} Receiver tidak diakui · ${num(r.badDate)} tanggal tidak valid`);
}

async function main() {
  initLog(DIRS.logs);
  acquireLock();
  const today = todayJakarta();
  const only = args.only;
  if (only && !["aging", "jadwal", "sj"].includes(only)) throw new Error(`--only harus "aging", "jadwal", atau "sj" (bukan "${only}")`);
  log(`=== Bot ERP · ${today}${only ? ` · hanya ${only}` : ""}${args["dry-run"] ? " · DRY RUN" : ""} ===`);

  // Tugas berurutan: Aging dulu (Jadwal & Surat Jalan memakai Aging terbaru). Gagal satu tugas tidak menghentikan yang lain.
  const tasks = [["Aging", runAging], ["Jadwal", runJadwal], ["SJ", runSj]] as const;
  const failed: string[] = [];
  for (const [name, run] of tasks) {
    if (only && name.toLowerCase() !== only) continue;
    try { await run(today); } catch (e) {
      failed.push(name);
      log(`GAGAL ${name}: ${(e as Error).message}`);
    }
  }
  if (args["dry-run"]) log("DRY RUN selesai — tidak ada yang dikirim ke Drive/database.");
  if (failed.length) throw new Error(`tugas gagal: ${failed.join(", ")}`);
}

main().then(() => { log("Selesai."); releaseLock(); process.exit(0); }).catch((e) => {
  try { log(`GAGAL: ${(e as Error).message ?? e}`); } catch { console.error(e); }
  releaseLock();
  process.exit(1);
});
