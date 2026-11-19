"use client";

import { useCallback, useEffect, useState } from "react";
import { kvDel, kvGet, kvSet } from "@/lib/local/kv";
import type { PoCategory, ReconRow, SoRow } from "@/lib/modules/cekharga/cekharga";

// Data kerja Cek Selisih Harga (Fase 83) hanya di browser ini (IndexedDB "arw-local"), tidak dikirim ke server;
// dikosongkan saat logout. Server hanya menyimpan Arsip & Task Complete (po_so_cases).

export type LocalSo = { rows: SoRow[]; fileName: string; at: string; partners: string; status: string };
export type LocalRecon = { rows: ReconRow[]; category: PoCategory; files: string[]; at: string; newlyArchived: string[]; archiveError?: string };

const SO_KEY = "cekharga:so";
const RECON_KEY = "cekharga:recon";

export function useCekHargaLocal() {
  const [so, setSoState] = useState<LocalSo | null>(null);
  const [recon, setReconState] = useState<LocalRecon | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([kvGet<LocalSo>(SO_KEY), kvGet<LocalRecon>(RECON_KEY)]).then(([s, r]) => {
      if (!alive) return;
      setSoState(s);
      setReconState(r);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // Simpan ke state dulu (tampil seketika), lalu ke IndexedDB. Gagal simpan (mis. kuota) dilempar ke pemanggil.
  const setSo = useCallback(async (v: LocalSo) => { setSoState(v); await kvSet(SO_KEY, v); }, []);
  const clearSo = useCallback(async () => { setSoState(null); await kvDel(SO_KEY); }, []);
  const setRecon = useCallback(async (v: LocalRecon) => { setReconState(v); await kvSet(RECON_KEY, v); }, []);
  const clearRecon = useCallback(async () => { setReconState(null); await kvDel(RECON_KEY); }, []);

  return { so, recon, loaded, setSo, clearSo, setRecon, clearRecon };
}

export type CekHargaLocal = ReturnType<typeof useCekHargaLocal>;
