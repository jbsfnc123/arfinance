// Dashboard › "Jalankan beberapa task": centang beberapa task, atur tanggal (terisi default), jalankan paralel/berurutan.
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { DEFAULT_PARAMS, JOBS } from "~/shared/catalog";
import type { JobId, JobSpec } from "~/shared/types";
import { useApp } from "../store";
import { Card, Switch } from "./common";
import { dateParams, initialDates, JobDates, type Dates } from "./dates";
import { RunButtons, useSaveConfig } from "./run";

const MULTI = JOBS.filter((j) => !j.confirm);

export function MultiRunCard() {
  const { state } = useApp();
  const save = useSaveConfig();
  const cfg = state!.config;
  const selected = cfg.multi.jobs.filter((id) => MULTI.some((j) => j.id === id));
  const [dates, setDates] = useState<Partial<Record<JobId, Dates | null>>>(() =>
    Object.fromEntries(MULTI.map((j) => [j.id, initialDates(j.id)])));

  const setMulti = (patch: Partial<typeof cfg.multi>) => save((c) => ({ ...c, multi: { ...c.multi, ...patch } }));
  const toggle = (id: JobId) => setMulti({ jobs: selected.includes(id) ? selected.filter((x) => x !== id) : MULTI.map((j) => j.id).filter((x) => x === id || selected.includes(x)) });

  const specs: JobSpec[] = useMemo(() => MULTI.filter((j) => selected.includes(j.id)).map((j) => ({ id: j.id, params: dateParams(j.id, dates[j.id] ?? null) })),
    [selected, dates]);
  const pushable = MULTI.some((j) => selected.includes(j.id) && j.pushable && ({ ...DEFAULT_PARAMS[j.id], ...cfg.jobs[j.id] }).push);

  let reason: string | null = null;
  if (!specs.length) reason = "Pilih minimal satu task.";
  else if (specs.some((s) => s.id.startsWith("jasper.")) && (!cfg.jasper.username || !state!.secretsSet.includes("jasperPassword"))) reason = "Isi kredensial Jaspersoft di Pengaturan.";
  else if (specs.some((s) => s.id.startsWith("edi.")) && !cfg.edi.accounts.some((a) => a.active)) reason = "Tambahkan akun EDI dulu.";

  return (
    <Card title="Jalankan beberapa task" actions={<>
      <Switch checked={cfg.multi.parallel} onChange={(v) => setMulti({ parallel: v })} label="Paralel" />
      <RunButtons jobs={specs} pushable={pushable} parallel={cfg.multi.parallel} disabledReason={reason} />
    </>}>
      <div className="grid gap-2">
        {MULTI.map((j) => {
          const on = selected.includes(j.id);
          const p = { ...DEFAULT_PARAMS[j.id], ...cfg.jobs[j.id] };
          return (
            <div key={j.id} className={`flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border px-3 py-2 ${on ? "border-accent-tint/50 bg-selection/40" : "border-hairline"}`}>
              <label className="flex min-w-[260px] flex-1 cursor-pointer items-center gap-2 self-center text-[13px]">
                <input type="checkbox" checked={on} onChange={() => toggle(j.id)} aria-label={j.label} />
                <Icon name={j.icon} size={17} className="text-accent" />
                <span className="font-medium">{j.label}</span>
                {j.pushable && <span className={`text-xs ${p.push ? "text-success" : "text-fg-2"}`}>{p.push ? "· kirim AR Workspace" : "· hanya unduh"}</span>}
              </label>
              {on && j.id === "jasper.sj" && (
                <span className="self-center text-xs text-fg-2">{p.days ?? 7} hari terakhir</span>
              )}
              {on && <JobDates id={j.id} value={dates[j.id] ?? null} compact onChange={(d) => setDates((x) => ({ ...x, [j.id]: d }))} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
