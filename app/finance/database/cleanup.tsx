"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { LocalTable, type LCol } from "@/lib/local/table";
import { Modal } from "@/components/modal";
import { TableBox } from "@/components/table-box";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, emptyTd, inputCls, td, th } from "@/components/ui";
import { fmtTimestamp, monthLabel } from "@/lib/format";
import { todayJakarta } from "@/lib/parsers/date";
import { chunkKeys, CLEANUP_CATEGORIES, CLEANUP_GROUP_LABEL, defaultCutoff, type CleanupCategory, type CleanupGroup } from "@/lib/modules/cleanup";

type Overview = {
  categories: { category: string; count: number }[];
  agingAt: { month: string; at: string } | null;
  log: { at: string; mode: string; category: string; rows: number; by_name: string; detail: Record<string, unknown> | null }[];
};
type Row = { key: string; label: string; info: string; at: string | null };
const COLS: LCol<Row>[] = [{ k: "label", l: "Data" }, { k: "info", l: "Keterangan", wrap: true }, { k: "at", l: "Tanggal", d: true }];
const n = (v: number) => v.toLocaleString("id-ID");
const catLabel = (k: string) => CLEANUP_CATEGORIES.find((c) => c.key === k)?.label ?? (k === "tidak_permanen" ? "Data tidak permanen (otomatis)" : k === "impor_database_lama" ? "Impor database lama" : k);

// Pembersihan database (khusus Super Admin): pilih kategori → pratinjau baris kandidat → centang → hapus.
// Server hanya menghapus baris yang MASIH memenuhi syarat kategori, dan setiap penghapusan dicatat.
export function CleanupSection() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [cutoff, setCutoff] = useState(() => defaultCutoff(todayJakarta()));
  const [ov, setOv] = useState<Overview | null>(null);
  const [ovErr, setOvErr] = useState<string | null>(null);
  const [cat, setCat] = useState<CleanupCategory | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<{ keys: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc("cleanup_overview" as never, { p_cutoff: cutoff } as never);
    if (error) { setOvErr(error.message); return; }
    setOvErr(null); setOv(data as unknown as Overview);
  }, [supabase, cutoff]);
  useEffect(() => { void loadOverview(); }, [loadOverview]); // eslint-disable-line react-hooks/set-state-in-effect -- muat ringkasan dari server saat dibuka / tanggal batas berubah

  const loadRows = useCallback(async (c: CleanupCategory) => {
    setRows(null);
    const { data, error } = await fetchAll<Row>((from, to) =>
      supabase.rpc("cleanup_preview" as never, { p_category: c.key, p_cutoff: cutoff } as never).range(from, to) as never);
    if (error) { toast(`Gagal memuat pratinjau: ${error.message}`, "danger", 7000); setRows([]); return; }
    setRows(data);
  }, [supabase, cutoff, toast]);

  function open(c: CleanupCategory) { setCat(c); void loadRows(c); }

  async function confirmDelete() {
    if (!cat || !pending) return;
    setBusy(true);
    let total = 0;
    try {
      for (const part of chunkKeys(pending.keys)) {
        const { data, error } = await supabase.rpc("cleanup_delete" as never, { p_category: cat.key, p_keys: part, p_cutoff: cutoff } as never);
        if (error) throw new Error(error.message);
        total += Number(data ?? 0);
      }
      toast(`${n(total)} baris ${cat.label} dihapus.`, "success", 7000);
    } catch (e) {
      toast(`Gagal menghapus (${n(total)} baris sempat terhapus): ${(e as Error).message}`, "danger", 9000);
    } finally {
      setBusy(false); setPending(null);
      await Promise.all([loadOverview(), loadRows(cat)]);
    }
  }

  const count = (k: string) => Number(ov?.categories.find((c) => c.category === k)?.count ?? 0);
  // Kategori "arsip" (ERP, mutasi) tidak lagi dihapus permanen di sini: dipindah ke Arsip ke Google Drive (Fase 66).
  const groups = (["aging", "teknis"] as CleanupGroup[]).map((g) => ({ g, cats: CLEANUP_CATEGORIES.filter((c) => c.group === g) }));

  return (
    <section className={`${card} space-y-4 p-4`} aria-labelledby="cleanup-title">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="cleanup-title" className="font-medium">Pembersihan Data</h2>
        <span className="text-xs text-fg-2">
          {ov?.agingAt ? `Acuan: Aging ${monthLabel(ov.agingAt.month)} (diperbarui ${fmtTimestamp(ov.agingAt.at)})` : "Aging belum ada"}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-fg-2">Tanggal batas arsip</span>
          <input type="date" value={cutoff} onChange={(e) => e.target.value && setCutoff(e.target.value)} className={`${inputCls} !w-auto`} />
        </label>
      </div>
      {ovErr && <p className="text-sm text-danger" role="alert">Gagal memuat: {ovErr}</p>}


      {groups.map(({ g, cats }) => (
        <div key={g}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-2">{CLEANUP_GROUP_LABEL[g]}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {cats.map((c) => {
              const k = count(c.key);
              return (
                <button key={c.key} type="button" onClick={() => open(c)} aria-pressed={cat?.key === c.key}
                  className={`rounded-xl border p-3 text-left transition-colors ${cat?.key === c.key ? "border-accent bg-selection" : "border-line bg-surface-2 hover:bg-fg/[0.04]"}`}>
                  <div className="text-[13px] font-medium">{c.label}</div>
                  <div className={`mt-1 text-lg tabular-nums ${k > 0 ? "" : "text-fg-2"}`}>{ov ? n(k) : "…"} <span className="text-xs text-fg-2">baris</span></div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {cat && (
        <div className="space-y-2 border-t border-line pt-4">
          <div>
            <h3 className="font-medium">{cat.label}</h3>
            {cat.risk && <p className="mt-1 text-xs text-warning">Perhatian: {cat.risk}</p>}
          </div>
          <LocalTable title={`Pembersihan ${cat.label}`} stateKey={`cleanup-${cat.key}`} rows={rows ?? []} cols={COLS} rowKey={(r) => r.key}
            loading={rows === null} fill={false} maxHeight="max-h-[55vh]" search={["label", "info"]} selectable
            emptyText="Tidak ada data yang perlu dibersihkan di kategori ini."
            actions={(sel) => (
              <button type="button" className={btnPrimary} onClick={() => setPending({ keys: sel.map((r) => r.key) })}>Hapus {n(sel.length)} terpilih…</button>
            )} />
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Riwayat pembersihan</h3>
        <TableBox bare fill={false} maxHeight="max-h-[35vh]">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line"><th className={th}>Waktu</th><th className={th}>Cara</th><th className={th}>Kategori</th><th className={`${th} text-right`}>Baris</th><th className={th}>Oleh</th></tr></thead>
            <tbody>
              {(ov?.log ?? []).map((l, i) => (
                <tr key={i} className="border-b border-line/50">
                  <td className={td}>{fmtTimestamp(l.at)}</td><td className={td}>{l.mode}</td><td className={td}>{catLabel(l.category)}</td>
                  <td className={`${td} text-right tabular-nums`}>{n(l.rows)}</td><td className={td}>{l.mode === "otomatis" ? "Sistem (upload Aging)" : l.by_name}</td>
                </tr>
              ))}
              {!ov?.log.length && <tr><td className={emptyTd} colSpan={5}>Belum ada pembersihan.</td></tr>}
            </tbody>
          </table>
        </TableBox>
      </div>

      <Modal open={!!pending} title={`Hapus ${cat?.label ?? ""}`} onClose={() => setPending(null)}
        footer={(<>
          <button type="button" className={btnGhost} onClick={() => setPending(null)} disabled={busy}>Batal</button>
          <button type="button" className={`${btnPrimary} !bg-danger`} onClick={() => void confirmDelete()} disabled={busy}>{busy ? "Menghapus…" : `Hapus ${n(pending?.keys.length ?? 0)} baris`}</button>
        </>)}>
        <div className="space-y-2 text-sm">
          <p>{n(pending?.keys.length ?? 0)} baris <b>{cat?.label}</b> akan dihapus permanen dari database dan tidak bisa dikembalikan.</p>
          {cat?.risk && <p className="text-warning">Perhatian: {cat.risk}</p>}
        </div>
      </Modal>
    </section>
  );
}
