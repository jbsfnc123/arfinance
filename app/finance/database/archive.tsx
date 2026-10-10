"use client";

// Arsip ke Google Drive (Fase 66): data historis yang melewati masa simpan dipindah ke Drive — ekspor, simpan &
// verifikasi, catat, lalu hapus dari Supabase. Urutan per dataset mengikuti ARCHIVE_DATASETS (Pembayaran dulu: invoice
// baru menjadi kandidat setelah pembayarannya diarsip).
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ARCHIVE_DATASETS, archiveInfo, type ArchiveCandidate, type ArchiveEntry } from "@/lib/archive/datasets";
import { fmtTimestamp, rupiah } from "@/lib/format";
import { fmtBytes } from "@/lib/modules/usage";
import { btnGhost, btnPrimary, card, emptyTd, tableCls, td, th } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icons";

type Status = { configured: boolean; ok: boolean; folder?: string; error?: string };
type RunResult = { rows: number; dbRows: number; bytes: number; merged: boolean; deleted: number | null; error?: string };

const n = (v: number) => v.toLocaleString("id-ID");
const periodLabel = (c: { dataset: string; period: string; label: string | null }) => c.label ?? c.period;

export function ArchiveSection() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [cands, setCands] = useState<ArchiveCandidate[] | null>(null);
  const [list, setList] = useState<ArchiveEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ArchiveCandidate[] | null>(null);

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      supabase.rpc("archive_candidates" as never),
      supabase.rpc("archive_list" as never, { p_dataset: null } as never),
    ]);
    if (c.error) { setErr(c.error.message); return; }
    setErr(null);
    const rows = (c.data as unknown as ArchiveCandidate[]).slice()
      .sort((a, b) => archiveInfo(a.dataset)!.order - archiveInfo(b.dataset)!.order || a.period.localeCompare(b.period));
    setCands(rows);
    setList((l.data as unknown as ArchiveEntry[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- muat kandidat & riwayat arsip dari server saat dibuka
    fetch("/api/archive/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ configured: false, ok: false, error: "tidak terjangkau" }));
  }, [load]);

  const runOne = async (c: ArchiveCandidate): Promise<RunResult> => {
    const res = await fetch("/api/archive/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset: c.dataset, period: c.period, label: c.label, purge: true }),
    });
    const out = await res.json() as RunResult;
    if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
    return out;
  };

  /** Arsipkan daftar; setelah satu dataset selesai, muat ulang kandidat (dataset berikutnya bisa bertambah). */
  const run = async (items: ArchiveCandidate[]) => {
    setLog([]);
    const say = (m: string) => setLog((x) => [...x, m]);
    let ok = 0, fail = 0;
    for (const c of items) {
      const name = `${archiveInfo(c.dataset)!.label} ${periodLabel(c)}`;
      setBusy(`${c.dataset}:${c.period}`);
      try {
        const r = await runOne(c);
        ok++;
        say(`✓ ${name}: ${n(r.dbRows)} baris diarsip${r.merged ? ` (digabung, total ${n(r.rows)})` : ""} · ${fmtBytes(r.bytes)} di Drive · ${n(r.deleted ?? 0)} baris dihapus dari Supabase`);
      } catch (e) {
        fail++;
        say(`✗ ${name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    await load();
    toast(fail ? `${ok} berhasil, ${fail} gagal.` : `${ok} periode diarsip ke Google Drive.`, fail ? "warning" : "success", 7000);
  };

  const purge = async (e: ArchiveEntry) => {
    setBusy(`purge:${e.id}`);
    const { data, error } = await supabase.rpc("archive_purge" as never, { p_id: e.id } as never);
    setBusy(null);
    toast(error ? error.message : `${n(Number(data))} baris dihapus dari Supabase.`, error ? "danger" : "success", 7000);
    await load();
  };

  const pending = cands ?? [];
  const totalRows = pending.reduce((s, c) => s + c.rows, 0);

  return (
    <section aria-labelledby="archive-title" className={`${card} space-y-4 p-4`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="archive-title" className="font-medium">Arsip ke Google Drive</h2>
        <span className={`text-xs ${status?.ok ? "text-success" : "text-danger"}`}>
          {!status ? "Memeriksa Drive…" : status.ok ? "● Drive terhubung" : `● Drive: ${status.error}`}
        </span>
        {status?.folder && <a href={status.folder} target="_blank" rel="noreferrer" className="text-xs text-accent underline">Buka folder arsip</a>}
        <button type="button" className={`${btnPrimary} ml-auto`} disabled={!status?.ok || !!busy || !pending.length}
          onClick={() => setConfirm(pending)}>
          <Icon name="cloud_upload" />Arsipkan semua ({n(totalRows)} baris)
        </button>
      </div>
      {err && <p className="text-sm text-danger" role="alert">Gagal memuat: {err}</p>}

      <div className="max-h-96 overflow-auto rounded-xl border border-hairline">
        <table className={tableCls}>
          <thead><tr>
            <th className={th}>Data</th><th className={th}>Periode</th><th className={`${th} text-right`}>Baris</th>
            <th className={`${th} text-right`}>Nominal</th><th className={th}>Arsip</th><th className={th} />
          </tr></thead>
          <tbody>
            {cands && !pending.length && <tr><td colSpan={6} className={emptyTd}>Tidak ada data yang melewati masa simpan.</td></tr>}
            {!cands && <tr><td colSpan={6} className={emptyTd}>Memuat…</td></tr>}
            {pending.map((c) => (
              <tr key={`${c.dataset}:${c.period}`}>
                <td className={td}>{archiveInfo(c.dataset)?.label}</td>
                <td className={td}>{periodLabel(c)}</td>
                <td className={`${td} text-right`}>{n(c.rows)}</td>
                <td className={`${td} text-right`}>{rupiah(c.amount)}</td>
                <td className={`${td} text-fg-2`}>{c.archived ? `${n(c.archived.rows)} baris · ${fmtTimestamp(c.archived.at)}` : "-"}</td>
                <td className={`${td} text-right`}>
                  <button type="button" className={btnGhost} disabled={!status?.ok || !!busy} onClick={() => setConfirm([c])}>
                    {busy === `${c.dataset}:${c.period}` ? "Mengarsip…" : "Arsipkan"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {log.length > 0 && (
        <div className="rounded-xl border border-hairline bg-surface-2 p-3 text-[12px] leading-5" role="log">
          {log.map((l, i) => <div key={i} className={l.startsWith("✗") ? "text-danger" : "text-success"}>{l}</div>)}
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-fg-2">Riwayat arsip ({list.length})</summary>
        <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-hairline">
          <table className={tableCls}>
            <thead><tr><th className={th}>Data</th><th className={th}>Periode</th><th className={`${th} text-right`}>Baris</th>
              <th className={`${th} text-right`}>Ukuran</th><th className={th}>Diarsip</th><th className={th}>Supabase</th></tr></thead>
            <tbody>
              {!list.length && <tr><td colSpan={6} className={emptyTd}>Belum ada arsip.</td></tr>}
              {list.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{archiveInfo(e.dataset)?.label}</td>
                  <td className={td}>{e.label ?? e.period}</td>
                  <td className={`${td} text-right`}>{n(e.rows)}</td>
                  <td className={`${td} text-right`}>{fmtBytes(e.bytes)}</td>
                  <td className={td}>{fmtTimestamp(e.createdAt)}</td>
                  <td className={td}>{e.purgedAt ? <span className="text-success">dihapus {fmtTimestamp(e.purgedAt)}</span> : (
                    <button type="button" className={btnGhost} disabled={!!busy} onClick={() => purge(e)}>Hapus dari Supabase</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <Modal open={!!confirm} title="Arsipkan ke Google Drive" onClose={() => setConfirm(null)}
        footer={<>
          <button type="button" className={btnGhost} onClick={() => setConfirm(null)}>Batal</button>
          <button type="button" className={btnPrimary} onClick={() => { const c = confirm!; setConfirm(null); void run(c); }}>Arsipkan</button>
        </>}>
        {confirm && (
          <div className="space-y-2 text-[13px] leading-6">
            <p>{confirm.length} periode · {n(confirm.reduce((s, c) => s + c.rows, 0))} baris akan disimpan ke Google Drive, diverifikasi,
              lalu <b>dihapus dari Supabase</b>. Datanya tetap bisa dibuka dari menu Arsip Data.</p>
            <ul className="max-h-48 list-disc overflow-auto pl-5 text-fg-2">
              {ARCHIVE_DATASETS.map((d) => {
                const items = confirm.filter((c) => c.dataset === d.id);
                return items.length ? <li key={d.id}>{d.label}: {items.map(periodLabel).join(", ")}</li> : null;
              })}
            </ul>
          </div>
        )}
      </Modal>
    </section>
  );
}
