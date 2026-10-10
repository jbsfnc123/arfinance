// Komponen bersama UI AR Bot — gaya dari components/ui.ts AR Workspace.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, cardTitle, chip, emptyTd, tableCls, td, th } from "@/components/ui";
import type { JobStatus, RunEvent, RunStatus } from "~/shared/types";
import { api, fmtClock, fmtSize, fmtTime } from "../api";

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${card} p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className={cardTitle}>{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS: Record<JobStatus | RunStatus, [string, string]> = {
  pending: ["Menunggu", "bg-fill-3 text-fg-2"],
  running: ["Berjalan", "bg-pill text-pill-fg"],
  ok: ["Berhasil", "bg-success/15 text-success"],
  skipped: ["Dilewati", "bg-fill-3 text-fg-2"],
  failed: ["Gagal", "bg-danger/15 text-danger"],
  partial: ["Sebagian", "bg-warning/15 text-warning"],
  cancelled: ["Dihentikan", "bg-warning/15 text-warning"],
};
export function StatusChip({ status }: { status: JobStatus | RunStatus }) {
  const [label, cls] = STATUS[status] ?? [status, "bg-fill-3 text-fg-2"];
  return <span className={`${chip} ${cls}`}>{label}</span>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-[13px] ${disabled ? "opacity-50" : ""}`}>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${checked ? "bg-success" : "bg-fill-3"}`}>
        <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left] ${checked ? "left-[18px]" : "left-[2px]"}`} />
      </button>
      <span>{label}</span>
    </label>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1 text-[13px] ${className}`}>
      <span className="text-xs text-fg-2">{label}</span>
      {children}
    </label>
  );
}

export function Kpi({ label, value, tone = "text-fg" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs text-fg-2">{label}</div>
      <div className={`truncate text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

const LEVEL: Record<string, string> = { info: "text-fg", warn: "text-warning", error: "text-danger", ok: "text-success" };

export function LogView({ events, height = "h-72" }: { events: RunEvent[]; height?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const lines = events.filter((e): e is Extract<RunEvent, { t: "log" }> => e.t === "log");
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [lines.length]);
  const copy = () => {
    void navigator.clipboard.writeText(lines.map((l) => `[${fmtClock(l.at)}] ${l.msg}`).join("\n"));
    toast("Log disalin.", "success");
  };
  return (
    <div className="relative">
      <div ref={box} role="log" aria-live="polite" className={`${height} overflow-auto rounded-xl border border-hairline bg-surface-2 p-3 text-[12px] leading-5`}>
        {!lines.length && <div className="text-fg-2">Belum ada log.</div>}
        {lines.map((l, i) => (
          <div key={i} className={`log-line whitespace-pre-wrap break-words ${LEVEL[l.level]}`}>
            <span className="text-fg-2">{fmtClock(l.at)} </span>{l.msg}
          </div>
        ))}
      </div>
      {lines.length > 0 && (
        <button type="button" onClick={copy} className={`${btnGhost} absolute right-2 top-2`} aria-label="Salin log"><Icon name="file_swap" /></button>
      )}
    </div>
  );
}

export function Confirm({ open, title, children, confirmLabel, danger, onConfirm, onClose }: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}
      footer={<>
        <button type="button" className={btnGhost} onClick={onClose}>Batal</button>
        <button type="button" className={`${btnPrimary} ${danger ? "!bg-danger" : ""}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </>}>
      <div className="text-[13px] leading-6">{children}</div>
    </Modal>
  );
}

export function FileList({ job, refreshKey }: { job: string; refreshKey: unknown }) {
  const [files, setFiles] = useState<{ name: string; size: number; at: string }[] | null>(null);
  const toast = useToast();
  useEffect(() => { api<typeof files>(`/api/files?job=${job}`).then(setFiles).catch(() => setFiles([])); }, [job, refreshKey]);
  const open = (name?: string) => api("/api/open", { target: name ? `downloads/${job}/${name}` : `downloads/${job}` }).catch((e) => toast((e as Error).message, "danger"));
  return (
    <Card title="File hasil" actions={<button type="button" className={btnGhost} onClick={() => open()}><Icon name="folder_open" />Buka folder</button>}>
      <div className="max-h-72 overflow-auto">
        <table className={tableCls}>
          <thead><tr><th className={th}>Nama file</th><th className={`${th} text-right`}>Ukuran</th><th className={th}>Waktu</th></tr></thead>
          <tbody>
            {files?.length === 0 && <tr><td colSpan={3} className={emptyTd}>Belum ada file.</td></tr>}
            {files?.map((f) => (
              <tr key={f.name} className="cursor-pointer" onClick={() => open(f.name)} title="Tampilkan di Explorer">
                <td className={`${td} max-w-[420px] truncate`}>{f.name}</td>
                <td className={`${td} text-right`}>{fmtSize(f.size)}</td>
                <td className={td}>{fmtTime(f.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
