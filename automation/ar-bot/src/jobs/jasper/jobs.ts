// Job Jaspersoft: unduh → baca & periksa isi → (opsional) kirim ke AR Workspace.
// Gagal kirim = job gagal; laporan kosong = dilewati tanpa mengubah data lama.
import fs from "node:fs";
import { todayJakarta } from "@/lib/parsers/date";
import { defaultDates, weekToDate } from "~/shared/catalog";
import type { JobParams, JobResult } from "~/shared/types";
import { jobDir } from "~/core/paths";
import { CancelledError, type RunContext } from "~/runner/ctx";
import {
  inspectAging, inspectErp, inspectSchedule, inspectSj, markPushed, num, pushAging, pushErp, pushSchedule, pushSjReplace, readSheets, rp, sha256, unchanged,
} from "../arw";
import { finalize, JasperSession } from "./session";
import { SJ_MAX_DAYS } from "~/shared/catalog";
import { docRows, receiptRows } from "@/lib/modules/sj/parse";
import { marketingMap, marketingStats, withMarketing } from "@/lib/modules/sj/marketing";

export type JobOut = Partial<JobResult>;

const sessions = new WeakMap<RunContext, JasperSession>();
/** Run berurutan: satu sesi untuk seluruh run (login sekali). Run paralel: sesi per job (browser context sendiri). */
const sessionKey = (ctx: RunContext) => (ctx.isolated ? ctx : ctx.root);
export const jasperOf = (ctx: RunContext) => {
  let s = sessions.get(sessionKey(ctx));
  if (!s) { s = new JasperSession(ctx); sessions.set(sessionKey(ctx), s); }
  s.ctx = ctx; // log & pembatalan mengikuti job yang sedang memakai sesi
  return s;
};
/** Buang sesi (setelah halaman ditutup karena galat) → percobaan / job berikutnya login ulang. */
export const resetJasper = (ctx: RunContext) => { sessions.delete(sessionKey(ctx)); };

/** Langkah kirim bersama: lewati bila uji coba / tidak dikirim / file kembar ; selain itu kirim. */
async function shouldPush(ctx: RunContext, job: Parameters<typeof unchanged>[1], p: JobParams, buf: Buffer, file: string, month: string) {
  if (ctx.opts.dryRun) { ctx.info("Uji coba: tidak diarsip & tidak dikirim."); return null; }
  if (!p.push) { ctx.info("Kirim ke AR Workspace nonaktif untuk job ini."); return null; }
  const sha = sha256(buf);
  if (unchanged(ctx, job, sha)) return null;
  return sha;
}

/** Satu laporan Aging Detail (Piutang) per Statement Date → file Excel. */
async function downloadAging(ctx: RunContext, date: string, prefix: string) {
  const js = jasperOf(ctx);
  await js.openReport("Aging Detail");
  await js.pickOrganization(["AD_Org_ID"]);
  await js.setDate("statementdate", date, "Statement Date");
  await js.waitForLoading();
  await js.pickOption("isSOtrx", "Piutang", "Tipe Transaksi");
  ctx.info(`Statement Date ${date} · Piutang`);
  if (!(await js.applyAndWait())) throw new Error("laporan Aging kosong");
  return finalize(ctx, await js.exportAs(jobDir("jasper.aging"), "Excel", /\.xlsx?$/i), prefix);
}

const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/**
 * Aging banyak bulan: satu file per cut off akhir bulan. Hanya unduh (tidak dikirim ke AR Workspace, agar Aging terkini
 * tidak tertimpa data lama). Galat satu bulan → dicatat, lanjut bulan berikutnya (login ulang); gagal semua = job gagal.
 */
async function agingMonthsJob(ctx: RunContext, cutoffs: string[]): Promise<JobOut> {
  ctx.info(`Aging per akhir bulan: ${cutoffs.map(dmy).join(", ")} · hanya unduh (tidak dikirim ke AR Workspace)`);
  const files: string[] = [], done: string[] = [], failed: string[] = [];
  let rows = 0;
  for (const [i, d] of cutoffs.entries()) {
    ctx.check();
    ctx.info(`Bulan ${i + 1}/${cutoffs.length}: per ${dmy(d)}`);
    try {
      const file = await downloadAging(ctx, d, `Aging Detail per ${d}`);
      files.push(file);
      const info = inspectAging(readSheets(fs.readFileSync(file)));
      rows += info.rows;
      done.push(`${dmy(d)}: ${num(info.rows)} baris`);
      ctx.log("ok", `  per ${dmy(d)}: ${num(info.rows)} baris · Open Amt ${rp(info.total)}`);
    } catch (e) {
      if (e instanceof CancelledError) throw e;
      const msg = (e as Error).message.split("\n")[0];
      failed.push(`${dmy(d)}: ${msg}`);
      ctx.warn(`  per ${dmy(d)} gagal: ${msg}`);
      await ctx.diagnose(jasperOf(ctx).currentPage, `aging-${d}`);
      await jasperOf(ctx).currentPage?.close().catch(() => {});
      resetJasper(ctx);
    }
  }
  const summary = `${files.length}/${cutoffs.length} bulan · ${done.join(" · ")}${failed.length ? ` · gagal ${failed.join(" · ")}` : ""}`;
  if (!files.length) throw new Error(`semua bulan gagal — ${failed.slice(0, 3).join(" · ")}`);
  return { files, rows, summary, pushed: false };
}

export async function agingJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  if (p.cutoffs?.length) {
    const today = todayJakarta();
    const cutoffs = [...new Set(p.cutoffs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today))].sort();
    if (!cutoffs.length) throw new Error("tanggal cut off tidak valid (maksimal hari ini)");
    if (cutoffs.length > 24) throw new Error("maksimal 24 bulan per run");
    return agingMonthsJob(ctx, cutoffs);
  }
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

/** Fase 85: laporan berdasarkan Tanggal SJ (shipment) — Monitor Surat Jalan tidak lagi bergantung pada Aging. */
export const SJ_REPORT = "Laporan Serah Terima Surat Jalan By Shipment Date (NEW)";

/** Rentang Tanggal SJ job Serah Terima / Pengkinian: `days` hari ke belakang (bawaan 60, maks. SJ_MAX_DAYS) atau start/end. */
function sjRange(id: "jasper.sj" | "jasper.sj-update", p: JobParams) {
  const days = Math.min(SJ_MAX_DAYS, Math.max(1, p.days ?? 60));
  const def = defaultDates(id, todayJakarta(), days)!;
  return { from: p.start || def.start, to: p.end || def.end };
}

/** Unduh Laporan Serah Terima SJ By Shipment Date (CSV). null bila laporan kosong. */
async function downloadSjReport(ctx: RunContext, dirId: "jasper.sj" | "jasper.sj-update", from: string, to: string) {
  const js = jasperOf(ctx);
  await js.openReport(SJ_REPORT);
  await js.setDate("StartDate", from, "Start Date");
  await js.setDate("EndDate", to, "End Date");
  await js.waitForLoading();
  await js.pickOrganization(["Organization", "AD_Org_ID"]);
  ctx.info(`Serah Terima SJ · Start Date ${from} · End Date ${to}`);
  if (!(await js.applyAndWait())) return null;
  return finalize(ctx, await js.exportAs(jobDir(dirId), "CSV", /\.csv$/i), "Serah Terima SJ");
}

/**
 * Unduh Invoice and Payment Date Comparison (Excel). `status` = teks pilihan Status; "semua" = pilih opsi yang
 * mengandung "Semua"/"All" bila ada (untuk Marketing Group: invoice lunas juga dihitung), selain itu biarkan bawaan.
 */
async function downloadInvoiceByDate(ctx: RunContext, dirId: "jasper.invoice-by-date" | "jasper.sj-update", start: string, end: string, status: string) {
  const js = jasperOf(ctx);
  await js.openReport("Invoice and Payment Date Comparison ( Based On Invoice Date)", "Invoice and Payment Date Comparison");
  await js.pickOrganization(["AD_Org_ID", "Organization"]);
  await js.setDate("whenStart", start, "Start Date");
  await js.setDate("whenEnd", end, "End Date");
  await js.waitForLoading();
  let picked = status;
  if (status === "semua") {
    const o = await js.optionTexts("status");
    const all = o.options.find((t) => /^(semua|all)\b/i.test(t));
    if (all) { await js.pickOption("status", all, "Status"); picked = all; } else picked = o.current || "bawaan";
    ctx.info(`Status tersedia: ${o.options.join(", ") || "-"} → dipakai: ${picked}`);
  } else await js.pickOption("status", status, "Status");
  ctx.info(`Invoice by Date · tanggal invoice ${start} s/d ${end} · ${picked}`);
  if (!(await js.applyAndWait())) return null;
  return finalize(ctx, await js.exportAs(jobDir(dirId), "Excel", /\.xlsx?$/i), "Invoice by Date");
}

/** Serah Terima SJ (Fase 87): UNDUH saja — kirim ke AR Workspace lewat job "Pengkinian Data Surat Jalan". */
export async function sjJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const { from, to } = sjRange("jasper.sj", p);
  const file = await downloadSjReport(ctx, "jasper.sj", from, to);
  if (!file) return { status: "skipped", summary: "Laporan kosong." };
  const parsed = inspectSj(fs.readFileSync(file, "utf8"));
  const summary = `${num(parsed.stats.records)} baris · ${num(parsed.stats.uniqueSj)} SJ unik`;
  ctx.info(`Baca: ${summary} · ${num(parsed.stats.withReceiver)} ber-Receiver · ${parsed.bad.length} baris bermasalah`);
  return { files: [file], rows: parsed.stats.records, summary, pushed: false };
}

/**
 * Pengkinian Data Surat Jalan (Fase 87): unduh Serah Terima SJ + Invoice by Date (rentang sama) → gabung LOKAL
 * (Marketing Group per Business Partner = BP Name, dari invoice terbaru) → GANTI TOTAL data SJ di AR Workspace.
 * Tidak membaca data apa pun dari Workspace; data invoice/penjualan tidak dikirim.
 */
export async function sjUpdateJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const { from, to } = sjRange("jasper.sj-update", p);
  const sjFile = await downloadSjReport(ctx, "jasper.sj-update", from, to);
  if (!sjFile) return { status: "skipped", summary: "Laporan Serah Terima kosong — data di AR Workspace tidak diubah." };
  const parsed = inspectSj(fs.readFileSync(sjFile, "utf8"));
  ctx.info(`Baca Serah Terima: ${num(parsed.stats.records)} baris · ${num(parsed.stats.uniqueSj)} nomor unik · ${parsed.bad.length} baris bermasalah`);

  const invFile = await downloadInvoiceByDate(ctx, "jasper.sj-update", from, to, "semua");
  const erpRows = invFile ? inspectErp(readSheets(fs.readFileSync(invFile))).rows : [];
  if (!invFile) ctx.warn("Invoice by Date kosong — Marketing Group tidak terisi.");
  const map = marketingMap(erpRows);
  const docs = withMarketing(docRows(parsed), map);
  const receipts = receiptRows(parsed);
  const st = marketingStats(docs);
  ctx.info(`Gabung lokal: ${num(docs.length)} SJ · ${num(receipts.length)} baris penerimaan · ${num(map.size)} BP ber-Marketing Group di invoice · ` +
    `${num(st.matched)} SJ ber-Marketing Group (${st.pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%)`);
  ctx.info(`Marketing Group: ${st.groups.slice(0, 8).map((g) => `${g.group} ${num(g.n)}`).join(" · ") || "-"}`);
  const files = [sjFile, ...(invFile ? [invFile] : [])];
  const summary = `${num(docs.length)} SJ · ${num(st.matched)} ber-Marketing Group`;
  if (!docs.length) return { status: "skipped", files, summary: "Tidak ada SJ/… di laporan — data di AR Workspace tidak diubah." };
  if (ctx.opts.dryRun) { ctx.info("Uji coba: tidak dikirim."); return { files, rows: docs.length, summary, pushed: false }; }
  if (!p.push) { ctx.info("Kirim ke AR Workspace nonaktif untuk job ini."); return { files, rows: docs.length, summary, pushed: false }; }

  const r = await pushSjReplace(ctx, sjFile, docs, receipts);
  ctx.log("ok", `AR Workspace: data SJ DIGANTI — ${num(r.docs)} SJ · ${num(r.saved)} Receive Date · ` +
    `${num(r.notRecognized)} baris Receiver tidak diakui · ${num(r.badDate)} tanggal tidak valid (${r.parts} potongan)`);
  return { files, rows: docs.length, summary: `${summary} · ${num(r.saved)} Receive Date · data diganti`, pushed: true };
}

export async function invoiceByDateJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const today = todayJakarta();
  const def = defaultDates("jasper.invoice-by-date", today)!;
  const start = p.start || def.start, end = p.end || def.end;
  const file = await downloadInvoiceByDate(ctx, "jasper.invoice-by-date", start, end, "Piutang");
  if (!file) return { status: "skipped", summary: "Laporan kosong." };

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
