// Rangkaian & Jadwal: susun urutan job, atur hari/jam, daftarkan ke Task Scheduler Windows.
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls, toggleChip } from "@/components/ui";
import { JOBS, nextRun, WEEKDAYS } from "~/shared/catalog";
import type { Chain, JobId } from "~/shared/types";
import { api, fmtTime } from "../api";
import { useApp } from "../store";
import { Card, Confirm, Field, PageHeader, Switch } from "../parts/common";
import { RunButtons, useSaveConfig } from "../parts/run";

type TaskRow = { chainId: string; task: { state: string; next: string | null; last: string | null; lastResult: number | null } | null };
const CHAINABLE = JOBS.filter((j) => !j.confirm);

export function ChainsPage() {
  const { state } = useApp();
  const save = useSaveConfig();
  const toast = useToast();
  const chains = state!.config.chains;
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [edit, setEdit] = useState<Chain | null>(null);
  const [del, setDel] = useState<Chain | null>(null);
  const reload = () => api<TaskRow[]>("/api/schedules").then(setTasks).catch((e) => toast((e as Error).message, "danger"));
  useEffect(() => { void reload(); }, [chains]); // eslint-disable-line react-hooks/exhaustive-deps

  const store = async (c: Chain) => {
    const exists = chains.some((x) => x.id === c.id);
    await save((cfg) => ({ ...cfg, chains: exists ? cfg.chains.map((x) => (x.id === c.id ? c : x)) : [...cfg.chains, c] }));
    try {
      await api("/api/schedule/apply", { chainId: c.id });
      toast(c.schedule.enabled ? "Rangkaian disimpan & jadwal Windows diperbarui." : "Rangkaian disimpan; jadwal Windows dinonaktifkan.", "success");
    } catch (e) { toast(`Jadwal Windows gagal: ${(e as Error).message}`, "danger", 8000); }
    setEdit(null);
    void reload();
  };
  const remove = async (c: Chain) => {
    await api("/api/schedule/remove", { chainId: c.id }).catch(() => {});
    await save((cfg) => ({ ...cfg, chains: cfg.chains.filter((x) => x.id !== c.id) }), "Rangkaian dihapus.");
  };

  return (
    <div className="grid gap-4">
      <PageHeader title="Rangkaian & Jadwal">
        <button type="button" className={btnPrimary} onClick={() => setEdit({ id: `rangkaian-${Date.now().toString(36)}`, name: "", jobs: [], schedule: { enabled: false, days: [1, 2, 3, 4, 5], time: "10:00" } })}>
          <Icon name="add" />Rangkaian
        </button>
      </PageHeader>
      {chains.map((c) => {
        const t = tasks.find((x) => x.chainId === c.id)?.task;
        const at = nextRun(c.schedule);
        return (
          <Card key={c.id} title={c.name} actions={<>
            <RunButtons jobs={c.jobs} pushable />
            <button type="button" className={btnGhost} onClick={() => setEdit(structuredClone(c))}><Icon name="edit" />Ubah</button>
            <button type="button" className={btnGhost} onClick={() => setDel(c)} aria-label={`Hapus ${c.name}`}><Icon name="delete" /></button>
          </>}>
            <div className="grid gap-1 text-[13px]">
              <div>{c.jobs.map((j) => JOBS.find((x) => x.id === j.id)?.label).join(" → ") || "-"}</div>
              <div className="text-fg-2">
                {c.schedule.enabled ? `${WEEKDAYS.filter((w) => c.schedule.days.includes(w.d)).map((w) => w.short).join(", ")} · ${c.schedule.time}` : "Jadwal nonaktif"}
                {at && ` · berikutnya ${fmtTime(at.toISOString())}`}
              </div>
              <div className="text-xs text-fg-2">
                Task Scheduler: {t ? `${t.state === "Ready" ? "terdaftar" : t.state}${t.last ? ` · terakhir ${fmtTime(t.last)}` : ""}` : c.schedule.enabled ? "belum terdaftar — buka Ubah lalu Simpan" : "tidak terdaftar"}
              </div>
            </div>
          </Card>
        );
      })}
      {edit && <ChainEditor chain={edit} onCancel={() => setEdit(null)} onSave={store} />}
      <Confirm open={!!del} title="Hapus rangkaian" confirmLabel="Hapus" danger onClose={() => setDel(null)} onConfirm={() => del && remove(del)}>
        Rangkaian <b>{del?.name}</b> dan jadwal Windows-nya dihapus.
      </Confirm>
    </div>
  );
}

function ChainEditor({ chain, onSave, onCancel }: { chain: Chain; onSave: (c: Chain) => void; onCancel: () => void }) {
  const [c, setC] = useState(chain);
  const ids = c.jobs.map((j) => j.id);
  const toggle = (id: JobId) => setC({ ...c, jobs: ids.includes(id) ? c.jobs.filter((j) => j.id !== id) : [...c.jobs, { id }] });
  const move = (i: number, d: -1 | 1) => {
    const jobs = [...c.jobs];
    const j = i + d;
    if (j < 0 || j >= jobs.length) return;
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
    setC({ ...c, jobs });
  };
  const valid = c.name.trim() && c.jobs.length && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.schedule.time);
  return (
    <Card title={chain.name ? `Ubah ${chain.name}` : "Rangkaian baru"} className="ring-2 ring-accent-tint/40">
      <div className="grid gap-4">
        <Field label="Nama" className="max-w-sm"><input className={inputCls} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
        <div className="grid gap-1.5">
          <span className="text-xs text-fg-2">Job</span>
          <div className="flex flex-wrap gap-1.5">
            {CHAINABLE.map((j) => <button key={j.id} type="button" aria-pressed={ids.includes(j.id)} className={toggleChip(ids.includes(j.id))} onClick={() => toggle(j.id)}>{j.label}</button>)}
          </div>
        </div>
        {c.jobs.length > 1 && (
          <div className="grid gap-1">
            <span className="text-xs text-fg-2">Urutan</span>
            {c.jobs.map((j, i) => (
              <div key={j.id} className="flex items-center gap-2 text-[13px]">
                <span className="w-5 text-fg-2">{i + 1}.</span><span className="flex-1">{JOBS.find((x) => x.id === j.id)?.label}</span>
                <button type="button" className={btnGhost} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Naik"><Icon name="expand_less" /></button>
                <button type="button" className={btnGhost} disabled={i === c.jobs.length - 1} onClick={() => move(i, 1)} aria-label="Turun"><Icon name="expand_more" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <Switch checked={c.schedule.enabled} onChange={(v) => setC({ ...c, schedule: { ...c.schedule, enabled: v } })} label="Jadwal otomatis" />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hari">
            {WEEKDAYS.map((w) => {
              const on = c.schedule.days.includes(w.d);
              return <button key={w.d} type="button" aria-pressed={on} className={toggleChip(on)}
                onClick={() => setC({ ...c, schedule: { ...c.schedule, days: on ? c.schedule.days.filter((d) => d !== w.d) : [...c.schedule.days, w.d].sort() } })}>{w.short}</button>;
            })}
          </div>
          <Field label="Jam" className="w-32"><input className={inputCls} type="time" value={c.schedule.time} onChange={(e) => setC({ ...c, schedule: { ...c.schedule, time: e.target.value } })} /></Field>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnPrimary} disabled={!valid} onClick={() => onSave({ ...c, name: c.name.trim() })}><Icon name="save" />Simpan</button>
          <button type="button" className={btnGhost} onClick={onCancel}>Batal</button>
        </div>
      </div>
    </Card>
  );
}
