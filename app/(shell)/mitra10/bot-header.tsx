"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Popover } from "@/components/popover";
import { BOT_JOBS, lastRunFor, STATUS_LABEL, type BotJobId } from "@/lib/modules/m10/bot";
import { BotJobForm, statusDot } from "./bot-job-form";
import { BotProgress } from "./bot-progress";
import type { Bot } from "./use-bot";

type QuickId = Exclude<BotJobId, "edi.upload-faktur">;
const QUICK = BOT_JOBS.filter((j): j is (typeof BOT_JOBS)[number] & { id: QuickId } => j.id !== "edi.upload-faktur");

// Tombol ringkas BOT di kanan atas Kertas Kerja (Fase 93): Receiving · Kwitansi · Inbox · Outbox dalam satu grup segmen.
// Klik → popover berisi form job yang sama dengan tab BOT. Titik kecil = status run terakhir job itu.
export function BotHeader({ bot, users }: { bot: Bot; users: string[] }) {
  const [open, setOpen] = useState<QuickId | null>(null);
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:ml-auto">
    {/* Fase 94: KPI progres run aktif tepat sebelum tombol BOT. */}
    <BotProgress run={bot.active} bot={bot} />
    <div className="relative flex flex-wrap items-center gap-1.5" role="group" aria-label="BOT EDI Mitra10">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-2"><Icon name="smart_toy" size={15} />BOT</span>
      <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-fill-3 p-[3px]">
        {QUICK.map((j) => {
          const last = lastRunFor(bot.runs, j.id);
          const dot = statusDot(last);
          return (
            <button key={j.id} type="button" data-popover-anchor aria-haspopup="dialog" aria-expanded={open === j.id}
              title={`${j.label}${last ? ` — terakhir: ${STATUS_LABEL[last.status]}` : ""}`}
              className={`inline-flex min-h-6 items-center gap-1 rounded-[8px] px-2.5 py-0.5 text-xs transition-colors pointer-coarse:min-h-11 ${open === j.id ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-2 hover:bg-surface/60 hover:text-fg"}`}
              onClick={() => setOpen((o) => (o === j.id ? null : j.id))}>
              <Icon name={j.icon} size={14} />{j.short}
              {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
            </button>
          );
        })}
      </div>
      <Popover open={!!open} onClose={() => setOpen(null)} label={open ? BOT_JOBS.find((j) => j.id === open)!.label : "BOT"}
        className="right-0 top-full mt-1.5 p-3.5 max-sm:fixed max-sm:left-2 max-sm:right-2 max-sm:top-auto max-sm:bottom-[calc(var(--dock-reserve)+8px)]">
        {open && <BotJobForm key={open} id={open} bot={bot} users={users} compact onDone={() => setOpen(null)} />}
      </Popover>
    </div>
    </div>
  );
}
