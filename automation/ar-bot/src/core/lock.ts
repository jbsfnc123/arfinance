// Satu run sekaligus (manual, jadwal, atau dua jendela) — file kunci berisi PID; kunci basi (PID mati / > 3 jam) diabaikan.
import fs from "node:fs";
import type { JobSpec, RunRequest } from "~/shared/types";
import { P, readJson } from "./paths";

export type RunLock = { runId: string; pid: number; trigger: RunRequest["trigger"]; startedAt: string; jobs: JobSpec[]; chainName?: string };

export function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

export function activeLock(): RunLock | null {
  const l = readJson<RunLock>(P.runLock);
  if (!l) return null;
  if (!alive(l.pid) || Date.now() - Date.parse(l.startedAt) > 3 * 3600_000) {
    try { fs.rmSync(P.runLock); } catch { /* sudah hilang */ }
    return null;
  }
  return l;
}

export function acquireLock(l: RunLock) {
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(P.runLock, "wx");
      fs.writeSync(fd, JSON.stringify(l));
      fs.closeSync(fd);
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const cur = activeLock();
      if (cur) throw new Error(`Bot lain masih berjalan (${cur.chainName ?? cur.jobs.map((j) => j.id).join(", ")}, mulai ${new Date(cur.startedAt).toLocaleTimeString("id-ID")}).`);
    }
  }
  throw new Error("Tidak bisa membuat kunci run.");
}

export function releaseLock(runId: string) {
  if (readJson<RunLock>(P.runLock)?.runId === runId) { try { fs.rmSync(P.runLock); } catch { /* sudah hilang */ } }
}
