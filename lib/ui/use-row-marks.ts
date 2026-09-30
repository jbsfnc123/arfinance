"use client";

import { useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensure, patchLocal, useDataset } from "@/lib/local/store";
import { useToast } from "@/components/toast";
import { applyMarks, markErrorMessage, ROW_MARK_LABEL, type RowMarkColor, type RowMarkModule } from "@/lib/modules/row-marks";

// Penanda warna baris per modul. Sumber data: Supabase (pack_row_marks, satu request batch) di-cache seperti dataset
// lain (token data_versions 'row_marks' → perubahan akun lain ikut dimuat ulang). Mutasi: row_marks_set (RPC, dicek
// hak menu di server). Tampilan diperbarui segera; hanya respons request TERBARU per modul yang menentukan hasil akhir
// (respons lama diabaikan). Gagal → data dimuat ulang dari server (kembali ke kondisi sebenarnya) + pesan jelas.
// "Warna tersimpan" hanya ditampilkan setelah server mengonfirmasi.

const NAME = { m10: "m10Marks", rkm: "rkmMarks" } as const;
const latest: Record<RowMarkModule, number> = { m10: 0, rkm: 0 };

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>;

/** Inti mutasi (dapat dites tanpa React): terapkan lokal → RPC → konfirmasi / pulihkan. */
export async function commitMarks(opts: {
  module: RowMarkModule; ids: number[]; color: RowMarkColor | null; rpc: Rpc;
  notify: (msg: string, type: "success" | "danger") => void;
}): Promise<boolean> {
  const { module, ids, color, rpc, notify } = opts;
  if (!ids.length) return false;
  const name = NAME[module];
  const mine = ++latest[module];
  patchLocal(name, (d) => ({ marks: applyMarks(d.marks, ids, color) }));
  let error: { code?: string; message?: string } | null;
  try {
    ({ error } = await rpc("row_marks_set", { p_module: module, p_ids: ids, p_color: color }));
  } catch (e) {
    error = { message: (e as Error).message };
  }
  if (mine !== latest[module]) return !error; // sudah ada pilihan yang lebih baru → dia yang menentukan
  if (error) {
    await ensure(name, { force: true }); // kembali ke data server
    notify(markErrorMessage(error), "danger");
    return false;
  }
  notify(color ? `Warna tersimpan: ${ROW_MARK_LABEL[color]} untuk ${ids.length} baris` : `Warna dihapus dari ${ids.length} baris`, "success");
  void ensure(name, { force: true }); // sinkron dengan server (mis. perubahan akun lain di saat bersamaan)
  return true;
}

export function useRowMarks(module: RowMarkModule) {
  const ds = useDataset(NAME[module]);
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const map = useMemo(() => new Map((ds.data?.marks ?? []).map((m) => [m.id, m.color])), [ds.data]);
  const setMarks = useCallback((ids: number[], color: RowMarkColor | null) => commitMarks({
    module, ids, color,
    rpc: (fn, args) => supabase.rpc(fn as never, args as never) as unknown as ReturnType<Rpc>,
    notify: (msg, type) => toast(msg, type, type === "danger" ? 8000 : 3000),
  }), [module, supabase, toast]);
  return { map, setMarks, loading: ds.loading, error: ds.error };
}
