"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { btnGhost, card, cardTitle, emptyTd, tableCls, td, th } from "@/components/ui";
import { BOT_JOBS, duration, isActive, runSummary, STATUS_LABEL, type BotRun } from "@/lib/modules/m10/bot";
import { BotProgress } from "./bot-progress";
import { FakturPanel } from "./faktur-panel";
import type { Bot } from "./use-bot";

const TONE: Record<BotRun["status"], string> = {
  queued: "bg-accent/15 text-accent", running: "bg-accent/15 text-accent", success: "bg-success/20 text-success",
  partial: "bg-warning/20 text-warning", failed: "bg-danger/20 text-danger", cancelled: "bg-surface-2 text-fg-2",
};

// Riwayat Run tampil/sembunyi — diingat per browser (localStorage), bawaan tersembunyi (Fase 94).
const HIST_KEY = "mitra10:bot:history-shown";
const histListeners = new Set<() => void>();
const readHist = () => { try { return localStorage.getItem(HIST_KEY) === "1"; } catch { return false; } };
export function useHistoryShown(): [boolean, (v: boolean) => void] {
  const shown = useSyncExternalStore((fn) => { histListeners.add(fn); return () => { histListeners.delete(fn); }; }, readHist, () => false);
  return [shown, (v) => {
    try { if (v) localStorage.setItem(HIST_KEY, "1"); else localStorage.removeItem(HIST_KEY); } catch { /* opsional */ }
    histListeners.forEach((fn) => fn());
  }];
}

// Tab BOT Mitra10 Tukar Faktur (Fase 93/94): Upload Faktur Pajak (bot cloud). Receiving, Kwitansi, Inbox, Outbox dijalankan
// dari tombol BOT di kanan atas Kertas Kerja. Riwayat Run tersembunyi bawaan.
export function M10Bot({ bot, users }: { bot: Bot; users: string[] }) {
  const [shown, setShown] = useHistoryShown();
  const fakturActive = bot.active?.jobs.some((j) => j.id === "edi.upload-faktur") ? bot.active : null;
  return (
    <div className="grid gap-4">
      <p className="flex items-start gap-2 text-xs text-fg-2">
        <Icon name="smart_toy" size={16} className="mt-px shrink-0 text-accent" />
        Bot berjalan di cloud (tidak perlu AR Bot di PC). Update Receiving, Update Kwitansi, Inbox New/Completed & Outbox Create
        Kuitansi dijalankan dari tombol BOT di kanan atas Kertas Kerja. Uji Coba = hanya membaca/mencari, tanpa mengirim data atau mengubah EDI.
      </p>
      <section className={`${card} p-4`} aria-label="Upload Faktur Pajak">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className={`${cardTitle} flex items-center gap-2`}><Icon name="upload_file" size={16} className="text-accent" />Upload Faktur Pajak</h2>
          <BotProgress run={fakturActive} bot={bot} />
        </div>
        <FakturPanel bot={bot} users={users} />
      </section>
      <div>
        <button type="button" className={btnGhost} aria-expanded={shown} onClick={() => setShown(!shown)}>
          <Icon name={shown ? "visibility_off" : "history"} />{shown ? "Sembunyikan Riwayat Run" : `Tampilkan Riwayat Run (${bot.runs.length})`}
        </button>
      </div>
      {shown && <RunHistory bot={bot} />}
    </div>
  );
}

function RunHistory({ bot }: { bot: Bot }) {
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const cancel = async (id: number) => {
    try { await bot.cancel(id); toast(`Run #${id} dibatalkan.`, "success"); } catch (e) { toast(`Batal gagal: ${(e as Error).message}`, "danger", 6000); }
  };
  return (
    <section className={`${card} p-4`} aria-label="Riwayat Run">
      <div className="mb-2 flex items-center gap-2">
        <h2 className={cardTitle}>Riwayat Run</h2>
        <span className="text-xs text-fg-2">20 terakhir</span>
        <button type="button" className={`${btnGhost} ml-auto`} onClick={() => void bot.reload()}><Icon name="refresh" />Muat ulang</button>
      </div>
      {bot.error && <p className="mb-2 text-xs text-danger">Gagal memuat: {bot.error}</p>}
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead><tr>
            <th className={th}>#</th><th className={th}>Waktu</th><th className={th}>Job</th><th className={th}>Status</th>
            <th className={th}>Durasi</th><th className={th}>Oleh</th><th className={th}>Ringkasan</th><th className={th} />
          </tr></thead>
          <tbody>
            {!bot.runs.length && <tr><td colSpan={8} className={emptyTd}>{bot.loaded ? "Belum ada run." : "Memuat…"}</td></tr>}
            {bot.runs.map((r) => (
              <RunRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onCancel={() => void cancel(r.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunRow({ r, open, onToggle, onCancel }: { r: BotRun; open: boolean; onToggle: () => void; onCancel: () => void }) {
  return (
    <>
      <tr>
        <td className={td}>{r.id}</td>
        <td className={td}>{new Date(r.requested_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</td>
        <td className={td}>{r.jobs.map((j) => BOT_JOBS.find((b) => b.id === j.id)?.label ?? j.id).join(", ")}{r.dry_run && <span className="ml-1 text-[11px] text-accent">uji coba</span>}</td>
        <td className={td}>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[r.status]}`}>
            {isActive(r.status) && <Icon name="progress_activity" size={12} className="animate-spin" />}{STATUS_LABEL[r.status]}
          </span>
        </td>
        <td className={td}>{duration(r)}</td>
        <td className={td}>{r.requested_name}</td>
        <td className={`${td} max-w-[28rem] whitespace-normal text-xs text-fg-2`}>{r.error && !isActive(r.status) ? <span className="text-danger">{r.error}</span> : runSummary(r)}</td>
        <td className={`${td} text-right`}>
          <span className="inline-flex gap-1.5">
            {isActive(r.status) && <button type="button" className={btnGhost} onClick={onCancel}><Icon name="cancel" />Batalkan</button>}
            <button type="button" className={btnGhost} aria-expanded={open} onClick={onToggle} disabled={!r.log_tail}><Icon name={open ? "expand_less" : "expand_more"} />Log</button>
          </span>
        </td>
      </tr>
      {open && r.log_tail && (
        <tr><td colSpan={8} className="px-3 pb-3">
          <pre className="max-h-72 overflow-auto rounded-lg bg-fill-3 p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap">{r.log_tail}</pre>
        </td></tr>
      )}
    </>
  );
}
