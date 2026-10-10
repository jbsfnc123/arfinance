// Job Jaspersoft: unduh → baca & periksa isi → (opsional) arsip Drive + kirim ke AR Workspace.
// Gagal kirim = job gagal; laporan kosong = dilewati tanpa mengubah data lama.
import fs from "node:fs";
import { todayJakarta } from "@/lib/parsers/date";
import { weekToDate } from "~/shared/catalog";
import type { JobParams, JobResult } from "~/shared/types";
import { jobDir } from "~/core/paths";
import type { RunContext } from "~/runner/ctx";
import {
  archive, inspectAging, inspectErp, inspectSchedule, inspectSj, markPushed, num, pushAging, pushErp, pushSchedule, pushSj, readSheets, rp, sha256, unchanged,
} from "../arw";
import { finalize, JasperSession, shiftDate } from "./session";

export type JobOut = Partial<JobResult>;

const sessions = new WeakMap<RunContext, JasperSession>();
export const jasperOf = (ctx: RunContext) => {
  let s = sessions.get(ctx);
  if (!s) { s = new JasperSession(ctx); sessions.set(ctx, s); }
  return s;
};
/** Buang sesi (setelah browser ditutup karena galat) → job berikutnya login ulang. */
export const resetJasper = (ctx: RunContext) => { sessions.delete(ctx); };

/** Langkah kirim bersama: lewati bila uji coba / tidak dikirim / file kembar (tanpa arsip ulang); arsip Drive lalu kirim. */
async function shouldPush(ctx: RunContext, job: Parameters<typeof unchanged>[1], p: JobParams, buf: Buffer, file: string, month: string) {
  if (ctx.opts.dryRun) { ctx.info("Uji coba: tidak diarsip & tidak dikirim."); return null; }
  if (!p.push) { ctx.info("Kirim ke AR Workspace nonaktif untuk job ini."); return null; }
  const sha = sha256(buf);
  if (unchanged(ctx, job, sha)) return null;
  await archive(ctx, file, month);
  return sha;
}

export async function agingJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const js = jasperOf(ctx);
  await js.openReport("Aging Detail");
  await js.pickOrganization(["AD_Org_ID"]);
  const today = todayJakarta();
  await js.setDate("statementdate", today, "Statement Date");
  await js.waitForLoading();
  await js.pickOption("isSOtrx", "Piutang", "Tipe Transaksi");
  ctx.info(`Statement Date ${today} · Piutang`);
  if (!(await js.applyAndWait())) throw new Error("laporan Aging kosong");
  const file = finalize(ctx, await js.exportAs(jobDir("jasper.aging"), "Excel", /\.xlsx?$/i), "Aging Detail");

  const buf = fs.readFileSync(file);
  const sheets = readSheets(buf);
  const info = inspectAging(sheets);
  const summary = `${num(info.rows)} baris · Open Amt ${rp(info.total)}`;
  ctx.info(`Baca: ${summary} · invoice terbaru ${info.month}`);
  const sha = await shouldPush(ctx, "jasper.aging", p, buf, file, today.slice(0, 7));
  if (!sha) return { files: [file], rows: info.rows, summary, pushed: false };
  const r = await pushAging(ctx, file, sheets, today);
  markPushed("jasper.aging", sha);
  ctx.log("ok", `AR Workspace: ${r.message}`);
  return { files: [file], rows: info.rows, summary: `${summary} · terkirim`, pushed: true };
}

export async function sendInvoiceJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const js = jasperOf(ctx);
  const today = todayJakarta();
  // Bawaan: Senin minggu ini s/d hari ini (bisa diubah manual dari halaman job).
  const week = weekToDate(today);
  const start = p.start || week.start, end = p.end || week.end;
  await js.openReport("Send Invoice To Customer");
  await js.setDate("whenStart", start, "Tanggal Awal");
  await js.setDate("whenEnd", end, "Tanggal Akhir");
  await js.waitForLoading();
  ctx.info(`Tanggal ${start} s/d ${end}`);
  if (!(await js.applyAndWait())) return { status: "skipped", summary: "Tidak ada jadwal kirim (laporan kosong) — jadwal lama dibiarkan." };
  const file = finalize(ctx, await js.exportAs(jobDir("jasper.send-invoice"), "CSV", /\.csv$/i), "Send Invoice");

  const buf = fs.readFileSync(file);
  const s = inspectSchedule(buf.toString("utf8"), today);
  const summary = `${num(s.rows.length)} invoice · ${s.skipped} baris dilewati`;
  ctx.info(`Baca: ${summary} · tanggal kirim ${s.dates.join(", ") || "-"}`);
  const outside = s.dates.filter((d) => d < start || d > end);
  if (outside.length) ctx.warn(`Ada tanggal kirim di luar ${start} s/d ${end}: ${outside.join(", ")}.`);
  if (!s.rows.length) return { status: "skipped", files: [file], summary: "Tidak ada invoice terbaca — jadwal lama dibiarkan." };
  const sha = await shouldPush(ctx, "jasper.send-invoice", p, buf, file, today.slice(0, 7));
  if (!sha) return { files: [file], rows: s.rows.length, summary, pushed: false };
  const n = await pushSchedule(ctx, file, s.rows);
  markPushed("jasper.send-invoice", sha);
  ctx.log("ok", `AR Workspace: jadwal kurir diganti — ${num(n)} invoice tersimpan.`);
  return { files: [file], rows: s.rows.length, summary: `${summary} · jadwal diganti`, pushed: true };
}

export async function sjJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const js = jasperOf(ctx);
  const today = todayJakarta();
  const days = Math.min(31, Math.max(1, p.days ?? 7));
  const from = p.start || shiftDate(today, -(days - 1)), to = p.end || today;
  await js.openReport("Laporan Serah Terima Surat Jalan By Send Date");
  await js.setDate("StartDate", from, "Start Date");
  await js.setDate("EndDate", to, "End Date");
  await js.waitForLoading();
  await js.pickOrganization(["Organization", "AD_Org_ID"]);
  ctx.info(`Start Date ${from} · End Date ${to}`);
  if (!(await js.applyAndWait())) return { status: "skipped", summary: "Laporan kosong — data lama tetap." };
  const file = finalize(ctx, await js.exportAs(jobDir("jasper.sj"), "CSV", /\.csv$/i), "Serah Terima SJ");

  const buf = fs.readFileSync(file);
  const parsed = inspectSj(buf.toString("utf8"));
  const summary = `${num(parsed.stats.records)} baris · ${num(parsed.stats.uniqueSj)} SJ unik`;
  ctx.info(`Baca: ${summary} · ${num(parsed.stats.withReceiver)} ber-Receiver · ${parsed.bad.length} baris bermasalah`);
  if (!parsed.rows.length) return { status: "skipped", files: [file], summary: "Tidak ada baris data — data lama tetap." };
  const sha = await shouldPush(ctx, "jasper.sj", p, buf, file, today.slice(0, 7));
  if (!sha) return { files: [file], rows: parsed.stats.records, summary, pushed: false };
  const { candidates, result: r } = await pushSj(ctx, file, parsed);
  markPushed("jasper.sj", sha);
  if (!r) {
    ctx.info("AR Workspace: tidak ada SJ dengan Receiver diakui & Receive Date valid — tidak ada yang dikirim.");
    return { files: [file], rows: parsed.stats.records, summary: `${summary} · 0 dikirim`, pushed: true };
  }
  ctx.log("ok", `AR Workspace: ${num(candidates)} SJ dikirim → ${num(r.saved)} Receive Date baru · ${num(r.existing)} sudah ada · ` +
    `${num(r.notInAging)} tidak ada di Aging · ${num(r.notRecognized)} Receiver tidak diakui · ${num(r.badDate)} tanggal tidak valid`);
  return { files: [file], rows: parsed.stats.records, summary: `${summary} · ${num(r.saved)} Receive Date baru`, pushed: true };
}

export async function invoiceByDateJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const js = jasperOf(ctx);
  const today = todayJakarta();
  const start = p.start || `${today.slice(0, 7)}-01`, end = p.end || today;
  await js.openReport("Invoice and Payment Date Comparison ( Based On Invoice Date)", "Invoice and Payment Date Comparison");
  await js.pickOrganization(["AD_Org_ID", "Organization"]);
  await js.setDate("whenStart", start, "Start Date");
  await js.setDate("whenEnd", end, "End Date");
  await js.waitForLoading();
  await js.pickOption("status", "Piutang", "Status");
  ctx.info(`Tanggal invoice ${start} s/d ${end} · Piutang`);
  if (!(await js.applyAndWait())) return { status: "skipped", summary: "Laporan kosong." };
  const file = finalize(ctx, await js.exportAs(jobDir("jasper.invoice-by-date"), "Excel", /\.xlsx?$/i), "Invoice by Date");

  const buf = fs.readFileSync(file);
  const sheets = readSheets(buf);
  const e = inspectErp(sheets);
  const summary = `${num(e.invoices)} invoice · ${num(e.rows.filter((r) => r.payment_date).length)} pembayaran`;
  ctx.info(`Baca: ${summary} · bulan ${e.months.join(", ")}`);
  const sha = await shouldPush(ctx, "jasper.invoice-by-date", p, buf, file, today.slice(0, 7));
  if (!sha) return { files: [file], rows: e.rows.length, summary, pushed: false };
  const r = await pushErp(ctx, file, sheets);
  markPushed("jasper.invoice-by-date", sha);
  ctx.log("ok", `AR Workspace: ${r.message}`);
  return { files: [file], rows: e.rows.length, summary: `${summary} · terkirim`, pushed: true };
}
