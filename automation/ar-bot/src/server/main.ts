// Server lokal AR Bot (127.0.0.1): UI statis + API + SSE. Satu instance; membuka jendela Edge --app dan berhenti sendiri
// setelah jendela ditutup (bot yang sedang berjalan tetap lanjut di prosesnya sendiri).
//
// Keamanan: hanya 127.0.0.1; Host & Origin harus cocok (cegah DNS rebinding / situs lain); semua /api wajib token sesi
// acak (header x-arbot-token, atau ?t= untuk SSE/file); nilai rahasia tidak pernah dikirim ke UI.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mergeConfig, validTime } from "~/shared/catalog";
import type { Config, PublicState, RunEvent, RunRecord, RunRequest, SecretKey } from "~/shared/types";
import { findBrowser } from "~/core/browser";
import { activeLock, alive, releaseLock } from "~/core/lock";
import { APP_DIR, DATA_DIR, ensureDirs, P, readJson, writeAtomic } from "~/core/paths";
import { appendHistory, loadConfig, readHistory, saveConfig, secretKeys, updateSecrets } from "~/core/store";
import { applySchedule, listSchedules, removeSchedule, runScheduleNow, taskName } from "~/core/scheduler";
import { applyPo, readPoRows } from "~/faktur/po";
import { splitFaktur } from "~/faktur/split";
import { clearFaktur, loadManifest, patchItem, saveManifest, SPLIT_DIR, splitFile } from "~/faktur/store";
import { importSources, runImport } from "./import";
import { runTest, type TestTarget } from "./tests";
import { openWindow } from "./window";

const VERSION = "1.0.0";
const PREFERRED_PORT = Number(process.env.ARBOT_PORT) || 39271;
const NO_WINDOW = process.env.ARBOT_NO_WINDOW === "1";
const UI_DIR = path.join(APP_DIR, "ui");

ensureDirs();

type ServerInfo = { port: number; pid: number; token: string };

/** Sudah ada server berjalan → cukup buka jendela baru lalu keluar. */
async function reuseExisting(): Promise<boolean> {
  const s = readJson<ServerInfo>(P.server);
  if (!s || !alive(s.pid)) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${s.port}/api/ping`, { headers: { "x-arbot-token": s.token }, signal: AbortSignal.timeout(2000) });
    if (!r.ok) return false;
  } catch { return false; }
  if (!NO_WINDOW) openWindow(`http://127.0.0.1:${s.port}/#t=${s.token}`);
  return true;
}

const token = randomBytes(24).toString("base64url");
const tokenBuf = Buffer.from(token);
const okToken = (t: string | null | undefined) => {
  if (!t) return false;
  const b = Buffer.from(t);
  return b.length === tokenBuf.length && timingSafeEqual(b, tokenBuf);
};

// ── Status publik ───────────────────────────────────────────────────────────
function publicState(): PublicState {
  const cfg = loadConfig();
  const lock = activeLock();
  const b = findBrowser(cfg.browser.channel);
  let keys: SecretKey[] = [];
  try { keys = secretKeys(); } catch { /* secrets.dat rusak / akun Windows lain */ }
  return {
    version: VERSION, config: cfg, secretsSet: keys,
    active: lock ? { runId: lock.runId, trigger: lock.trigger, startedAt: lock.startedAt, jobs: lock.jobs, chainName: lock.chainName } : null,
    browser: { path: b?.path ?? null, name: b?.name ?? null }, dataDir: DATA_DIR,
  };
}

function readRunEvents(runId: string): RunEvent[] {
  if (!/^[\w-]+$/.test(runId)) throw new Error("runId tidak valid");
  try {
    return fs.readFileSync(path.join(P.runs, `${runId}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RunEvent);
  } catch { return []; }
}

// ── SSE: satu poller membaca file event run aktif & menyiarkan ke semua klien ─────────────────────
const clients = new Set<http.ServerResponse>();
let tail: { runId: string; offset: number } | null = null;
let lastLockId: string | null = null;
let lastHistorySize = -1;

function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}

function pollRun() {
  const lock = activeLock();
  const lockId = lock?.runId ?? null;
  if (lockId && (!tail || tail.runId !== lockId)) tail = { runId: lockId, offset: 0 };
  if (tail) {
    const f = path.join(P.runs, `${tail.runId}.jsonl`);
    try {
      const size = fs.statSync(f).size;
      if (size > tail.offset) {
        const fd = fs.openSync(f, "r");
        const buf = Buffer.alloc(size - tail.offset);
        fs.readSync(fd, buf, 0, buf.length, tail.offset);
        fs.closeSync(fd);
        const text = buf.toString("utf8");
        const cut = text.lastIndexOf("\n");
        if (cut >= 0) {
          tail.offset += Buffer.byteLength(text.slice(0, cut + 1));
          for (const line of text.slice(0, cut).split("\n")) if (line) broadcast("run", { runId: tail.runId, e: JSON.parse(line) });
        }
      }
    } catch { /* file belum ada */ }
    if (!lockId && tail.runId !== lockId) tail = null; // run selesai & semua event terkirim
  }
  let hs = 0;
  try { hs = fs.statSync(P.history).size; } catch { /* belum ada */ }
  if (lockId !== lastLockId || hs !== lastHistorySize) {
    lastLockId = lockId;
    lastHistorySize = hs;
    broadcast("state", publicState());
  }
}

// ── Run & stop ──────────────────────────────────────────────────────────────
async function startRun(req: RunRequest): Promise<string> {
  const cur = activeLock();
  if (cur) throw new Error("Masih ada bot yang berjalan. Hentikan dulu atau tunggu selesai.");
  const child = spawn(process.execPath, [path.join(APP_DIR, "runner.mjs")], { detached: true, stdio: ["pipe", "ignore", "pipe"], windowsHide: true, cwd: APP_DIR });
  let err = "";
  child.stderr!.on("data", (d) => { err += d; });
  child.stdin!.end(JSON.stringify({ ...req, trigger: "manual" }));
  child.unref();
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const l = activeLock();
    if (l && l.pid === child.pid) return l.runId;
    if (child.exitCode !== null) throw new Error(err.trim().replace(/^AR Bot runner:\s*/, "") || "Bot berhenti sebelum mulai.");
  }
  throw new Error("Bot tidak mulai dalam 15 detik.");
}

function stopRun() {
  const l = activeLock();
  if (!l) return false;
  fs.writeFileSync(path.join(P.runs, `${l.runId}.cancel`), new Date().toISOString());
  // Bila tidak berhenti sendiri dalam 30 detik: matikan proses beserta browser-nya, lalu catat riwayat.
  setTimeout(() => {
    const still = activeLock();
    if (!still || still.runId !== l.runId) return;
    spawnSync("taskkill", ["/PID", String(l.pid), "/T", "/F"], { windowsHide: true });
    const events = readRunEvents(l.runId);
    if (!events.some((e) => e.t === "end")) {
      const jobs = new Map<string, RunRecord["jobs"][number]>();
      for (const s of l.jobs) jobs.set(s.id, { id: s.id, status: "cancelled" });
      for (const e of events) if (e.t === "job") jobs.set(e.result.id, { ...e.result, status: e.result.status === "running" ? "cancelled" : e.result.status });
      appendHistory({ runId: l.runId, trigger: l.trigger, chainName: l.chainName, startedAt: l.startedAt, finishedAt: new Date().toISOString(), status: "cancelled", jobs: [...jobs.values()] });
    }
    releaseLock(l.runId);
  }, 30_000);
  return true;
}

// ── Validasi konfigurasi dari UI ────────────────────────────────────────────
function cleanConfig(input: Partial<Config>): Config {
  const c = mergeConfig({ ...loadConfig(), ...input });
  c.retentionDays = Math.min(365, Math.max(1, Math.round(Number(c.retentionDays) || 30)));
  for (const ch of c.chains) {
    if (!/^[a-z0-9-]{2,40}$/.test(ch.id)) throw new Error(`ID rangkaian tidak valid: ${ch.id}`);
    if (!validTime(ch.schedule.time)) throw new Error(`Jam rangkaian ${ch.name} tidak valid.`);
    if (ch.jobs.some((j) => j.id === "edi.upload-faktur")) throw new Error("Upload Faktur tidak boleh masuk rangkaian terjadwal.");
  }
  const ids = new Set<string>();
  for (const a of c.edi.accounts) {
    if (!/^[\w-]{1,40}$/.test(a.id) || ids.has(a.id)) throw new Error("ID akun EDI tidak valid / ganda.");
    ids.add(a.id);
  }
  return c;
}

// ── HTTP ────────────────────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2",
};

let port = 0;

async function body<T>(req: http.IncomingMessage, limit = 60 * 1024 * 1024): Promise<T> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new Error("Data terlalu besar.");
    chunks.push(c as Buffer);
  }
  return (chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}) as T;
}

function send(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function sendFile(res: http.ServerResponse, file: string, type?: string) {
  res.writeHead(200, { "Content-Type": type ?? MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

/** Buka Explorer pada folder di dalam data AR Bot (atau pilih file). */
function reveal(target: string) {
  const full = path.resolve(DATA_DIR, target);
  if (!full.startsWith(path.resolve(DATA_DIR))) throw new Error("Lokasi di luar folder data.");
  fs.mkdirSync(fs.existsSync(full) && fs.statSync(full).isFile() ? path.dirname(full) : full, { recursive: true });
  const args = fs.existsSync(full) && fs.statSync(full).isFile() ? [`/select,${full}`] : [full];
  spawn("explorer.exe", args, { detached: true, stdio: "ignore" }).unref();
}

async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const p = url.pathname, m = req.method;
  if (p === "/api/ping") return send(res, 200, { ok: true });
  if (p === "/api/state" && m === "GET") return send(res, 200, publicState());
  if (p === "/api/events" && m === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);
    const l = activeLock();
    if (l) for (const e of readRunEvents(l.runId)) res.write(`event: run\ndata: ${JSON.stringify({ runId: l.runId, e })}\n\n`);
    clients.add(res);
    req.on("close", () => { clients.delete(res); scheduleIdleExit(); });
    return;
  }
  if (p === "/api/history" && m === "GET") return send(res, 200, readHistory(Number(url.searchParams.get("limit")) || 300));
  if (p === "/api/run-events" && m === "GET") return send(res, 200, readRunEvents(url.searchParams.get("id") ?? ""));
  if (p === "/api/run" && m === "POST") return send(res, 200, { runId: await startRun(await body<RunRequest>(req)) });
  if (p === "/api/stop" && m === "POST") return send(res, 200, { ok: stopRun() });
  if (p === "/api/config" && m === "POST") {
    const c = cleanConfig(await body<Partial<Config>>(req));
    saveConfig(c);
    return send(res, 200, publicState());
  }
  if (p === "/api/secrets" && m === "POST") {
    const patch = await body<Partial<Record<SecretKey, string | null>>>(req);
    for (const k of Object.keys(patch)) if (!/^(jasperPassword|botPassword|driveSecret|edi:[\w-]{1,40})$/.test(k)) throw new Error(`Kunci rahasia tidak dikenal: ${k}`);
    updateSecrets(patch);
    return send(res, 200, publicState());
  }
  if (p === "/api/test" && m === "POST") {
    const { target, accountId } = await body<{ target: TestTarget; accountId?: string }>(req);
    try { return send(res, 200, { ok: true, message: await runTest(target, accountId) }); } catch (e) { return send(res, 200, { ok: false, message: (e as Error).message.split("\n")[0] }); }
  }
  if (p === "/api/schedules" && m === "GET") {
    const tasks = listSchedules();
    return send(res, 200, loadConfig().chains.map((c) => ({ chainId: c.id, task: tasks.find((t) => t.name === taskName(c)) ?? null })));
  }
  if (p === "/api/schedule/apply" && m === "POST") {
    const { chainId } = await body<{ chainId: string }>(req);
    const chain = loadConfig().chains.find((c) => c.id === chainId);
    if (!chain) throw new Error("Rangkaian tidak ditemukan.");
    applySchedule(chain);
    return send(res, 200, { ok: true });
  }
  if (p === "/api/schedule/remove" && m === "POST") {
    const { chainId } = await body<{ chainId: string }>(req);
    const chain = loadConfig().chains.find((c) => c.id === chainId) ?? { id: chainId, name: chainId, jobs: [], schedule: { enabled: false, days: [], time: "00:00" } };
    removeSchedule(chain);
    return send(res, 200, { ok: true });
  }
  if (p === "/api/schedule/run" && m === "POST") {
    const { chainId } = await body<{ chainId: string }>(req);
    const chain = loadConfig().chains.find((c) => c.id === chainId);
    if (!chain) throw new Error("Rangkaian tidak ditemukan.");
    runScheduleNow(chain);
    return send(res, 200, { ok: true });
  }
  if (p === "/api/files" && m === "GET") {
    const job = url.searchParams.get("job") ?? "";
    if (!/^[\w.-]+$/.test(job)) throw new Error("job tidak valid");
    const dir = path.join(P.downloads, job);
    let list: { name: string; size: number; at: string }[] = [];
    try {
      list = fs.readdirSync(dir).filter((f) => !f.endsWith(".crdownload")).map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, size: st.size, at: st.mtime.toISOString() };
      }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
    } catch { /* belum ada */ }
    return send(res, 200, list);
  }
  if (p === "/api/open" && m === "POST") {
    const { target } = await body<{ target: string }>(req);
    reveal(target);
    return send(res, 200, { ok: true });
  }
  if (p === "/api/shot" && m === "GET") {
    const f = path.join(P.shots, path.basename(url.searchParams.get("name") ?? ""));
    if (!fs.existsSync(f)) return send(res, 404, { error: "tidak ada" });
    return sendFile(res, f);
  }
  if (p === "/api/import/sources" && m === "GET") return send(res, 200, importSources());
  if (p === "/api/import" && m === "POST") {
    const r = runImport(await body<{ source: "mando" | "erpbot"; dir: string }>(req));
    return send(res, 200, { ...r, state: publicState() });
  }
  // Upload Faktur
  if (p === "/api/faktur" && m === "GET") return send(res, 200, loadManifest());
  if (p === "/api/faktur/pdf" && m === "POST") {
    const { name, base64 } = await body<{ name: string; base64: string }>(req);
    const r = await splitFaktur(Buffer.from(base64, "base64"), SPLIT_DIR);
    saveManifest({ source: path.basename(name || "faktur.pdf"), createdAt: new Date().toISOString(), totalPages: r.totalPages, items: r.items });
    return send(res, 200, loadManifest());
  }
  if (p === "/api/faktur/po" && m === "POST") {
    const b = await body<{ base64?: string; text?: string }>(req);
    const rows = b.base64 ? readPoRows({ buf: Buffer.from(b.base64, "base64") }) : readPoRows({ text: b.text ?? "" });
    const man = loadManifest();
    if (!man.items.length) throw new Error("Belum ada faktur. Unggah PDF Faktur Pajak dulu.");
    const r = applyPo(man.items, rows);
    saveManifest({ ...man, items: r.items });
    return send(res, 200, { matched: r.matched, dataRows: r.dataRows, manifest: loadManifest() });
  }
  if (p === "/api/faktur/item" && m === "POST") {
    const { invoice, patch } = await body<{ invoice: string; patch: Record<string, unknown> }>(req);
    const allowed: Record<string, unknown> = {};
    for (const k of ["checked", "no_po", "no_sj", "open_amt", "status"]) if (k in patch) allowed[k] = patch[k];
    if ("open_amt" in allowed) allowed.open_amt = Number(String(allowed.open_amt).replace(/\D/g, "")) || 0;
    patchItem(invoice, allowed);
    return send(res, 200, loadManifest());
  }
  if (p === "/api/faktur/check" && m === "POST") {
    const { invoices } = await body<{ invoices: string[] }>(req);
    const man = loadManifest();
    for (const it of man.items) it.checked = invoices.includes(it.invoice);
    saveManifest(man);
    return send(res, 200, loadManifest());
  }
  if (p === "/api/faktur/file" && m === "GET") return sendFile(res, splitFile(url.searchParams.get("name") ?? ""), "application/pdf");
  if (p === "/api/faktur/clear" && m === "POST") { clearFaktur(); return send(res, 200, loadManifest()); }
  return send(res, 404, { error: "tidak ditemukan" });
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? "";
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) { res.writeHead(421); res.end(); return; }
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith("/api/")) {
      const t = (req.headers["x-arbot-token"] as string | undefined) ?? url.searchParams.get("t");
      if (!okToken(t)) return send(res, 401, { error: "token tidak valid" });
      activity = Date.now();
      return await api(req, res, url);
    }
    // Berkas UI statis (SPA: rute lain → index.html).
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file = path.resolve(UI_DIR, rel || "index.html");
    if (!file.startsWith(path.resolve(UI_DIR)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(UI_DIR, "index.html");
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'self' blob:; object-src 'self'");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    return sendFile(res, file);
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: (e as Error).message.split("\n")[0] });
  }
});

// ── Siklus hidup ────────────────────────────────────────────────────────────
let activity = Date.now();
let idleTimer: NodeJS.Timeout | null = null;
/** Keluar bila tidak ada jendela terhubung selama 20 detik (bot berjalan di proses sendiri, tidak terpengaruh). */
function scheduleIdleExit() {
  if (NO_WINDOW) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!clients.size && Date.now() - activity > 15_000) shutdown(); }, 20_000);
}
function shutdown() {
  try { if (readJson<ServerInfo>(P.server)?.pid === process.pid) fs.rmSync(P.server); } catch { /* sudah hilang */ }
  process.exit(0);
}

async function main() {
  if (await reuseExisting()) process.exit(0);
  await new Promise<void>((resolve) => {
    server.once("error", () => { server.listen(0, "127.0.0.1", resolve); });
    server.listen(PREFERRED_PORT, "127.0.0.1", resolve);
  });
  port = (server.address() as { port: number }).port;
  writeAtomic(P.server, JSON.stringify({ port, pid: process.pid, token } satisfies ServerInfo));
  setInterval(pollRun, 500);
  const url = `http://127.0.0.1:${port}/#t=${token}`;
  if (NO_WINDOW) {
    // Mode uji: cetak URL ber-token ke stdout (hanya untuk proses yang menjalankan server).
    console.log(`AR Bot ${VERSION} siap: ${url}`);
  } else {
    openWindow(url);
    // Jendela pertama butuh waktu untuk terhubung; setelah itu server berhenti bila semua jendela ditutup.
    setTimeout(scheduleIdleExit, 30_000);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
