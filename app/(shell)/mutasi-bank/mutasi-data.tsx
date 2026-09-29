"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { optimistic, useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { useToast } from "@/components/toast";
import { LocalTable, type LCol } from "@/lib/local/table";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useViewState } from "@/lib/ui/view-state";
import { Icon } from "@/components/icons";

type Row = {
  id: number; account: string; tx_date: string; amount: number; keterangan: string | null; catatan: string | null;
  excluded: boolean; excluded_note: string | null; status: string;
};
const NOTES = ["Transfer internal", "Salah posting", "Bukan pembayaran customer", "Pengembalian dana"];

const COLS: LCol<Row>[] = [
  { k: "tx_date", l: "Tanggal", d: true, w: 100 },
  { k: "account", l: "Rekening", w: 100 },
  { k: "amount", l: "Jumlah", n: true, sum: true, w: 130 },
  { k: "keterangan", l: "Keterangan", w: 320 },
  { k: "catatan", l: "Catatan", w: 220 },
  {
    k: "status", l: "Status", w: 150,
    text: (r) => (r.excluded ? `Tidak dihitung${r.excluded_note ? ` · ${r.excluded_note}` : ""}` : "Dihitung"),
    render: (r) => r.excluded
      ? <span className="rounded-full bg-danger/20 px-2 py-0.5 text-xs text-danger" title={r.excluded_note ?? ""}>Tidak dihitung{r.excluded_note ? ` · ${r.excluded_note}` : ""}</span>
      : <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">Dihitung</span>,
  },
];

// Daftar baris mutasi CR per bulan (pengganti sheet MUT_xxxx). Transaksi bisa ditandai manual "tidak dihitung"
// sebagai uang masuk; tanda tetap berlaku walau file di-upload ulang.
export function MutasiData() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [month, setMonth] = useViewState("mutasi:data:month", todayJakarta().slice(0, 7));
  const [note, setNote] = useState(NOTES[0]);
  const mutasi = useDataset("mutasi");

  // Filter bulan di sini; rekening, status, cari, sort & total di tabel (semua di browser).
  const accounts = useMemo(() => (mutasi.data?.accounts ?? []).map((a) => a.code), [mutasi.data]);
  const rows: Row[] = useMemo(() => (mutasi.data?.mutations ?? [])
    .filter((r) => r.tx_date.slice(0, 7) === month)
    .map((r) => ({ ...r, status: r.excluded ? "Tidak dihitung" : "Dihitung" })), [mutasi.data, month]);

  // Tandai / batalkan: tampil seketika, disimpan ke server di belakang layar.
  function mark(ids: number[], excluded: boolean) {
    const n = excluded ? note.trim() || null : null;
    optimistic("mutasi", (d) => ({ ...d, mutations: d.mutations.map((m) => (ids.includes(m.id) ? { ...m, excluded, excluded_note: n } : m)) }),
      async () => {
        const { error } = await supabase.rpc("mutasi_set_excluded", { p_ids: ids, p_excluded: excluded, p_note: note });
        if (error) throw error;
      })
      .then(() => toast(excluded ? `${ids.length} transaksi ditandai tidak dihitung.` : `${ids.length} transaksi dihitung kembali.`, "success"))
      .catch((e: Error) => toast(`Gagal: ${e.message}`, "danger"));
  }

  return (
    <LocalTable title={`Mutasi ${month}`} stateKey="mutasi-data" rows={rows} cols={COLS} rowKey={(r) => r.id} loading={!mutasi.data}
      search={["keterangan", "catatan", "account"]}
      filters={[{ k: "account", l: "Rekening", options: accounts }, { k: "status", l: "Status", options: ["Dihitung", "Tidak dihitung"] }]}
      rowClass={(r) => (r.excluded ? "text-fg-2 [&>td:not(:last-child)]:line-through [&>td]:decoration-danger/60" : "")}
      toolbar={<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Bulan" className={`${inputCls} !w-auto`} />}
      selectable
      actions={(sel, clear) => (
        <span className="flex flex-wrap items-center gap-2">
          <input list="mutasi-exc-notes" value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} !w-56`} placeholder="Alasan" aria-label="Alasan" />
          <datalist id="mutasi-exc-notes">{NOTES.map((x) => <option key={x} value={x} />)}</datalist>
          <button type="button" className={btnPrimary} onClick={() => { mark(sel.map((r) => r.id), true); clear(); }}>
            <Icon name="block" size={16} />Tidak dihitung ({sel.length})
          </button>
          <button type="button" className={btnGhost} onClick={() => { mark(sel.map((r) => r.id), false); clear(); }}>
            <Icon name="undo" size={16} />Hitung kembali
          </button>
        </span>
      )} />
  );
}
