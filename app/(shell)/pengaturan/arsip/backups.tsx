"use client";

// Cadangan mingguan tabel master (Super Admin): daftar file di Drive, cadangkan sekarang, unduh sebagai Excel.
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, emptyTd, tableCls, td, th } from "@/components/ui";
import { fmtTimestamp } from "@/lib/format";
import { fmtBytes } from "@/lib/modules/usage";
import { downloadXlsxSheets } from "@/lib/xlsx-client";

type BackupFile = { id: string; name: string; size: number; updated: string };

export function BackupsSection() {
  const toast = useToast();
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/backup/list");
    if (r.status === 403) { setAllowed(false); return; }
    const j = await r.json() as { files?: BackupFile[]; error?: string };
    if (!r.ok) { toast(`Cadangan: ${j.error}`, "danger"); setFiles([]); return; }
    setFiles(j.files ?? []);
  }, [toast]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- muat daftar cadangan dari Drive saat dibuka

  const backupNow = async () => {
    setBusy("now");
    const r = await fetch("/api/backup/weekly", { method: "POST" });
    const j = await r.json() as { ok?: boolean; tables?: number; rows?: number; bytes?: number; error?: string };
    setBusy(null);
    if (!r.ok || !j.ok) { toast(`Gagal: ${j.error ?? r.status}`, "danger", 8000); return; }
    toast(`Cadangan dibuat: ${j.tables} tabel · ${j.rows?.toLocaleString("id-ID")} baris · ${fmtBytes(j.bytes ?? 0)}.`, "success", 7000);
    await load();
  };

  const download = async (f: BackupFile) => {
    setBusy(f.id);
    try {
      const r = await fetch(`/api/backup/read?id=${encodeURIComponent(f.id)}`);
      const j = await r.json() as { tables?: Record<string, Record<string, unknown>[]>; error?: string };
      if (!r.ok || !j.tables) throw new Error(j.error ?? `HTTP ${r.status}`);
      const sheets = Object.entries(j.tables).filter(([, rows]) => rows.length).map(([name, rows]) => {
        const cols = [...new Set(rows.flatMap((x) => Object.keys(x)))];
        return { name, rows: [cols, ...rows.map((x) => cols.map((c) => { const v = x[c]; return v !== null && typeof v === "object" ? JSON.stringify(v) : v; }))] };
      });
      await downloadXlsxSheets(`Cadangan AR Workspace ${f.name.replace(/\.json\.gz$/, "")}`, sheets);
    } catch (e) {
      toast(`Gagal mengunduh: ${(e as Error).message}`, "danger", 8000);
    } finally { setBusy(null); }
  };

  if (!allowed) return null;
  return (
    <section className={`${card} space-y-3 p-4`} aria-labelledby="backup-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="backup-title" className="font-medium">Cadangan mingguan</h2>
        <button type="button" className={`${btnPrimary} ml-auto`} disabled={!!busy} onClick={backupNow}>
          <Icon name="cloud_upload" />{busy === "now" ? "Mencadangkan…" : "Cadangkan sekarang"}
        </button>
      </div>
      <div className="max-h-80 overflow-auto rounded-xl border border-hairline">
        <table className={tableCls}>
          <thead><tr><th className={th}>Cadangan</th><th className={`${th} text-right`}>Ukuran</th><th className={th}>Diperbarui</th><th className={th} /></tr></thead>
          <tbody>
            {files === null && <tr><td colSpan={4} className={emptyTd}>Memuat…</td></tr>}
            {files?.length === 0 && <tr><td colSpan={4} className={emptyTd}>Belum ada cadangan.</td></tr>}
            {files?.map((f) => (
              <tr key={f.id}>
                <td className={td}>{f.name.replace(/\.json\.gz$/, "")}</td>
                <td className={`${td} text-right`}>{fmtBytes(f.size)}</td>
                <td className={td}>{fmtTimestamp(f.updated)}</td>
                <td className={`${td} text-right`}>
                  <button type="button" className={btnGhost} disabled={!!busy} onClick={() => download(f)}>
                    <Icon name="download" />{busy === f.id ? "Mengunduh…" : "Excel"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
