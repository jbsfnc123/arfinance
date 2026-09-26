"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CHECKLIST, FILES, isFresh, lastOf, type FileKey, type UploadStat } from "@/lib/uploads/checklist";
import { fmtDate, fmtTimestamp } from "@/lib/format";
import { todayJakarta } from "@/lib/parsers/date";
import { card } from "@/components/ui";

// Checklist upload: per menu (ke bawah) daftar file yang dibutuhkan. Tercentang bila sudah di-upload
// hari ini (WIB) — atau bulan ini untuk Target & Master BP — dan otomatis silang lagi saat ganti hari.
export function UploadChecklist({ version }: { version: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<UploadStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    supabase.rpc("upload_status").then(({ data, error }) => {
      if (error) setError(error.message);
      else setStats((data as UploadStat[] | null) ?? []);
    });
  }, [supabase, version]);

  // Hitung ulang tiap menit supaya halaman yang terbuka lewat tengah malam ikut reset.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const status = useMemo(() => {
    const map = new Map<FileKey, { last: UploadStat | null; ok: boolean }>();
    for (const k of Object.keys(FILES) as FileKey[]) {
      const last = stats ? lastOf(FILES[k], stats) : null;
      map.set(k, { last, ok: isFresh(last?.at, FILES[k].period, now) });
    }
    return map;
  }, [stats, now]);

  const done = [...status.values()].filter((s) => s.ok).length;

  return (
    <section className={`${card} p-4`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-medium">Checklist upload hari ini — {fmtDate(todayJakarta(now))}</h2>
        <span className="text-sm text-fg-2">
          {stats ? <><b className={done === status.size ? "text-success" : "text-fg"}>{done}</b> dari {status.size} file sudah di-upload</> : error ? <span className="text-danger">Gagal memuat: {error}</span> : "Memuat…"}
        </span>
      </div>
      <p className="mt-1 text-xs text-fg-2">Status kembali silang setiap ganti hari (WIB). Target & Master Business Partner cukup sekali per bulan. File yang sama cukup di-upload sekali untuk semua menu.</p>

      <ul className="mt-3 space-y-3">
        {CHECKLIST.map((g) => (
          <li key={g.menu}>
            <div className="text-sm font-medium">{g.menu}</div>
            <ul className="mt-1 space-y-1">
              {g.files.map((k) => {
                const def = FILES[k];
                const s = status.get(k)!;
                return (
                  <li key={k} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-2 text-sm">
                    <span className={`material-symbols-outlined !text-xl ${s.ok ? "text-success" : "text-danger"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }} aria-label={s.ok ? "sudah" : "belum"}>
                      {s.ok ? "check_circle" : "cancel"}
                    </span>
                    <span className={s.ok ? "" : "text-fg"}>{def.label}</span>
                    {def.period === "month" && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-fg-2">per bulan</span>}
                    <span className="text-xs text-fg-2">
                      · {s.last ? <>terakhir {fmtTimestamp(s.last.at)}{s.last.by ? ` · ${s.last.by}` : ""}</> : "belum pernah"}
                    </span>
                    {def.where.href !== "/pengaturan/upload" && (
                      <Link href={def.where.href} className="text-xs text-accent hover:underline">upload di {def.where.label} →</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
