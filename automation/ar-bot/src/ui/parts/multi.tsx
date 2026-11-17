// Dashboard › "Jalankan beberapa task": centang beberapa task, atur urutan jalan (seret ⠿ atau ↑/↓), atur tanggal
// (terisi default), jalankan paralel/berurutan. Task beraksi tulis di EDI (Upload Faktur, Invoice Inbox, Outbox Invoice)
// memakai pengaturan di halaman menunya, wajib berurutan, dan Jalankan meminta konfirmasi.
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { DEFAULT_PARAMS, JOBS, jobInfo, moveInOrder, multiOrder, orderedSelection } from "~/shared/catalog";
import type { JobId, JobParams, JobSpec } from "~/shared/types";
import { useApp } from "../store";
import { Card, Confirm, Switch } from "./common";
import { dateParams, initialDates, JobDates, type Dates } from "./dates";
import { RunButtons, useSaveConfig } from "./run";

const FAKTUR_MODE: Record<string, string> = { draft: "Upload FP", not_found: "Isi No Invoice+Upload FP", fill: "Isi No Invoice" };

/** Ringkasan pengaturan task beraksi tulis (diatur di halaman menunya). */
function writeInfo(id: JobId, p: JobParams, accountLabel: (id?: string) => string) {
  if (id === "edi.upload-faktur") return `${FAKTUR_MODE[p.mode ?? "draft"]} · akun ${accountLabel(p.accounts?.[0])}`;
  if (id === "edi.invoice-inbox") return `${p.inboxMode === "new" ? "New · Accept" : "Completed · Create Invoice"}${p.limit ? ` · maks. ${p.limit}/akun` : ""}`;
  if (id === "edi.outbox-invoice") return "Create Kuitansi semua invoice Outbox";
  return "";
}

export function MultiRunCard() {
  const { state } = useApp();
  const save = useSaveConfig();
  const cfg = state!.config;
  const order = useMemo(() => multiOrder(cfg.multi.order), [cfg.multi.order]);
  const selected = cfg.multi.jobs.filter((id) => JOBS.some((j) => j.id === id));
  const [dates, setDates] = useState<Partial<Record<JobId, Dates | null>>>(() =>
    Object.fromEntries(JOBS.map((j) => [j.id, initialDates(j.id)])));
  const [drag, setDrag] = useState<JobId | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [ask, setAsk] = useState<(() => void) | null>(null);

  const setMulti = (patch: Partial<typeof cfg.multi>) => save((c) => ({ ...c, multi: { ...c.multi, ...patch } }));
  const toggle = (id: JobId) => setMulti({ jobs: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
  const move = (id: JobId, to: number) => setMulti({ order: moveInOrder(order, id, to) });

  const runOrder = orderedSelection(order, selected);
  const specs: JobSpec[] = useMemo(() => runOrder.map((id) => ({ id, params: dateParams(id, dates[id] ?? null) })),
    [runOrder.join(","), dates]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = (id: JobId): JobParams => ({ ...DEFAULT_PARAMS[id], ...cfg.jobs[id] });
  const pushable = runOrder.some((id) => jobInfo(id).pushable && params(id).push);
  const writes = runOrder.filter((id) => jobInfo(id).confirm);
  // Aksi tulis di EDI dari satu sesi → selalu berurutan.
  const parallel = cfg.multi.parallel && !writes.length;
  const accounts = cfg.edi.accounts;
  const accountLabel = (id?: string) => {
    const a = accounts.find((x) => x.id === id) ?? accounts.find((x) => x.active);
    return a ? a.label || a.username : "-";
  };

  let reason: string | null = null;
  if (!specs.length) reason = "Pilih minimal satu task.";
  else if (specs.some((s) => s.id.startsWith("jasper.")) && (!cfg.jasper.username || !state!.secretsSet.includes("jasperPassword"))) reason = "Isi kredensial Jaspersoft di Pengaturan.";
  else if (specs.some((s) => s.id.startsWith("edi.")) && !accounts.some((a) => a.active)) reason = "Tambahkan akun EDI dulu.";

  return (
    <Card title="Jalankan beberapa task" actions={<>
      <Switch checked={parallel} disabled={writes.length > 0} onChange={(v) => setMulti({ parallel: v })} label="Paralel" />
      <RunButtons jobs={specs} pushable={pushable} parallel={parallel} disabledReason={reason}
        confirm={writes.length ? (go) => setAsk(() => go) : undefined} />
    </>}>
      <p className="mb-2 text-[11px] text-fg-2">
        Seret ⠿ (atau ↑/↓) untuk mengatur urutan jalan — task tercentang dijalankan dari nomor 1.
        {writes.length > 0 && <> Ada task beraksi tulis di EDI → dijalankan <b>berurutan</b>.</>}
      </p>
      <div className="grid gap-1.5" role="list" aria-label="Urutan task">
        {order.map((id, i) => {
          const j = jobInfo(id);
          const on = selected.includes(id);
          const p = params(id);
          const no = runOrder.indexOf(id) + 1;
          const info = j.confirm ? writeInfo(id, p, accountLabel) : "";
          return (
            <div key={id} role="listitem" draggable data-job={id}
              onDragStart={(e) => { setDrag(id); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onDragOver={(e) => { if (drag && drag !== id) { e.preventDefault(); setOver(i); } }}
              onDrop={(e) => { e.preventDefault(); if (drag && drag !== id) move(drag, order.filter((x) => x !== drag).indexOf(id)); setDrag(null); setOver(null); }}
              className={`flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border px-3 py-2 transition-colors ${on ? "border-accent-tint/50 bg-selection/40" : "border-hairline"}
                ${over === i ? "border-t-2 border-t-accent" : ""} ${drag === id ? "opacity-50" : ""}`}>
              <label className="flex min-w-[260px] flex-1 cursor-pointer items-center gap-2 self-center text-[13px]">
                <span className="shrink-0 cursor-grab select-none text-fg-2" aria-hidden>⠿</span>
                <span className={`w-5 text-center text-xs font-semibold tabular-nums ${on ? "text-accent" : "text-transparent"}`}>{on ? no : "·"}</span>
                <input type="checkbox" checked={on} onChange={() => toggle(id)} aria-label={j.label} />
                <Icon name={j.icon} size={17} className="text-accent" />
                <span className="font-medium">{j.label}</span>
                {j.pushable && <span className={`text-xs ${p.push ? "text-success" : "text-fg-2"}`}>{p.push ? "· kirim AR Workspace" : "· hanya unduh"}</span>}
                {j.confirm && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">aksi tulis</span>}
              </label>
              {info && <span className="self-center text-xs text-fg-2">{info} <span className="opacity-70">(atur di halaman menunya)</span></span>}
              {on && id === "jasper.sj" && <span className="self-center text-xs text-fg-2">{p.days ?? 7} hari terakhir</span>}
              {on && <JobDates id={id} value={dates[id] ?? null} compact onChange={(d) => setDates((x) => ({ ...x, [id]: d }))} />}
              <span className="ml-auto flex gap-0.5 self-center">
                <button type="button" className="rounded px-1.5 text-fg-2 hover:bg-fg/8 hover:text-fg disabled:opacity-30" disabled={i === 0}
                  onClick={() => move(id, i - 1)} aria-label={`Naikkan ${j.label}`}>↑</button>
                <button type="button" className="rounded px-1.5 text-fg-2 hover:bg-fg/8 hover:text-fg disabled:opacity-30" disabled={i === order.length - 1}
                  onClick={() => move(id, i + 1)} aria-label={`Turunkan ${j.label}`}>↓</button>
              </span>
            </div>
          );
        })}
      </div>
      <Confirm open={!!ask} title="Jalankan beberapa task" confirmLabel="Jalankan" onClose={() => setAsk(null)} onConfirm={() => ask?.()}>
        Task dijalankan berurutan:
        <ol className="my-2 list-decimal pl-5">
          {runOrder.map((id) => <li key={id}>{jobInfo(id).label}{jobInfo(id).confirm ? <b className="text-warning"> — aksi tulis: {writeInfo(id, params(id), accountLabel)}</b> : null}</li>)}
        </ol>
        Aksi tulis di EDI tidak bisa dibatalkan dari aplikasi — jalankan Uji Coba dulu bila ragu.
      </Confirm>
    </Card>
  );
}
