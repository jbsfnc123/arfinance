// Halaman satu job (Jaspersoft / EDI unduh): parameter, jalankan, log, file hasil.
import { useMemo, useState } from "react";
import { inputCls, toggleChip } from "@/components/ui";
import { DEFAULT_PARAMS, jobInfo } from "~/shared/catalog";
import type { JobId, JobParams } from "~/shared/types";
import { useApp } from "../store";
import { Card, Field, FileList, PageHeader, Switch } from "../parts/common";
import { dateParams, initialDates, JobDates, type Dates } from "../parts/dates";
import { JobLog, RunButtons, useSaveConfig } from "../parts/run";

export function JobPage({ id }: { id: JobId }) {
  const { state, history } = useApp();
  const save = useSaveConfig();
  const info = jobInfo(id);
  const cfg = state!.config;
  const saved: JobParams = { ...DEFAULT_PARAMS[id], ...cfg.jobs[id] };
  // Tanggal hanya untuk run ini (tidak disimpan) agar rangkaian terjadwal selalu memakai tanggal hari itu.
  // Terisi default yang sama dengan runner (Send Invoice: Senin s/d hari ini, GR: 30 hari, Kwitansi: bulan ini).
  const [dates, setDates] = useState<Dates | null>(() => initialDates(id));
  const setSaved = (p: JobParams) => save((c) => ({ ...c, jobs: { ...c.jobs, [id]: { ...c.jobs[id], ...p } } }));

  const isEdi = info.group === "edi";
  const accounts = cfg.edi.accounts;
  const chosen = saved.accounts?.length ? saved.accounts : accounts.filter((a) => a.active).map((a) => a.id);
  const spec = useMemo(() => ({ id, params: dateParams(id, dates) }), [id, dates]);

  let reason: string | null = null;
  if (info.group === "jasper" && (!cfg.jasper.username || !state!.secretsSet.includes("jasperPassword"))) reason = "Isi kredensial Jaspersoft di Pengaturan.";
  if (isEdi && !chosen.length) reason = "Tambahkan akun EDI dulu.";

  const lastRun = history.find((r) => r.jobs.some((j) => j.id === id));

  return (
    <div className="grid gap-4">
      <PageHeader title={info.label}>
        <RunButtons jobs={[spec]} pushable={info.pushable && !!saved.push} disabledReason={reason} />
      </PageHeader>
      {reason && <p className="text-[13px] text-warning">{reason}</p>}

      <Card title="Parameter">
        <div className="flex flex-wrap items-end gap-4">
          {info.pushable && (
            <Switch checked={!!saved.push} onChange={(v) => setSaved({ push: v })} label="Kirim ke AR Workspace" />
          )}
          {id === "jasper.sj" && (
            <Field label="Rentang hari (termasuk hari ini)" className="w-48">
              <input className={inputCls} type="number" min={1} max={31} value={saved.days ?? 7}
                onChange={(e) => setSaved({ days: Math.min(31, Math.max(1, Number(e.target.value) || 7)) })} />
            </Field>
          )}
          <JobDates id={id} value={dates} onChange={setDates} />
        </div>
        {isEdi && (
          <div className="mt-4 grid gap-1.5">
            <span className="text-xs text-fg-2">Akun</span>
            <div className="flex flex-wrap gap-1.5">
              {accounts.length === 0 && <span className="text-[13px] text-fg-2">Belum ada akun.</span>}
              {accounts.map((a) => {
                const on = chosen.includes(a.id);
                return (
                  <button key={a.id} type="button" aria-pressed={on} className={toggleChip(on)}
                    onClick={() => setSaved({ accounts: on ? chosen.filter((x) => x !== a.id) : [...chosen, a.id] })}>
                    {a.label || a.username}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card title="Log"><JobLog jobId={id} /></Card>
      <FileList job={id} refreshKey={lastRun?.finishedAt} />
    </div>
  );
}
