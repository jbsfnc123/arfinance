"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { optimistic, useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate, rupiah } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";

type Row = {
  id: number; account: string; tx_date: string; amount: number; keterangan: string | null; catatan: string | null;
  excluded: boolean; excluded_note: string | null;
};
type Status = "" | "dihitung" | "tidak";
const NOTES = ["Transfer internal", "Salah posting", "Bukan pembayaran customer", "Pengembalian dana"];

// Daftar baris mutasi CR per bulan & rekening (pengganti sheet MUT_xxxx). Transaksi bisa ditandai
// manual "tidak dihitung" sebagai uang masuk; tanda tetap berlaku walau file di-upload ulang.
export function MutasiData() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [note, setNote] = useState(NOTES[0]);
  const mutasi = useDataset("mutasi");
  const filterKey = `${month}|${account}|${status}|${query}`;
  const [selKey, setSelKey] = useState(filterKey);
  if (selKey !== filterKey) { setSelKey(filterKey); setSel(new Set()); }

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Filter & total dihitung di browser dari dataset lokal.
  const accounts = useMemo(() => (mutasi.data?.accounts ?? []).map((a) => a.code), [mutasi.data]);
  const rows: Row[] = useMemo(() => (mutasi.data?.mutations ?? []).filter((r) =>
    r.tx_date.slice(0, 7) === month && (!account || r.account === account) &&
    (!status || r.excluded === (status === "tidak")) &&
    (!query || `${r.keterangan ?? ""} ${r.catatan ?? ""}`.toLowerCase().includes(query))), [mutasi.data, month, account, status, query]);
  const sum = rows.reduce((a, r) => a + Number(r.amount), 0);

  // Tandai / batalkan: tampil seketika, disimpan ke server di belakang layar.
  function mark(excluded: boolean) {
    const ids = [...sel];
    const n = excluded ? note.trim() || null : null;
    setSel(new Set());
    optimistic("mutasi", (d) => ({ ...d, mutations: d.mutations.map((m) => (ids.includes(m.id) ? { ...m, excluded, excluded_note: n } : m)) }),
      async () => {
        const { error } = await supabase.rpc("mutasi_set_excluded", { p_ids: ids, p_excluded: excluded, p_note: note });
        if (error) throw error;
      })
      .then(() => toast(excluded ? `${ids.length} transaksi ditandai tidak dihitung.` : `${ids.length} transaksi dihitung kembali.`, "success"))
      .catch((e: Error) => toast(`Gagal: ${e.message}`, "danger"));
  }

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto`} />
        <select value={account} onChange={(e) => setAccount(e.target.value)} className={`${inputCls} !w-auto`}>
          <option value="">Semua rekening</option>
          {accounts.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={`${inputCls} !w-auto`}>
          <option value="">Semua status</option>
          <option value="dihitung">Dihitung</option>
          <option value="tidak">Tidak dihitung</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari keterangan / catatan…" className={`${inputCls} !w-60`} />
        <span className="ml-auto text-sm text-fg-2">{mutasi.data ? `${rows.length.toLocaleString("id-ID")} baris` : "Memuat…"}</span>
      </div>

      {sel.size > 0 && (
        <div className={`${card} flex flex-wrap items-center gap-2 p-3 text-sm`}>
          <b>{sel.size} dipilih</b>
          <input list="mutasi-exc-notes" value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} !w-64`} placeholder="Alasan" />
          <datalist id="mutasi-exc-notes">{NOTES.map((n) => <option key={n} value={n} />)}</datalist>
          <button type="button" className={btnPrimary} onClick={() => mark(true)}>
            <span className="material-symbols-outlined !text-base">block</span>Tandai tidak dihitung
          </button>
          <button type="button" className={btnGhost} onClick={() => mark(false)}>
            <span className="material-symbols-outlined !text-base">undo</span>Hitung kembali
          </button>
          <button type="button" className={`${btnGhost} ml-auto`} onClick={() => setSel(new Set())}>Batal</button>
        </div>
      )}

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>
                <input type="checkbox" checked={allOnPage} onChange={() => setSel(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              <th className={th}>Tanggal</th><th className={th}>Rekening</th><th className={`${th} text-right`}>Jumlah</th>
              <th className={th}>Keterangan</th><th className={th}>Catatan</th><th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-line/50 ${r.excluded ? "text-fg-2 line-through decoration-danger/60" : ""} ${sel.has(r.id) ? "bg-surface-2" : ""}`}>
                <td className={td}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className={td}>{fmtDate(r.tx_date)}</td>
                <td className={td}>{r.account}</td>
                <td className={`${td} text-right`}>{Number(r.amount).toLocaleString("id-ID")}</td>
                <td className={td}>{r.keterangan}</td>
                <td className={td}>{r.catatan}</td>
                <td className={`${td} no-underline`} style={{ textDecoration: "none" }}>
                  {r.excluded
                    ? <span className="rounded-full bg-danger/20 px-2 py-0.5 text-xs text-danger" title={r.excluded_note ?? ""}>Tidak dihitung{r.excluded_note ? ` · ${r.excluded_note}` : ""}</span>
                    : <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">Dihitung</span>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className={`${td} text-fg-2`}>Tidak ada data.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr><td colSpan={3} className={`${td} font-medium`}>Total</td><td className={`${td} text-right font-medium`}>{rupiah(sum)}</td><td colSpan={3} /></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
