// Runner AR Bot: menjalankan satu run (daftar job) di proses sendiri — berurutan, atau paralel bila `parallel`.
//   node runner.mjs                 permintaan JSON lewat stdin (dari server / jendela aplikasi)
//   node runner.mjs --chain <id>    rangkaian terjadwal (Task Scheduler), tanpa jendela
// Event & log ditulis ke data\runs\<runId>.jsonl (dibaca server untuk tampilan langsung); ringkasan ke history.jsonl.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { jobInfo, paramsFor } from "~/shared/catalog";
import type { Config, JobResult, JobSpec, RunRecord, RunRequest, RunStatus } from "~/shared/types";
import { acquireLock, releaseLock } from "~/core/lock";
import { DATA_DIR, ensureDirs, P } from "~/core/paths";
import { appendHistory, loadConfig, loadSecrets, trimHistory } from "~/core/store";
import { JOB_FNS } from "~/jobs";
import { jasperOf, resetJasper } from "~/jobs/jasper/jobs";
import { CancelledError, delay, RunContext } from "./ctx";

const { values: args } = parseArgs({ options: { chain: { type: "string" } }, strict: false });

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const newRunId = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
};

/** Hapus file unduhan, screenshot, dan log run yang lebih tua dari masa simpan. */
function cleanup(days: number) {
  const limit = Date.now() - Math.max(1, days) * 86_400_000;
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      try { if (fs.statSync(f).mtimeMs < limit) fs.rmSync(f); } catch { /* sedang dipakai */ }
    }
  };
  for (const d of [P.downloads, P.shots, P.runs]) { try { walk(d); } catch { /* tidak ada */ } }
}

/** Galat yang tidak akan berubah bila diulang (kredensial / pengaturan / isi file). */
const permanent = (msg: string) => /belum diisi|belum lengkap|belum tersedia|akun gagal|tidak ada akun|login .*gagal|tidak ditemukan di PC|bukan laporan|kosong \(0 baris\)|maksimal/i.test(msg);

/**
 * Jalankan satu job dengan retry. Run berurutan: galat → browser dimulai ulang (job berikutnya tidak mewarisi halaman
 * macet). Run paralel: galat → hanya halaman/context job ini yang ditutup; job lain tetap jalan.
 */
async function runJob(ctx: RunContext, config: Config, spec: JobSpec, res: JobResult, parallel: boolean) {
  const jctx = ctx.forJob(spec.id, parallel);
  if (ctx.isCancelled) { res.status = "cancelled"; return; }
  const info = jobInfo(spec.id);
  const params = paramsFor(config, spec.id, spec.params);
  res.status = "running";
  res.startedAt = new Date().toISOString();
  ctx.emit({ t: "job", at: res.startedAt, result: { ...res } });
  jctx.info(`── ${info.label} ──`);
  for (let attempt = 1; ; attempt++) {
    try {
      const out = await JOB_FNS[spec.id](jctx, params);
      const status = out.status ?? "ok";
      Object.assign(res, out, { status, error: undefined });
      jctx.log(status === "ok" ? "ok" : "info", `${info.label}: ${status === "ok" ? "selesai" : "dilewati"}${res.summary ? ` — ${res.summary}` : ""}`);
      break;
    } catch (e) {
      const js = spec.id.startsWith("jasper.") ? jasperOf(jctx) : null;
      const cancelled = e instanceof CancelledError || ctx.isCancelled;
      const msg = cancelled ? "Dibatalkan pengguna." : `${js ? `${js.stage}: ` : ""}${(e as Error).message.split("\n")[0]}`;
      if (!cancelled) res.shot = await jctx.diagnose(js?.currentPage ?? null, spec.id);
      if (parallel) await jctx.closeJob(); else await ctx.closeBrowser();
      if (js) resetJasper(jctx);
      if (cancelled) { res.status = "cancelled"; res.error = msg; jctx.warn(msg); break; }
      // Upload Faktur tidak diulang otomatis: aksi tulis di situs luar.
      if (attempt < 3 && !permanent(msg) && spec.id !== "edi.upload-faktur") {
        jctx.warn(`${info.label} gagal (percobaan ${attempt}/3): ${msg} — ulang dalam 20 detik`);
        await delay(20_000);
        if (!ctx.isCancelled) continue;
      }
      res.status = ctx.isCancelled ? "cancelled" : "failed";
      res.error = msg;
      jctx.log("error", `GAGAL ${info.label}: ${msg}`);
      break;
    }
  }
  if (parallel) await jctx.closeJob();
  res.finishedAt = new Date().toISOString();
  ctx.emit({ t: "job", at: res.finishedAt, result: { ...res } });
}

async function main(): Promise<RunStatus> {
  ensureDirs();
  const config = loadConfig();
  cleanup(config.retentionDays);
  let request: RunRequest;
  if (typeof args.chain === "string") {
    const chain = config.chains.find((c) => c.id === args.chain);
    if (!chain) throw new Error(`Rangkaian "${args.chain}" tidak ada di pengaturan.`);
    request = { jobs: chain.jobs, trigger: "schedule", chainId: chain.id, chainName: chain.name };
  } else {
    request = JSON.parse(await readStdin()) as RunRequest;
  }
  if (!request.jobs?.length) throw new Error("Tidak ada job yang dipilih.");
  const parallel = !!request.parallel && request.jobs.length > 1;

  const runId = newRunId();
  const startedAt = new Date().toISOString();
  const record: RunRecord = {
    runId, trigger: request.trigger, chainName: request.chainName, dryRun: request.dryRun, parallel: parallel || undefined, startedAt, status: "running",
    jobs: request.jobs.map((j) => ({ id: j.id, status: "pending" })),
  };
  try {
    acquireLock({ runId, pid: process.pid, trigger: request.trigger, startedAt, jobs: request.jobs, chainName: request.chainName });
  } catch (e) {
    const msg = (e as Error).message;
    appendHistory({ ...record, status: "failed", finishedAt: new Date().toISOString(), jobs: record.jobs.map((j) => ({ ...j, status: "cancelled", error: msg })) });
    throw e;
  }

  const ctx = new RunContext(runId, config, loadSecrets(), { dryRun: !!request.dryRun, force: !!request.force });
  const finish = (status: RunStatus) => {
    record.status = status;
    record.finishedAt = new Date().toISOString();
    ctx.emit({ t: "end", at: record.finishedAt, status });
    appendHistory(record);
    trimHistory();
  };
  // Dihentikan paksa (Task Scheduler / tutup proses): tetap catat riwayat & lepas kunci.
  const onSignal = () => {
    if (record.status === "running") finish("cancelled");
    releaseLock(runId);
    process.exit(1);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    ctx.emit({ t: "start", at: startedAt, runId, request, pid: process.pid });
    ctx.info(`AR Bot · ${request.chainName ?? "Jalankan manual"} · ${request.jobs.length} job${parallel ? " · PARALEL" : ""}${request.dryRun ? " · UJI COBA" : ""} · data ${DATA_DIR}`);
    if (parallel) {
      await Promise.all(request.jobs.map((spec, i) => runJob(ctx, config, spec, record.jobs[i], true)));
    } else {
      for (let i = 0; i < request.jobs.length; i++) await runJob(ctx, config, request.jobs[i], record.jobs[i], false);
    }
    const st = record.jobs.map((j) => j.status);
    const status: RunStatus = st.includes("cancelled") ? "cancelled"
      : st.every((s) => s === "failed") ? "failed" : st.includes("failed") ? "partial" : "ok";
    ctx.log(status === "ok" ? "ok" : "warn", status === "ok" ? "Semua job selesai." : `Selesai dengan status: ${status}.`);
    finish(status);
    return status;
  } finally {
    await ctx.dispose();
    releaseLock(runId);
  }
}

main().then((s) => process.exit(s === "ok" ? 0 : 1)).catch((e) => {
  console.error(`AR Bot runner: ${(e as Error).message}`);
  process.exit(2);
});
