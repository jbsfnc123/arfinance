"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls, segGroup, segItem, toggleChip } from "@/components/ui";
import { useViewState } from "@/lib/ui/view-state";
import { todayJakarta } from "@/lib/parsers/date";
import {
  botJob, confirmText, defaultParams, duration, isActive, jobResultOf, lastRunFor, STATUS_LABEL,
  type BotJobId, type BotParams, type BotRun,
} from "@/lib/modules/m10/bot";
import type { Bot } from "./use-bot";

// Form satu job BOT (Fase 93): param + Uji Coba / Jalankan + status run terakhir. Dipakai kartu di tab BOT dan popover
// tombol kanan atas Kertas Kerja (compact). Param diingat per tab browser. Job tulis (Inbox/Outbox) wajib konfirmasi.
export function BotJobForm({ id, bot, users, compact, onDone }: {
  id: Exclude<BotJobId, "edi.upload-faktur">; bot: Bot; users: string[]; compact?: boolean; onDone?: () => void;
}) {
  const job = botJob(id);
  const toast = useToast();
  const [p, setP] = useViewState<BotParams>(`mitra10:bot:${id}`, defaultParams(id, todayJakarta()));
  const [ask, setAsk] = useState(false);
  const set = (patch: Partial<BotParams>) => setP({ ...p, ...patch });
  const accounts = p.accounts ?? [];
  const toggleAcc = (u: string) => set({ accounts: accounts.includes(u) ? accounts.filter((x) => x !== u) : [...accounts, u] });

  const run = async (dryRun: boolean) => {
    setAsk(false);
    const params: BotParams = { ...p, accounts: accounts.length ? accounts : undefined };
    try {
      const rid = await bot.request({ jobs: [{ id, params }], dryRun });
      toast(`${job.label}${dryRun ? " (uji coba)" : ""} dikirim ke bot cloud · run #${rid}. Status tampil di tab BOT.`, "success", 5000);
      onDone?.();
    } catch (e) {
      toast(`${job.label}: ${(e as Error).message}`, "danger", 7000);
    }
  };

  const last = lastRunFor(bot.runs, id);
  const res = jobResultOf(last, id);
  const blocked = !!bot.active || bot.busy;
  const label = "grid gap-1 text-xs text-fg-2";

  return (
    <div className={`grid gap-3 ${compact ? "w-[min(92vw,360px)]" : ""}`}>
      {compact && (
        <div className="flex items-center gap-2">
          <Icon name={job.icon} size={16} className="text-accent" />
          <span className="text-[13px] font-semibold">{job.label}</span>
        </div>
      )}
      <p className="text-xs text-fg-2">{job.desc}</p>

      {id === "edi.gr" && (
        <div className="flex flex-wrap gap-2">
          <label className={label}>Dari<input type="date" className={`${inputCls} !w-auto`} value={p.start ?? ""} onChange={(e) => set({ start: e.target.value })} /></label>
          <label className={label}>Sampai<input type="date" className={`${inputCls} !w-auto`} value={p.end ?? ""} onChange={(e) => set({ end: e.target.value })} /></label>
        </div>
      )}
      {id === "edi.kwitansi" && (
        <label className={label}>Bulan
          <input type="month" className={`${inputCls} !w-auto`} value={(p.start ?? "").slice(0, 7)}
            onChange={(e) => e.target.value && set({ start: `${e.target.value}-01`, end: `${e.target.value}-01` })} />
        </label>
      )}
      {id === "edi.invoice-inbox" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className={label}>Fitur
            <div className={segGroup} role="group" aria-label="Fitur Inbox">
              {([["completed", "Completed · Create Invoice"], ["new", "New · Accept PFI"]] as const).map(([m, l]) => (
                <button key={m} type="button" aria-pressed={(p.inboxMode ?? "completed") === m} className={segItem((p.inboxMode ?? "completed") === m)}
                  onClick={() => set({ inboxMode: m })}>{l}</button>
              ))}
            </div>
          </div>
          <label className={label}>Maks. per akun (0 = semua)
            <input type="number" min={0} max={200} className={`${inputCls} !w-24`} value={p.limit ?? 0}
              onChange={(e) => set({ limit: Math.min(200, Math.max(0, Math.floor(Number(e.target.value) || 0))) })} />
          </label>
        </div>
      )}
      {users.length > 0 && (
        <div className={label}>
          <span>Akun EDI {accounts.length ? `(${accounts.length} dipilih)` : "(semua akun aktif)"}</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Akun EDI ${job.label}`}>
            {users.map((u) => (
              <button key={u} type="button" aria-pressed={accounts.includes(u)} className={toggleChip(accounts.includes(u))} onClick={() => toggleAcc(u)}>{u}</button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnGhost} disabled={blocked} onClick={() => void run(true)}>
          <Icon name="visibility" />Uji Coba
        </button>
        <button type="button" className={btnPrimary} disabled={blocked} onClick={() => (job.write ? setAsk(true) : void run(false))}>
          <Icon name="play_arrow" />Jalankan
        </button>
        {bot.active && <span className="text-xs text-warning">Run #{bot.active.id} sedang {bot.active.status === "queued" ? "menunggu" : "berjalan"}…</span>}
      </div>
      <LastRun run={last} summary={res?.error ?? res?.summary} />

      {/* Di popover (compact) konfirmasi tampil di tempat: modal di dalam panel kaca akan ikut terpotong panel. */}
      {job.write && compact && ask && (
        <div role="alertdialog" aria-label={`Konfirmasi ${job.label}`} className="grid gap-2 rounded-[12px] border border-warning/40 bg-warning/10 p-3">
          <p className="text-[13px] leading-relaxed">{confirmText(id, { ...p, accounts })}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setAsk(false)}>Batal</button>
            <button type="button" className={btnPrimary} onClick={() => void run(false)}>Ya, jalankan</button>
          </div>
        </div>
      )}
      {job.write && !compact && (
        <Modal open={ask} title={job.label} onClose={() => setAsk(false)}
          footer={<>
            <button type="button" className={btnGhost} onClick={() => setAsk(false)}>Batal</button>
            <button type="button" className={btnPrimary} onClick={() => void run(false)}>Jalankan</button>
          </>}>
          <p className="text-[13px] leading-relaxed">{confirmText(id, { ...p, accounts })}</p>
        </Modal>
      )}
    </div>
  );
}

/** Baris status run terakhir sebuah job. */
export function LastRun({ run, summary }: { run: BotRun | null; summary?: string }) {
  if (!run) return <p className="text-xs text-fg-2">Belum pernah dijalankan dari AR Workspace.</p>;
  const tone = isActive(run.status) ? "text-accent" : run.status === "success" ? "text-success" : run.status === "cancelled" ? "text-fg-2" : "text-danger";
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-2" aria-live="polite">
      <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
        {isActive(run.status) && <Icon name="progress_activity" size={13} className="animate-spin" />}
        {STATUS_LABEL[run.status]}{run.dry_run ? " (uji coba)" : ""}
      </span>
      <span>· #{run.id} · {new Date(run.requested_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })} · {duration(run)}</span>
      {summary && <span>· {summary}</span>}
      {!summary && run.error && <span className="text-danger">· {run.error}</span>}
    </p>
  );
}

/** Titik status kecil untuk tombol ringkas Kertas Kerja. */
export function statusDot(run: BotRun | null) {
  if (!run) return null;
  return isActive(run.status) ? "bg-accent animate-pulse" : run.status === "success" ? "bg-success" : run.status === "cancelled" ? "bg-fg-2" : "bg-danger";
}
