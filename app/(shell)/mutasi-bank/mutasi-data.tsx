"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cachedQuery } from "@/lib/cache/cached-query";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate, rupiah } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";

type Row = {
  id: number; account: string; tx_date: string; amount: number; keterangan: string | null; catatan: string | null;
  excluded: boolean; excluded_note: string | null;
};
type Status = "" | "dihitung" | "tidak";
const PAGE = 200;
const NOTES = ["Transfer internal", "Salah posting", "Bukan pembayaran customer", "Pengembalian dana"];

// Daftar baris mutasi CR per bulan & rekening (pengganti sheet MUT_xxxx). Transaksi bisa ditandai
// manual "tidak dihitung" sebagai uang masuk; tanda tetap berlaku walau file di-upload ulang.
export function MutasiData({ version, onChanged }: { version: number; onChanged?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState(0);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [note, setNote] = useState(NOTES[0]);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const filterKey = `${month}|${account}|${status}|${query}`;
  const [pageKey, setPageKey] = useState(filterKey);
  if (pageKey !== filterKey) {
    setPageKey(filterKey);
    setPage(0);
    setSel(new Set());
  }

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    supabase.from("bank_accounts").select("code").order("sort").then(({ data }) => setAccounts((data ?? []).map((a) => a.code)));
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const base = () => {
      let r = supabase.from("v_bank_mutations").select("*", { count: "exact" }).gte("tx_date", start).lte("tx_date", end);
      if (account) r = r.eq("account", account);
      if (status) r = r.eq("excluded", status === "tidak");
      if (query) {
        const s = query.replace(/[%,()]/g, " ");
        r = r.or(`keterangan.ilike.%${s}%,catatan.ilike.%${s}%`);
      }
      return r;
    };
    cachedQuery(supabase, {
      key: `mutasi-data:${filterKey}:${page}`, deps: ["mutasi"],
      load: async () => {
        const { data, count, error } = await base().order("tx_date").order("id").range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        return { rows: (data ?? []) as Row[], total: count ?? 0 };
      },
    }).then(({ data }) => {
      if (cancelled) return;
      setRows(data.rows);
      setTotal(data.total);
      setSum(data.rows.reduce((a, r) => a + Number(r.amount), 0));
    }).catch((e: Error) => toast(`Gagal memuat: ${e.message}`, "danger"));
    return () => { cancelled = true; };
  }, [filterKey, month, account, status, query, page, version, nonce, supabase, toast]);

  async function mark(excluded: boolean) {
    setBusy(true);
    const { data, error } = await supabase.rpc("mutasi_set_excluded", { p_ids: [...sel], p_excluded: excluded, p_note: note });
    setBusy(false);
    if (error) return toast(`Gagal: ${error.message}`, "danger");
    toast(excluded ? `${data} transaksi ditandai tidak dihitung.` : `${data} transaksi dihitung kembali.`, "success");
    setSel(new Set());
    setNonce((n) => n + 1);
    onChanged?.();
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
        <span className="ml-auto text-sm text-fg-2">{total.toLocaleString("id-ID")} baris</span>
        <button type="button" className={btnGhost} disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
        <button type="button" className={btnGhost} disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>›</button>
      </div>

      {sel.size > 0 && (
        <div className={`${card} flex flex-wrap items-center gap-2 p-3 text-sm`}>
          <b>{sel.size} dipilih</b>
          <input list="mutasi-exc-notes" value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} !w-64`} placeholder="Alasan" />
          <datalist id="mutasi-exc-notes">{NOTES.map((n) => <option key={n} value={n} />)}</datalist>
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => mark(true)}>
            <span className="material-symbols-outlined !text-base">block</span>Tandai tidak dihitung
          </button>
          <button type="button" className={btnGhost} disabled={busy} onClick={() => mark(false)}>
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
            <tfoot><tr><td colSpan={3} className={`${td} font-medium`}>Total halaman ini</td><td className={`${td} text-right font-medium`}>{rupiah(sum)}</td><td colSpan={3} /></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
