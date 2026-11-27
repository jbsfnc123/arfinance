"use client";

import { Fragment } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { progressView, type BotRun } from "@/lib/modules/m10/bot";
import type { Bot } from "./use-bot";

// KPI progres run bot yang sedang berjalan (Fase 94): "Receiving · Akun 1/4 · ✓Login › Download CSV › Upload CSV",
// "Inbox Completed · Create Invoice 1/10". Tampil di baris judul Kertas Kerja & kartu Upload Faktur selama run aktif.
export function BotProgress({ run, bot }: { run: BotRun | null; bot: Bot }) {
  const toast = useToast();
  const v = run ? progressView(run) : null;
  if (!run || !v) return null;
  const cancel = async () => {
    try { await bot.cancel(run.id); toast(`Run #${run.id} dibatalkan.`, "success"); } catch (e) { toast(`Batal gagal: ${(e as Error).message}`, "danger", 6000); }
  };
  return (
    <div role="status" aria-live="polite" aria-label="Progres BOT"
      className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full border border-accent/30 bg-accent/10 py-0.5 pl-2.5 pr-1 text-xs">
      <Icon name="progress_activity" size={13} className="animate-spin text-accent" />
      <span className="font-semibold text-accent">{v.title}</span>
      {v.account && <span className="tabular-nums text-fg-2">· {v.account}</span>}
      {v.note && <span className="text-fg-2">· {v.note}</span>}
      {v.steps.length > 0 && <span className="text-fg-2">·</span>}
      {v.steps.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && <span aria-hidden className="text-fg-2/60">›</span>}
          <span className={`inline-flex items-center gap-0.5 tabular-nums ${s.state === "now" ? "font-semibold text-fg" : s.state === "done" ? "text-success" : "text-fg-2"} ${s.state === "skip" ? "line-through opacity-60" : ""}`}
            aria-current={s.state === "now" ? "step" : undefined}>
            {s.state === "done" && <Icon name="check" size={12} strokeWidth={2.5} />}
            {s.label}{s.count && <span className="ml-0.5 rounded-full bg-accent/15 px-1.5 text-accent">{s.count}</span>}
          </span>
        </Fragment>
      ))}
      <button type="button" onClick={() => void cancel()} title={`Batalkan run #${run.id}`} aria-label={`Batalkan run #${run.id}`}
        className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-fg-2 hover:bg-fg/10 hover:text-danger pointer-coarse:h-11 pointer-coarse:w-11">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
