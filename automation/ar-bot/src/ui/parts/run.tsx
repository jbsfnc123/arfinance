// Kontrol run & log: tombol Jalankan / Uji Coba / Hentikan, dan log run aktif atau run terakhir sebuah job.
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary } from "@/components/ui";
import type { Config, JobId, JobSpec, RunEvent } from "~/shared/types";
import { api } from "../api";
import { useApp } from "../store";
import { LogView, StatusChip } from "./common";

/** Simpan sebagian konfigurasi lalu perbarui status aplikasi. */
export function useSaveConfig() {
  const { state, setState } = useApp();
  const toast = useToast();
  return async (patch: (c: Config) => Config, okMsg?: string) => {
    if (!state) return;
    try {
      setState(await api("/api/config", patch(structuredClone(state.config))));
      if (okMsg) toast(okMsg, "success");
    } catch (e) { toast((e as Error).message, "danger"); }
  };
}

export function RunButtons({ jobs, pushable, confirm, disabledReason }: {
  jobs: JobSpec[]; pushable?: boolean; confirm?: (go: () => void) => void; disabledReason?: string | null;
}) {
  const { state, run, stop } = useApp();
  const toast = useToast();
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = state?.active;
  const mine = !!active && jobs.some((j) => active.jobs.some((a) => a.id === j.id));
  const start = async (dryRun: boolean) => {
    setBusy(true);
    try {
      await run({ jobs, dryRun, force: pushable ? force : false });
      toast(dryRun ? "Uji coba dimulai." : "Bot dimulai.", "info");
    } catch (e) { toast((e as Error).message, "danger", 6000); } finally { setBusy(false); }
  };
  if (mine) {
    return (
      <button type="button" className={`${btnPrimary} !bg-danger`} onClick={() => stop().then(() => toast("Meminta bot berhenti…", "warning"))}>
        <Icon name="pause_circle" />Hentikan
      </button>
    );
  }
  const blocked = !!active || busy || !!disabledReason;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pushable && (
        <label className="mr-1 inline-flex items-center gap-1.5 text-xs text-fg-2">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Paksa kirim ulang
        </label>
      )}
      <button type="button" className={btnGhost} disabled={blocked} onClick={() => start(true)}><Icon name="fact_check" />Uji Coba</button>
      <button type="button" className={btnPrimary} disabled={blocked} title={disabledReason ?? (active ? "Bot lain sedang berjalan" : undefined)}
        onClick={() => (confirm ? confirm(() => start(false)) : start(false))}>
        <Icon name="send" />Jalankan
      </button>
    </div>
  );
}

/** Log untuk job ini: run aktif bila job ini sedang berjalan, selain itu run terakhir yang memuat job ini. */
export function JobLog({ jobId }: { jobId: JobId }) {
  const { state, live, history } = useApp();
  const activeHere = !!state?.active?.jobs.some((j) => j.id === jobId);
  const last = history.find((r) => r.jobs.some((j) => j.id === jobId));
  const [events, setEvents] = useState<RunEvent[]>([]);
  useEffect(() => {
    if (activeHere || !last) return;
    api<RunEvent[]>(`/api/run-events?id=${last.runId}`).then(setEvents).catch(() => setEvents([]));
  }, [activeHere, last?.runId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = activeHere && live.runId === state?.active?.runId ? live.events : events;
  const res = last?.jobs.find((j) => j.id === jobId);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
        {activeHere ? <StatusChip status="running" /> : res ? <StatusChip status={res.status} /> : null}
        {!activeHere && last && <span>Terakhir {new Date(last.startedAt).toLocaleString("id-ID")}{res?.summary ? ` · ${res.summary}` : ""}</span>}
        {!activeHere && res?.error && <span className="text-danger">{res.error}</span>}
      </div>
      <LogView events={shown} />
    </div>
  );
}
