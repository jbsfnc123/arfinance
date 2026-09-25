"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate } from "@/lib/format";
import { btnGhost, card, inputCls, td, th } from "@/components/ui";

type Row = { id: number; account: string; tx_date: string; amount: number; keterangan: string | null; catatan: string | null };
const PAGE = 200;

// Daftar baris mutasi CR per bulan & rekening (pengganti sheet MUT_xxxx).
export function MutasiData({ version }: { version: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageKey, setPageKey] = useState(`${month}|${account}`);
  if (pageKey !== `${month}|${account}`) {
    setPageKey(`${month}|${account}`);
    setPage(0);
  }

  useEffect(() => {
    supabase.from("bank_accounts").select("code").order("sort").then(({ data }) => setAccounts((data ?? []).map((a) => a.code)));
  }, [supabase]);

  useEffect(() => {
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    let q = supabase.from("bank_mutations").select("*", { count: "exact" })
      .gte("tx_date", start).lte("tx_date", end).order("tx_date").order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (account) q = q.eq("account", account);
    q.then(({ data, count }) => { setRows((data ?? []) as Row[]); setTotal(count ?? 0); });
  }, [month, account, page, version, supabase]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto`} />
        <select value={account} onChange={(e) => setAccount(e.target.value)} className={`${inputCls} !w-auto`}>
          <option value="">Semua rekening</option>
          {accounts.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span className="ml-auto text-sm text-fg-2">{total.toLocaleString("id-ID")} baris</span>
        <button type="button" className={btnGhost} disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
        <button type="button" className={btnGhost} disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>›</button>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line"><th className={th}>Tanggal</th><th className={th}>Rekening</th><th className={`${th} text-right`}>Jumlah</th><th className={th}>Keterangan</th><th className={th}>Catatan</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/50">
                <td className={td}>{fmtDate(r.tx_date)}</td>
                <td className={td}>{r.account}</td>
                <td className={`${td} text-right`}>{Number(r.amount).toLocaleString("id-ID")}</td>
                <td className={td}>{r.keterangan}</td>
                <td className={td}>{r.catatan}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className={`${td} text-fg-2`}>Tidak ada data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
