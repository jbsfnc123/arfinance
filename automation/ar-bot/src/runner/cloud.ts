// Mode cloud AR Bot (Fase 93): dijalankan GitHub Actions (repo privat ARBOT) untuk satu baris public.bot_runs.
//   env ARBOT_RUN_ID   id bot_runs (dari workflow_dispatch)
//       ARBOT_CONFIG   JSON pengaturan tanpa rahasia (akun EDI, koneksi AR Workspace) — GitHub Secret
//       ARBOT_SECRETS  JSON rahasia (edi:<id>, botPassword) — GitHub Secret, dibaca store.loadSecrets
//       ARBOT_DATA_DIR folder kerja sementara runner
// Alur: login Bot ERP → bot_run_start → (Upload Faktur: unduh PDF transit + tulis manifest) → executeRun (jalur sama
// dengan lokal) → log berkala (bot_run_log; status cancelled → berhenti) → bot_run_finish → hapus folder transit.
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config, JobId, JobSpec, RunEvent, RunRecord } from "~/shared/types";
import { ensureDirs, P, writeAtomic } from "~/core/paths";
import { loadConfig, loadSecrets } from "~/core/store";
import { saveManifest, SPLIT_DIR } from "~/faktur/store";
import { saveInvoices, type InvoiceRow } from "~/faktur/invoices";
import type { FakturItem } from "~/faktur/split";
import { executeRun, newRunId } from "./run";

const BUCKET = "bot-transit";
const EDI_JOBS: JobId[] = ["edi.gr", "edi.kwitansi", "edi.invoice-inbox", "edi.outbox-invoice", "edi.upload-faktur"];

type CloudJob = { id: JobId; params?: Record<string, unknown> };
export type ItemResult = { invoice: string; status: string; ok: boolean };

/** Param `accounts` dari AR Workspace = username EDI (atau id) → id akun AR Bot. Kosong/tidak ada = semua akun aktif. */
export function mapAccounts(accounts: unknown, config: Config): string[] | undefined {
  if (!Array.isArray(accounts) || !accounts.length) return undefined;
  return accounts.map((u) => {
    const key = String(u).trim().toLowerCase();
    const acc = config.edi.accounts.find((a) => a.id.toLowerCase() === key || a.username.trim().toLowerCase() === key);
    if (!acc) throw new Error(`Akun EDI "${String(u)}" belum terdaftar di bot cloud.`);
    return acc.id;
  });
}

/** Baris bot_runs.jobs → JobSpec AR Bot (hanya 5 job EDI; `items` faktur dipisah dari param). */
export function toSpecs(jobs: CloudJob[], config: Config): { specs: JobSpec[]; faktur?: { mode: string; items: unknown[] } } {
  let faktur: { mode: string; items: unknown[] } | undefined;
  const specs = jobs.map((j): JobSpec => {
    if (!EDI_JOBS.includes(j.id)) throw new Error(`Job ${j.id} tidak didukung bot cloud.`);
    const p = (j.params ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const params: NonNullable<JobSpec["params"]> = { accounts: mapAccounts(p.accounts, config) };
    if (typeof p.push === "boolean") params.push = p.push;
    if (str(p.start)) params.start = str(p.start);
    if (str(p.end)) params.end = str(p.end);
    if (p.mode === "draft" || p.mode === "not_found" || p.mode === "fill") params.mode = p.mode;
    if (p.inboxMode === "completed" || p.inboxMode === "new") params.inboxMode = p.inboxMode;
    if (typeof p.limit === "number" && p.limit >= 0) params.limit = Math.min(200, Math.floor(p.limit));
    if (j.id === "edi.upload-faktur") faktur = { mode: params.mode ?? "draft", items: Array.isArray(p.items) ? p.items : [] };
    return { id: j.id, params };
  });
  return { specs, faktur };
}

/** Tulis sheet kerja Upload Faktur dari daftar AR Workspace (mode fill → sheet Invoice; lainnya → manifest Invoice+FP). */
export function writeFakturWork(mode: string, items: unknown[]) {
  const now = new Date().toISOString();
  if (mode === "fill") {
    const rows: InvoiceRow[] = items.map((x) => {
      const r = x as Partial<InvoiceRow>;
      return { invoice: String(r.invoice ?? ""), no_po: String(r.no_po ?? ""), no_sj: String(r.no_sj ?? ""), open_amt: Number(r.open_amt ?? 0) || 0, checked: r.checked !== false, status: String(r.status ?? "Ready") };
    }).filter((r) => r.invoice);
    saveInvoices({ source: "AR Workspace", createdAt: now, items: rows });
    return rows.length;
  }
  const list: FakturItem[] = items.map((x, i) => {
    const r = x as Partial<FakturItem>;
    return {
      index: i + 1, invoice: String(r.invoice ?? ""), faktur: String(r.faktur ?? ""), filename: path.basename(String(r.filename ?? "")),
      pages: Number(r.pages ?? 1) || 1, size: Number(r.size ?? 0) || 0, checked: r.checked !== false, status: String(r.status ?? "Ready"),
      no_po: r.no_po ? String(r.no_po) : undefined, no_sj: r.no_sj ? String(r.no_sj) : undefined,
      open_amt: r.open_amt === undefined || r.open_amt === null ? undefined : Number(r.open_amt), in_po: !!r.in_po,
    };
  }).filter((r) => r.invoice && r.filename);
  saveManifest({ source: "AR Workspace", createdAt: now, totalPages: list.reduce((a, r) => a + r.pages, 0), items: list });
  return list.length;
}

/** Baris log ringkas dari file event (sudah di-redact RunContext). */
export function logLines(events: RunEvent[]) {
  return events.filter((e): e is Extract<RunEvent, { t: "log" }> => e.t === "log").map((e) => {
    const t = new Date(e.at).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
    return `${t} ${e.level === "error" ? "✖" : e.level === "warn" ? "!" : e.level === "ok" ? "✔" : "·"} ${e.msg}`;
  });
}

function readEvents(file: string): RunEvent[] {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { return []; }
  const out: RunEvent[] = [];
  for (const line of text.split("\n")) { if (line.trim()) { try { out.push(JSON.parse(line)); } catch { /* baris belum lengkap */ } } }
  return out;
}

/** Hapus folder transit run ini, serta sisa folder run lain (hanya satu run aktif sekaligus → semuanya basi). */
async function clearTransit(sb: SupabaseClient, keep?: string) {
  const { data: dirs } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
  for (const d of dirs ?? []) {
    if (keep && d.name === keep) continue;
    const { data: files } = await sb.storage.from(BUCKET).list(d.name, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${d.name}/${f.name}`);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  }
}

export async function cloudMain(): Promise<boolean> {
  const id = Number(process.env.ARBOT_RUN_ID);
  if (!Number.isInteger(id) || id <= 0) throw new Error("ARBOT_RUN_ID tidak valid.");
  if (!process.env.ARBOT_CONFIG || !process.env.ARBOT_SECRETS) throw new Error("ARBOT_CONFIG / ARBOT_SECRETS belum diisi (GitHub Secrets).");
  ensureDirs();
  writeAtomic(P.config, JSON.stringify({ ...JSON.parse(process.env.ARBOT_CONFIG), browser: { channel: "chrome", headless: true }, downloadDir: "" }));
  const config = loadConfig();
  const secrets = loadSecrets();
  const { supabaseUrl, anonKey, botEmail } = config.arw;
  if (!supabaseUrl || !anonKey || !botEmail || !secrets.botPassword) throw new Error("Koneksi AR Workspace di ARBOT_CONFIG/ARBOT_SECRETS belum lengkap.");
  const sb = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: true } });
  const { error: le } = await sb.auth.signInWithPassword({ email: botEmail, password: secrets.botPassword });
  if (le) throw new Error(`Login Bot ERP gagal: ${le.message}`);
  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  };
  const finish = (status: string, result: unknown, log: string, error: string | null) =>
    rpc("bot_run_finish", { p_id: id, p_status: status, p_result: result, p_log: log, p_error: error });

  const started = await rpc<{ ok: boolean; status: string; jobs?: CloudJob[]; dry_run?: boolean; transit?: boolean }>(
    "bot_run_start", { p_id: id, p_gh_run_id: Number(process.env.GITHUB_RUN_ID) || null });
  if (!started.ok) { console.log(`Run #${id} berstatus ${started.status} — tidak dijalankan.`); return true; }

  const runId = newRunId();
  const eventsFile = path.join(P.runs, `${runId}.jsonl`);
  const cancelFile = path.join(P.runs, `${runId}.cancel`);
  // Kirim log tiap 5 dtk bila berubah, dan minimal tiap 15 dtk (sekaligus cek status: cancelled → berhenti).
  let lastSent = "", tick = 0, busy = false;
  const pump = async () => {
    if (busy) return;
    busy = true;
    try {
      const log = logLines(readEvents(eventsFile)).slice(-300).join("\n");
      if (log === lastSent && ++tick % 3) return;
      lastSent = log;
      const st = await rpc<string>("bot_run_log", { p_id: id, p_log: log }).catch(() => null);
      if (st === "cancelled" && !fs.existsSync(cancelFile)) fs.writeFileSync(cancelFile, "1");
    } finally { busy = false; }
  };
  const timer = setInterval(() => void pump(), 5000);

  let record: RunRecord | null = null;
  let fatal: string | null = null;
  try {
    const { specs, faktur } = toSpecs(started.jobs ?? [], config);
    if (faktur) {
      const n = writeFakturWork(faktur.mode, faktur.items);
      if (faktur.mode !== "fill" && started.transit) {
        fs.mkdirSync(SPLIT_DIR, { recursive: true });
        for (const it of faktur.items as Partial<FakturItem>[]) {
          const name = path.basename(String(it.filename ?? ""));
          if (!name) continue;
          const { data, error } = await sb.storage.from(BUCKET).download(`${id}/${name}`);
          if (error || !data) throw new Error(`PDF ${name} tidak bisa diambil dari transit: ${error?.message ?? "kosong"}`);
          fs.writeFileSync(path.join(SPLIT_DIR, name), Buffer.from(await data.arrayBuffer()));
        }
      }
      console.log(`Upload Faktur: ${n} baris disiapkan.`);
    }
    record = await executeRun({ jobs: specs, dryRun: !!started.dry_run, trigger: "manual" }, { runId, label: "AR Workspace (cloud)" });
  } catch (e) {
    fatal = (e as Error).message.split("\n")[0];
  } finally {
    clearInterval(timer);
  }

  const events = readEvents(eventsFile);
  const log = logLines(events).slice(-300).join("\n") + (fatal ? `\n✖ ${fatal}` : "");
  const items: ItemResult[] = [];
  for (const e of events) if (e.t === "item") {
    const i = items.findIndex((x) => x.invoice === e.invoice);
    const v = { invoice: e.invoice, status: e.status, ok: e.ok };
    if (i >= 0) items[i] = v; else items.push(v);
  }
  const jobs = (record?.jobs ?? []).map((j) => ({ id: j.id, status: j.status, summary: j.summary, rows: j.rows, pushed: j.pushed, error: j.error, startedAt: j.startedAt, finishedAt: j.finishedAt }));
  const status = fatal ? "failed" : record?.status === "ok" ? "success" : record?.status === "partial" ? "partial" : record?.status === "cancelled" ? "cancelled" : "failed";
  const error = fatal ?? (jobs.find((j) => j.error)?.error ?? null);
  await finish(status, { jobs, items }, log, error);
  await clearTransit(sb).catch((e) => console.log(`Bersihkan transit gagal: ${(e as Error).message}`));
  await sb.auth.signOut().catch(() => {});
  console.log(`Run #${id}: ${status}${error ? ` — ${error}` : ""}`);
  return status === "success";
}
