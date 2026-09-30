"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LocalTable, type LCol } from "@/lib/local/table";
import { Modal } from "@/components/modal";
import { TableBox } from "@/components/table-box";
import { useToast } from "@/components/toast";
import { btnGhost, emptyTd, segGroup, segItem, td, th } from "@/components/ui";
import { fmtDate, fmtTimestamp } from "@/lib/format";
import { downloadXlsx } from "@/lib/xlsx-client";
import {
  eventRoles, historyRows, HISTORY_HEADER, ROLE_LABEL, STATUS_DONE, STATUS_OPEN, type SjEvent, type SjRow,
} from "@/lib/modules/sj/compute";
import type { SjState } from "./use-sj";
import { PeriodFilter, periodText, type Quick } from "./sj-view";

const OK = "bg-success/20 text-success";
const WAIT = "bg-warning/20 text-warning";

const COLS: LCol<SjRow>[] = [
  { k: "sj_no", l: "SJ No." }, // diganti tombol di dalam komponen (bisa dibuka lewat keyboard)
  { k: "tanggal_sj", l: "Tanggal SJ", d: true, text: (r) => (r.tanggal_sj ? fmtDate(r.tanggal_sj) : r.tanggal_sj_raw ?? "") },
  { k: "area", l: "Area" },
  { k: "business_partner", l: "Business Partner", w: 220 },
  { k: "locator", l: "Locator" },
  { k: "status", l: "Status", badge: { [STATUS_DONE]: OK, [STATUS_OPEN]: WAIT } },
  { k: "receiver", l: "Receiver diakui" },
  { k: "receive_date", l: "Receive Date", d: true },
  { k: "durasi", l: "Durasi (hari)", n: true },
  { k: "umur", l: "Umur belum diterima (hari)", n: true },
  { k: "laporan", l: "Jumlah laporan", n: true },
  { k: "flag_text", l: "Penanda", wrap: true },
];
const QUICK: { k: Quick; l: string }[] = [
  { k: "", l: "Semua" }, { k: "open", l: STATUS_OPEN }, { k: "cek", l: "Data perlu diperiksa" },
];

// Kertas Kerja: satu baris per SJ unik (hasil filter sama dengan Dashboard). Klik baris → riwayat semua baris sumber.
export function SjWorksheet({ s, quick, setQuick, focus, setFocus }: {
  s: SjState; quick: Quick; setQuick: (q: Quick) => void; focus: string; setFocus: (k: string) => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<SjRow | null>(null);
  const [shown, setShown] = useState<SjRow[]>([]);
  // Fokus dari Dashboard: tampilkan SJ itu saja (walau di luar periode) dan langsung buka riwayatnya.
  const focused = useMemo(() => (focus ? s.rows.find((r) => r.sj_key === focus) ?? null : null), [focus, s.rows]);
  const [closedFocus, setClosedFocus] = useState("");
  const shownDetail = detail ?? (focused && closedFocus !== focus ? focused : null);

  const rows = useMemo(() => {
    if (focused) return [focused];
    return s.filtered.filter((r) => (quick === "open" ? r.status === STATUS_OPEN : quick === "cek" ? r.perlu_cek : true));
  }, [focused, s.filtered, quick]);
  const receivers = useMemo(() => [...new Set(rows.map((r) => r.receiver ?? ""))].filter(Boolean).sort(), [rows]);
  // SJ No. = tombol (Tab + Enter/Spasi membuka riwayat); klik baris tetap berfungsi untuk mouse.
  const cols = useMemo<LCol<SjRow>[]>(() => [{
    k: "sj_no", l: "SJ No.",
    render: (r) => (
      <button type="button" className="text-accent underline-offset-2 hover:underline" aria-label={`Riwayat ${r.sj_no}`}
        onClick={(e) => { e.stopPropagation(); setDetail(r); }}>{r.sj_no}</button>
    ),
  }, ...COLS.slice(1)], []);

  async function exportHistory() {
    try {
      const up = new Map((s.ds.data?.batches ?? []).map((b) => [b.id, `${b.file_name} · ${fmtTimestamp(b.published_at)}`]));
      const body = historyRows(shown, s.eventsByKey, s.recognized, (id) => up.get(id) ?? `#${id}`);
      await downloadXlsx(`Riwayat Surat Jalan ${s.today}`, "Riwayat sumber", [[...HISTORY_HEADER], ...body]);
      toast(`${shown.length.toLocaleString("id-ID")} SJ · ${body.length.toLocaleString("id-ID")} baris sumber diekspor.`, "success");
    } catch (e) { toast(`Gagal ekspor: ${(e as Error).message}`, "danger", 6000); }
  }

  return (
    <div className="space-y-3">
      {focused ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-pill px-2.5 py-0.5 text-xs text-pill-fg">Filter SJ: {focused.sj_no}</span>
          <button type="button" className={btnGhost} onClick={() => setFocus("")}>Hapus filter SJ</button>
        </div>
      ) : (
        <>
          <PeriodFilter s={s} />
          <div className="flex flex-wrap items-center gap-3">
            <div className={segGroup} role="group" aria-label="Filter cepat">
              {QUICK.map((q) => (
                <button key={q.k || "all"} type="button" aria-pressed={quick === q.k} className={segItem(quick === q.k)} onClick={() => setQuick(q.k)}>{q.l}</button>
              ))}
            </div>
            <span className="text-xs text-fg-2">{periodText(s)}</span>
          </div>
        </>
      )}
      <LocalTable title="Kertas Kerja" hideKey="sj-kk" stateKey="sj-kk" rows={rows} cols={cols} rowKey={(r) => r.sj_key}
        loading={s.loading} onRowsChange={setShown} onRowClick={setDetail}
        defaultHidden={["locator"]} defaultSort={{ k: "tanggal_sj", dir: -1 }}
        search={["sj_no", "business_partner", "area", "locator", "receiver", "flag_text"]}
        filters={[
          { k: "status", l: "Status", options: [STATUS_DONE, STATUS_OPEN] },
          { k: "receiver", l: "Receiver", options: receivers },
          { k: "area", l: "Area", options: s.areas },
        ]}
        emptyText="Tidak ada SJ yang cocok dengan filter."
        toolbar={(
          <button type="button" className={btnGhost} onClick={exportHistory} disabled={!shown.length}
            title="Semua baris sumber untuk SJ yang tampil, dengan peran tiap baris">
            Ekspor riwayat sumber
          </button>
        )} />
      <SjHistory row={shownDetail} s={s} onClose={() => { setDetail(null); setClosedFocus(focus); }} />
    </div>
  );
}

type FullEvent = SjEvent & { description: string | null; no_route: string | null; driver: string | null; no_plat: string | null; send_date_raw: string | null };

/** Riwayat satu SJ: semua baris sumber (urut sumber) dengan peran/alasan; baris acuan ditandai teks, bukan warna saja. */
function SjHistory({ row, s, onClose }: { row: SjRow | null; s: SjState; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [full, setFull] = useState<{ key: string; events: FullEvent[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = row?.sj_key ?? null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    supabase.rpc("sj_events_of" as never, { p_sj_key: key } as never).then(({ data, error }) => {
      if (!live) return;
      if (error) setErr(error.message);
      else { setErr(null); setFull({ key, events: (data ?? []) as FullEvent[] }); }
    });
    return () => { live = false; };
  }, [key, supabase]);

  const local = key ? s.eventsByKey.get(key) ?? [] : [];
  const seqOf = new Map(local.map((e) => [e.id, e.seq]));
  // Detail lengkap dari server bila sudah ada; sementara pakai data lokal (tanpa Description).
  const events: (SjEvent & Partial<FullEvent>)[] = full && full.key === key
    ? full.events.map((e) => ({ ...e, seq: seqOf.get(e.id) ?? 0 }))
    : local;
  const roles = eventRoles(events, s.recognized);
  const files = new Map((s.ds.data?.batches ?? []).map((b) => [b.id, `${b.file_name} · ${fmtTimestamp(b.published_at)}`]));

  return (
    <Modal open={!!row} title={row ? `Riwayat ${row.sj_no}` : ""} onClose={onClose} xl variant="window">
      {row && (
        <div className="space-y-3 text-sm">
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
            <div><dt className="text-xs text-fg-2">Status</dt><dd className="font-medium">{row.status}</dd></div>
            <div><dt className="text-xs text-fg-2">Receiver diakui (acuan)</dt><dd>{row.receiver ?? "—"}</dd></div>
            <div><dt className="text-xs text-fg-2">Receive Date acuan</dt><dd>{row.receive_date ? fmtDate(row.receive_date) : "—"}</dd></div>
            <div><dt className="text-xs text-fg-2">Tanggal SJ</dt><dd>{row.tanggal_sj ? fmtDate(row.tanggal_sj) : row.tanggal_sj_raw ?? "—"}</dd></div>
            <div><dt className="text-xs text-fg-2">Durasi / umur</dt><dd>{row.durasi !== null ? `${row.durasi} hari` : row.umur !== null ? `${row.umur} hari belum diterima` : "—"}</dd></div>
            <div><dt className="text-xs text-fg-2">Area · Business Partner</dt><dd>{row.area} · {row.business_partner}</dd></div>
          </dl>
          {row.flags.length > 0 && <p className="rounded-lg bg-warning/15 px-3 py-2 text-[13px]"><b>Perlu diperiksa:</b> {row.flag_text}</p>}
          {err && <p className="text-[13px] text-danger" role="alert">Detail lengkap gagal dimuat: {err}</p>}
          <TableBox bare fill={false} maxHeight="max-h-[55vh]">
            <table className="w-full text-[13px] tabular-nums">
              <thead><tr className="border-b border-line">
                <th className={th}>Peran</th><th className={th}>Upload</th><th className={`${th} text-right`}>Baris</th><th className={th}>Send Date</th>
                <th className={th}>Sender</th><th className={th}>Receiver (asli)</th><th className={th}>Receive Date</th><th className={th}>Doc No</th><th className={th}>Description</th>
              </tr></thead>
              <tbody>
                {events.map((e) => {
                  const role = roles.get(e.id)!;
                  return (
                    <tr key={e.id} className={`border-b border-line/50 ${role === "acuan" ? "bg-success/10 font-medium" : ""}`}>
                      <td className={`${td} whitespace-normal`} style={{ minWidth: 200 }}>{role === "acuan" ? "✓ " : ""}{ROLE_LABEL[role]}</td>
                      <td className={`${td} max-w-[16rem] truncate`} title={files.get(e.batch_id) ?? ""}>{files.get(e.batch_id) ?? `#${e.batch_id}`}</td>
                      <td className={`${td} text-right`}>{e.row_no}</td>
                      <td className={td}>{e.send_date ? fmtDate(e.send_date) : e.send_date_raw ?? "—"}</td>
                      <td className={td}>{e.sender ?? "—"}</td>
                      <td className={td}>{e.receiver ?? "—"}</td>
                      <td className={td}>{e.receive_date ? fmtDate(e.receive_date) : e.receive_date_raw && e.receive_date_raw !== "-" ? `${e.receive_date_raw} (tidak valid)` : "—"}</td>
                      <td className={td}>{e.send_receipt_doc_no}</td>
                      <td className={`${td} max-w-[20rem] whitespace-normal`}>{e.description === undefined ? "…" : e.description || "—"}</td>
                    </tr>
                  );
                })}
                {!events.length && <tr><td className={emptyTd} colSpan={9}>Memuat…</td></tr>}
              </tbody>
            </table>
          </TableBox>
          <p className="text-xs text-fg-2">Urutan = urutan sumber (upload lebih awal, lalu nomor baris file). Acuan tidak berubah saat tabel diurutkan.</p>
        </div>
      )}
    </Modal>
  );
}
