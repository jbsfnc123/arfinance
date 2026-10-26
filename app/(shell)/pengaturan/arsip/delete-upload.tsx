"use client";

// Hapus Data Upload per periode (Fase 71, Super Admin): pilih jenis data & periode → pratinjau (baris · nominal) → unduh
// cadangan Excel → ketik periode untuk konfirmasi → hapus. Periode yang dikunci (Target periode Closed, Aging aktif / dipakai
// periode Open) tidak bisa dipilih. Bila periode sudah diarsip ke Drive, arsipnya bisa ikut dihapus (bila tidak, halaman tetap
// memuat bulan itu dari arsip). RPC: upload_data_overview / upload_data_export / upload_data_delete.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { rupiah } from "@/lib/format";
import { downloadXlsxSheets } from "@/lib/xlsx-client";
import { ARCHIVE_OF, confirmText, periodLabel, rowsToSheet, type UploadDataset } from "@/lib/archive/upload-delete";

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
const PAGE = 5000;

export function DeleteUploadSection() {
  const toast = useToast();
  const rpc = useMemo<Rpc>(() => { const sb = createClient(); return (fn, args) => sb.rpc(fn as never, args as never) as never; }, []);
  const [list, setList] = useState<UploadDataset[] | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [ds, setDs] = useState("mutasi");
  const [period, setPeriod] = useState("");
  const [busy, setBusy] = useState<"" | "backup" | "delete">("");
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState("");
  const [withArchive, setWithArchive] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await rpc("upload_data_overview");
    if (error) { if (error.code === "42501") setAllowed(false); else toast(`Hapus Data Upload: ${error.message}`, "danger", 8000); return; }
    setList(data as UploadDataset[]);
  }, [rpc, toast]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- muat ringkasan periode saat dibuka

  const cur = list?.find((d) => d.dataset === ds) ?? null;
  const per = cur?.periods.find((p) => p.period === period) ?? null;
  const archDs = ARCHIVE_OF[ds];

  const backup = async () => {
    if (!cur || !per) return;
    setBusy("backup");
    try {
      const rows: Record<string, unknown>[] = [];
      for (let off = 0; off < per.rows; off += PAGE) {
        const { data, error } = await rpc("upload_data_export", { p_dataset: ds, p_period: period, p_offset: off, p_limit: PAGE });
        if (error) throw new Error(error.message);
        rows.push(...(data as Record<string, unknown>[]));
      }
      await downloadXlsxSheets(`Cadangan ${cur.label} ${period}.xlsx`, [{ name: cur.label, rows: rowsToSheet(rows) }]);
    } catch (e) { toast(`Gagal mengunduh cadangan: ${(e as Error).message}`, "danger", 8000); }
    finally { setBusy(""); }
  };

  const doDelete = async () => {
    if (!cur || !per) return;
    setBusy("delete");
    try {
      const { data, error } = await rpc("upload_data_delete", { p_dataset: ds, p_period: period, p_expect_rows: per.rows });
      if (error) throw new Error(error.message);
      const r = data as { rows: number; amount: number };
      let extra = "";
      if (withArchive && per.archived && archDs) {
        const archPeriod = ds === "aging" ? null : period; // arsip Aging berkunci id snapshot — snapshot sudah terhapus
        if (archPeriod) {
          const res = await fetch("/api/archive/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataset: archDs, period: archPeriod }) });
          const j = await res.json() as { removed?: number; error?: string };
          extra = res.ok ? ` · arsip Drive dihapus (${j.removed})` : ` · arsip Drive GAGAL dihapus: ${j.error}`;
        }
      }
      toast(`${cur.label} ${periodLabel(period)}: ${r.rows.toLocaleString("id-ID")} baris dihapus${cur.hasAmount ? ` (${rupiah(r.amount)})` : ""}${extra}.`, "success", 9000);
      setAsk(false); setTyped(""); setPeriod(""); setWithArchive(false);
      await load();
    } catch (e) { toast(`Gagal menghapus: ${(e as Error).message}`, "danger", 9000); }
    finally { setBusy(""); }
  };

  if (!allowed) return null;
  return (
    <section className={`${card} space-y-3 p-4`} aria-labelledby="hapus-upload-title">
      <div>
        <h2 id="hapus-upload-title" className="font-medium">Hapus Data Upload</h2>
        <p className="text-xs text-fg-2">Bersihkan data hasil upload file per periode. Penghapusan permanen — unduh cadangan Excel dulu.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-fg-2">Jenis data
          <select className={`${inputCls} !w-64`} value={ds} onChange={(e) => { setDs(e.target.value); setPeriod(""); }} aria-label="Jenis data yang dihapus">
            {(list ?? []).map((d) => <option key={d.dataset} value={d.dataset}>{d.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-fg-2">Periode {cur && <span className="text-fg-2">({cur.unit})</span>}
          <select className={`${inputCls} !w-80`} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Periode yang dihapus" disabled={!cur?.periods.length}>
            <option value="">{!list ? "Memuat…" : cur?.periods.length ? "Pilih periode" : "Tidak ada data"}</option>
            {cur?.periods.map((p) => (
              <option key={p.period} value={p.period} disabled={!!p.locked}>
                {periodLabel(p.period)} · {p.rows.toLocaleString("id-ID")} baris{cur.hasAmount ? ` · ${rupiah(p.amount)}` : ""}{p.archived ? " · diarsip" : ""}{p.locked ? ` — ${p.locked}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btnGhost} disabled={!per || !!busy} onClick={() => void backup()}>
          <Icon name="download" />{busy === "backup" ? "Menyiapkan…" : "Unduh cadangan Excel"}
        </button>
        <button type="button" className={`${btnPrimary} !bg-danger`} disabled={!per || !!busy} onClick={() => { setTyped(""); setWithArchive(false); setAsk(true); }}>
          <Icon name="delete" />Hapus periode
        </button>
      </div>
      {per && (
        <p className="text-[13px]">
          Akan dihapus: <b>{per.rows.toLocaleString("id-ID")} baris</b>{cur?.hasAmount && <> · <b>{rupiah(per.amount)}</b></>} — {cur?.label}, {periodLabel(period)}.
          {per.archived && <span className="text-warning"> Periode ini sudah diarsip ke Google Drive.</span>}
        </p>
      )}

      <Modal open={ask} title="Hapus data upload" onClose={() => setAsk(false)}
        footer={<>
          <button type="button" className={btnGhost} onClick={() => setAsk(false)}>Batal</button>
          <button type="button" className={`${btnPrimary} !bg-danger`} disabled={typed.trim() !== confirmText(period) || busy === "delete"} onClick={() => void doDelete()}>
            {busy === "delete" ? "Menghapus…" : "Hapus permanen"}
          </button>
        </>}>
        {cur && per && (
          <div className="space-y-3 text-[13px]">
            <p><b>{per.rows.toLocaleString("id-ID")} baris</b> {cur.label} periode <b>{periodLabel(period)}</b>{cur.hasAmount && <> ({rupiah(per.amount)})</>} akan dihapus permanen dari database. Semua menu yang memakai data ini ikut berubah.</p>
            {per.archived && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p>Periode ini punya arsip Google Drive — tanpa menghapus arsipnya, halaman seperti Mutasi Bank / History Pembayaran tetap menampilkan bulan ini dari arsip.</p>
                {ds !== "aging" && (
                  <label className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={withArchive} onChange={(e) => setWithArchive(e.target.checked)} />
                    Hapus juga arsip Google Drive periode ini
                  </label>
                )}
              </div>
            )}
            <label className="grid gap-1"><span>Ketik <b className="font-mono">{confirmText(period)}</b> untuk konfirmasi</span>
              <input className={`${inputCls} font-mono`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Konfirmasi periode" data-autofocus />
            </label>
          </div>
        )}
      </Modal>
    </section>
  );
}
