// Klien arsip Google Drive: daftar arsip (RPC archive_list) & isi file (/api/archive/read, di-cache browser selamanya
// karena file arsip tidak pernah berubah — versi baru = id baru). Dipakai halaman Arsip Data & penarikan otomatis.
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ArchiveDataset, ArchiveEntry, ArchiveFile } from "./datasets";

const files = new Map<number, Promise<ArchiveFile>>();

export function loadArchive(id: number): Promise<ArchiveFile> {
  let p = files.get(id);
  if (!p) {
    p = fetch(`/api/archive/read?id=${id}`).then(async (r) => {
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      return r.json() as Promise<ArchiveFile>;
    });
    p.catch(() => files.delete(id)); // galat tidak di-cache: boleh dicoba lagi
    files.set(id, p);
  }
  return p;
}

export async function listArchives(dataset?: ArchiveDataset): Promise<ArchiveEntry[]> {
  const { data, error } = await createClient().rpc("archive_list" as never, { p_dataset: dataset ?? null } as never);
  if (error) throw new Error(error.message);
  return (data as unknown as ArchiveEntry[]) ?? [];
}

/** Daftar arsip satu dataset (null = sedang memuat). Galat (mis. akses ditolak) → daftar kosong. */
export function useArchiveList(dataset: ArchiveDataset, enabled = true) {
  const [list, setList] = useState<ArchiveEntry[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    listArchives(dataset).then((l) => { if (live) setList(l); }, () => { if (live) setList([]); });
    return () => { live = false; };
  }, [dataset, enabled]);
  return list;
}

/**
 * Baris arsip untuk periode yang diminta (hanya periode yang memang sudah diarsip). Untuk menggabungkan data bulan lama
 * yang sudah tidak ada di Supabase ke tampilan halaman.
 */
export function useArchivedRows<T = Record<string, unknown>>(dataset: ArchiveDataset, periods: readonly string[], enabled = true) {
  const list = useArchiveList(dataset, enabled);
  const wanted = useMemo(() => (list ?? []).filter((e) => periods.includes(e.period)), [list, periods]);
  const key = wanted.map((e) => e.id).join(",");
  // Hasil terakhir dicatat per `key`; selama key berubah & belum ada hasil → loading (state turunan, tanpa setState sinkron).
  const [res, setRes] = useState<{ key: string; rows: T[]; error: string | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    Promise.all(wanted.map((e) => loadArchive(e.id))).then(
      (fs) => { if (live) setRes({ key, rows: fs.flatMap((f) => f.rows as T[]), error: null }); },
      (e: Error) => { if (live) setRes({ key, rows: [], error: e.message }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = key && res?.key === key ? res : null;
  return {
    rows: current?.rows ?? EMPTY as T[],
    error: current?.error ?? null,
    loading: (enabled && list === null) || (!!key && !current),
    archived: wanted.map((e) => e.period),
  };
}

const EMPTY: never[] = [];
