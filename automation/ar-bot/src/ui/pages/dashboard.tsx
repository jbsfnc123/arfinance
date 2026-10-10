// Dashboard: ringkasan, run aktif dengan log langsung, status terakhir per bot, rangkaian.
import { Icon } from "@/components/icons";
import { btnGhost } from "@/components/ui";
import { JOBS, nextRun } from "~/shared/catalog";
import type { JobId } from "~/shared/types";
import { fmtTime } from "../api";
import { useApp } from "../store";
import { Card, Kpi, LogView, PageHeader, StatusChip } from "../parts/common";
import { MultiRunCard } from "../parts/multi";
import { RunButtons } from "../parts/run";

export function Dashboard({ go }: { go: (page: string) => void }) {
  const { state, live, history } = useApp();
  const cfg = state!.config;
  const week = Date.now() - 7 * 86_400_000;
  const recent = history.filter((r) => Date.parse(r.startedAt) >= week);
  const next = cfg.chains.map((c) => ({ c, at: nextRun(c.schedule) })).filter((x) => x.at).sort((a, b) => a.at!.getTime() - b.at!.getTime())[0];
  const lastOf = (id: JobId) => {
    for (const r of history) { const j = r.jobs.find((x) => x.id === id && x.status !== "pending"); if (j) return { r, j }; }
    return null;
  };
  const active = state!.active;

  return (
    <div className="grid gap-4">
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Ringkasan">
        <Kpi label="Run 7 hari" value={recent.length} />
        <Kpi label="Berhasil" value={recent.filter((r) => r.status === "ok").length} tone="text-success" />
        <Kpi label="Gagal / sebagian" value={recent.filter((r) => r.status === "failed" || r.status === "partial").length} tone="text-danger" />
        <Kpi label="Jadwal berikutnya" value={next ? `${next.at!.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short" })} ${next.at!.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "-"} />
      </div>

      {active && (
        <Card title={`Sedang berjalan · ${active.chainName ?? "manual"}${active.trigger === "schedule" ? " (jadwal)" : ""}`}
          actions={<RunButtons jobs={active.jobs} />}>
          <LogView events={live.runId === active.runId ? live.events : []} height="h-64" showJob={active.jobs.length > 1} />
        </Card>
      )}

      <MultiRunCard />

      <Card title="Rangkaian">
        <div className="grid gap-2">
          {cfg.chains.map((c) => {
            const at = nextRun(c.schedule);
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{c.name}</div>
                  <div className="truncate text-xs text-fg-2">
                    {c.jobs.map((j) => JOBS.find((x) => x.id === j.id)?.short).join(" → ")} · {at ? `berikutnya ${fmtTime(at.toISOString())}` : "jadwal nonaktif"}
                  </div>
                </div>
                <RunButtons jobs={c.jobs} pushable />
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Status bot" actions={<button type="button" className={btnGhost} onClick={() => go("history")}><Icon name="history" />Riwayat</button>}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {JOBS.map((j) => {
            const l = lastOf(j.id);
            return (
              <button key={j.id} type="button" onClick={() => go(j.id)}
                className="flex items-start gap-3 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-2">
                <Icon name={j.icon} className="mt-0.5 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{j.label}</span>
                    {l && <StatusChip status={l.j.status} />}
                  </div>
                  <div className="truncate text-xs text-fg-2">{l ? `${fmtTime(l.r.startedAt)}${l.j.summary ? ` · ${l.j.summary}` : l.j.error ? ` · ${l.j.error}` : ""}` : "Belum pernah dijalankan"}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
