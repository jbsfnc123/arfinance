"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtTimestamp } from "@/lib/format";
import { card, td, th } from "@/components/ui";

type LogRow = { id: number; kind: string; file_name: string | null; months: string[] | null; rows: number | null; at: string };

// Riwayat upload satu modul (pengganti sheet UploadLog / tblLog).
export function ImportLog({ module, version, limit = 10 }: { module: string; version: number; limit?: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<LogRow[]>([]);

  useEffect(() => {
    supabase.from("import_log").select("id, kind, file_name, months, rows, at")
      .eq("module", module).order("id", { ascending: false }).limit(limit)
      .then(({ data }) => setRows((data ?? []) as LogRow[]));
  }, [module, version, limit, supabase]);

  return (
    <section className={`${card} overflow-x-auto`}>
      <h2 className="px-4 pt-3 text-sm font-medium">Log proses terakhir</h2>
      <table className="mt-2 w-full text-sm">
        <thead><tr className="border-b border-line"><th className={th}>Waktu</th><th className={th}>Proses</th><th className={th}>Keterangan</th><th className={th}>Bulan</th><th className={`${th} text-right`}>Baris</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/50">
              <td className={td}>{fmtTimestamp(r.at)}</td>
              <td className={td}>{r.kind}</td>
              <td className={`${td} max-w-md truncate`} title={r.file_name ?? ""}>{r.file_name}</td>
              <td className={td}>{r.months?.join(", ")}</td>
              <td className={`${td} text-right`}>{(r.rows ?? 0).toLocaleString("id-ID")}</td>
            </tr>
          ))}
          {!rows.length && <tr><td className={`${td} text-fg-2`} colSpan={5}>Belum ada upload.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
