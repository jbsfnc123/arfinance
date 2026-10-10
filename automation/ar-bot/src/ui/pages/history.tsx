// Riwayat run: filter status, cari, detail log & screenshot galat.
import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { emptyTd, inputCls, segGroup, segItem, tableCls, td, th } from "@/components/ui";
import { jobInfo } from "~/shared/catalog";
import type { RunEvent, RunRecord } from "~/shared/types";
import { api, fmtDur, fmtTime, withToken } from "../api";
import { useApp } from "../store";
import { Card, LogView, PageHeader, StatusChip } from "../parts/common";

const FILTERS = [["all", "Semua"], ["ok", "Berhasil"], ["bad", "Gagal"], ["schedule", "Jadwal"]] as const;

export function HistoryPage() {
  const { history } = useApp();
  const [f, setF] = useState<(typeof FILTERS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const rows = useMemo(() => history.filter((r) => {
    if (f === "ok" && r.status !== "ok") return false;
    if (f === "bad" && !["failed", "partial", "cancelled"].includes(r.status)) return false;
    if (f === "schedule" && r.trigger !== "schedule") return false;
    if (!q) return true;
    const s = `${r.chainName ?? ""} ${r.jobs.map((j) => `${jobInfo(j.id).label} ${j.summary ?? ""} ${j.error ?? ""}`).join(" ")}`.toLowerCase();
    return s.includes(q.toLowerCase());
  }), [history, f, q]);
  const show = async (r: RunRecord) => {
    setOpen(r);
    setEvents(await api<RunEvent[]>(`/api/run-events?id=${r.runId}`).catch(() => []));
  };

  return (
    <div className="grid gap-4">
      <PageHeader title="Riwayat" />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className={segGroup} role="group" aria-label="Filter status">
            {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={f === k} className={segItem(f === k)} onClick={() => setF(k)}>{l}</button>)}
          </div>
          <input className={`${inputCls} max-w-xs`} placeholder="Cari" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari riwayat" />
          <span className="text-xs text-fg-2">{rows.length} run</span>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={th}>Mulai</th><th className={th}>Pemicu</th><th className={th}>Job</th><th className={th}>Durasi</th><th className={th}>Status</th>
            </tr></thead>
            <tbody>
              {!rows.length && <tr><td colSpan={5} className={emptyTd}>Belum ada riwayat.</td></tr>}
              {rows.map((r) => (
                <tr key={r.runId} className="cursor-pointer" onClick={() => show(r)}>
                  <td className={td}>{fmtTime(r.startedAt)}</td>
                  <td className={td}>{r.trigger === "schedule" ? "Jadwal" : "Manual"}{r.chainName ? ` · ${r.chainName}` : ""}{r.parallel ? " · paralel" : ""}{r.dryRun ? " · uji coba" : ""}</td>
                  <td className={`${td} whitespace-normal`}>
                    <div className="flex flex-wrap gap-1">
                      {r.jobs.map((j) => <span key={j.id} className="inline-flex items-center gap-1 text-xs">{jobInfo(j.id).short}<StatusChip status={j.status} /></span>)}
                    </div>
                  </td>
                  <td className={td}>{fmtDur(r.startedAt, r.finishedAt)}</td>
                  <td className={td}><StatusChip status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!open} title={open ? `Run ${fmtTime(open.startedAt)}` : ""} onClose={() => setOpen(null)} wide>
        {open && (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              {open.jobs.map((j) => (
                <div key={j.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <StatusChip status={j.status} /><b>{jobInfo(j.id).label}</b>
                  {j.summary && <span className="text-fg-2">{j.summary}</span>}
                  {j.error && <span className="text-danger">{j.error}</span>}
                  {j.shot && <a className="text-accent underline" href={withToken(`/api/shot?name=${encodeURIComponent(j.shot)}`)} target="_blank" rel="noreferrer">Screenshot</a>}
                </div>
              ))}
            </div>
            <LogView events={events} height="h-96" />
          </div>
        )}
      </Modal>
    </div>
  );
}
