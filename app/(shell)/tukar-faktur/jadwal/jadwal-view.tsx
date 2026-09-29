"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate } from "@/lib/format";
import { groupJadwal, type JadwalRow } from "@/lib/modules/tukar/dashboard";
import { useToast } from "@/components/toast";
import { btnGhost, card, emptyTd, td, th } from "@/components/ui";
import { TableBox } from "@/components/table-box";
import { Tabs } from "@/components/tabs";
import { useViewState } from "@/lib/ui/view-state";
import { LaporanHarian } from "./laporan-harian";
import { Icon } from "@/components/icons";

const TABS = [
  { key: "jadwal", label: "Jadwal", icon: "event" },
  { key: "laporan", label: "Laporan Harian", icon: "summarize" },
] as const;

type Recent = { tanggal: string; kolektor: string; lokasi: number; invoices: number };

// Laporan & Jadwal Kolektor. Tab Jadwal (port view Jadwal Kolektor Aplikasi Utama): navigasi tanggal kirim, invoice per BP
// dengan status tukar faktur, ringkasan 5 hari terakhir. Tab Laporan Harian: pindahan Dashboard Tukar Faktur lama.
export function JadwalView() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState(todayJakarta());
  const [rows, setRows] = useState<JadwalRow[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useViewState<(typeof TABS)[number]["key"]>("jadwal:tab", "jadwal");

  useEffect(() => {
    supabase.rpc("jadwal_dates").then(({ data }) => setDates((data ?? []).map((d) => d.send_date)));
    supabase.rpc("recent_tukar").then(({ data }) => setRecent(data ?? []));
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("jadwal_kolektor", { p_date: date }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast(`Gagal memuat jadwal: ${error.message}`, "danger");
      setRows(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [date, supabase, toast]);

  const groups = useMemo(() => groupJadwal(rows), [rows]);
  const idx = dates.indexOf(date);
  const prev = idx > 0 ? dates[idx - 1] : dates.filter((d) => d < date).at(-1);
  const next = idx >= 0 ? dates[idx + 1] : dates.find((d) => d > date);

  return (
    <div className="w-full space-y-4">
      <h1 className="text-[22px] font-semibold tracking-tight">Laporan &amp; Jadwal Kolektor</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "laporan" ? <LaporanHarian /> : (<>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-fg-2">Tanggal kirim</span>
        <button type="button" className={btnGhost} disabled={!prev} onClick={() => prev && setDate(prev)} aria-label="Tanggal sebelumnya">
          <Icon name="chevron_left" size={20} />
        </button>
        <span className="min-w-28 text-center font-medium">{fmtDate(date)}</span>
        <button type="button" className={btnGhost} disabled={!next} onClick={() => next && setDate(next)} aria-label="Tanggal berikutnya">
          <Icon name="chevron_right" size={20} />
        </button>
        <button type="button" className={btnGhost} onClick={() => setDate(todayJakarta())}>Hari ini</button>
      </div>

      <section className={`${card} overflow-hidden`}>
        <TableBox bare fill={false} maxHeight="max-h-[60vh]">
          <table className="w-full text-sm">
            <thead>
              <tr><th className={th}>Business Partner</th><th className={`${th} text-right`}>Invoice</th><th className={th}>Tukar Faktur</th><th className={th}>Kolektor</th></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.bp}>
                  <tr className="cursor-pointer border-t border-line hover:bg-surface-2" onClick={() => setOpen(open === g.bp ? null : g.bp)}>
                    <td className={td}>
                      <Icon name={open === g.bp ? "expand_less" : "expand_more"} size={16} className="align-middle" /> {g.bp}
                    </td>
                    <td className={`${td} text-right`}>{g.total}</td>
                    <td className={td}>
                      {g.done === 0 ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">In Progress</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${g.done === g.total ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                          {g.done}/{g.total}
                        </span>
                      )}
                    </td>
                    <td className={td}>{g.kolektor ?? "—"}</td>
                  </tr>
                  {open === g.bp && g.items.map((i) => (
                    <tr key={i.invoice_no} className="text-xs text-fg-2">
                      <td className={`${td} pl-10`}>{i.invoice_no}</td>
                      <td className={`${td} text-right`}>{fmtDate(i.invoice_date)}</td>
                      <td className={td}>{i.tukar ? <span className="inline-flex items-center gap-1 text-success"><Icon name="check" size={13} strokeWidth={2.25} />Sudah</span> : "Belum"}</td>
                      <td className={td}>{i.kolektor ?? ""}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {groups.length === 0 && <tr><td className={emptyTd} colSpan={4}>Tidak ada jadwal pada tanggal ini.</td></tr>}
            </tbody>
          </table>
        </TableBox>
      </section>

      <section className={`${card} overflow-hidden`}>
        <h2 className="px-4 pt-4 text-sm font-medium">Tukar Faktur · 5 Hari Terakhir</h2>
        <TableBox bare fill={false} maxHeight="max-h-[50vh]" className="mt-2">
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr><th className={th}>Tanggal</th><th className={th}>Kolektor</th><th className={`${th} text-right`}>Titik Lokasi</th><th className={`${th} text-right`}>Jumlah Invoice</th></tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={`${r.tanggal}-${r.kolektor}`} className="border-t border-line">
                  <td className={td}>{fmtDate(r.tanggal)}</td>
                  <td className={td}>{r.kolektor}</td>
                  <td className={`${td} text-right`}>{r.lokasi}</td>
                  <td className={`${td} text-right`}>{r.invoices}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td className={emptyTd} colSpan={4}>Belum ada data.</td></tr>}
            </tbody>
          </table>
        </TableBox>
      </section>
      </>)}
    </div>
  );
}
