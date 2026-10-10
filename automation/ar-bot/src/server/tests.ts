// Uji koneksi dari Pengaturan: browser, Jaspersoft, AR Workspace, akun EDI.
import fs from "node:fs";
import { findBrowser } from "~/core/browser";
import { P } from "~/core/paths";
import { loadConfig, loadSecrets } from "~/core/store";
import { testArw } from "~/jobs/arw";
import { JasperSession } from "~/jobs/jasper/session";
import { testEdiLogin } from "~/jobs/edi/session";
import { RunContext } from "~/runner/ctx";

export type TestTarget = "browser" | "jasper" | "arw" | "edi";

async function withCtx<T>(fn: (ctx: RunContext) => Promise<T>) {
  const ctx = new RunContext(`test-${Date.now()}`, loadConfig(), loadSecrets(), { dryRun: true, force: false });
  try { return await fn(ctx); } finally {
    await ctx.dispose();
    try { fs.rmSync(ctx.eventsFile); } catch { /* tidak ada */ }
  }
}

export async function runTest(target: TestTarget, accountId?: string): Promise<string> {
  fs.mkdirSync(P.runs, { recursive: true });
  if (target === "browser") {
    const b = findBrowser(loadConfig().browser.channel);
    if (!b) throw new Error("Edge / Chrome tidak ditemukan");
    return `${b.name} · ${b.path}`;
  }
  if (target === "jasper") return withCtx(async (ctx) => { await new JasperSession(ctx).ready(); return "login berhasil"; });
  if (target === "arw") return withCtx(testArw);
  if (!accountId) throw new Error("akun EDI belum dipilih");
  return withCtx((ctx) => testEdiLogin(ctx, accountId));
}
