"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { areaOf, bpOf } from "@/lib/modules/sj/compute";
import type { SjState } from "./use-sj";

const n = (v: number) => v.toLocaleString("id-ID");
const MAX_SHOWN = 300; // daftar BP sangat panjang (±10 ribu): tampilkan 300 pertama, sisanya lewat pencarian
type Kind = "bp" | "area";

/** Perubahan yang belum disimpan: nilai → tampil (true) / disembunyikan (false). */
type Draft = Record<Kind, Map<string, boolean>>;

// Setting (Fase 86): centang Business Partner & Area yang ditampilkan di Dashboard & Kertas Kerja (bersama, semua user).
// Tidak dicentang = disembunyikan. BP/Area baru otomatis tercentang. Daftar urut A-Z. Hanya Controller/Super Admin
// yang bisa mengubah (server: sj_visibility_set + sj_can_manage).
export function VisibilitySettings({ s }: { s: SjState }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const can = s.canManage;
  const [draft, setDraft] = useState<Draft>({ bp: new Map(), area: new Map() });
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  // Semua nilai yang pernah muncul di laporan + nilai tersembunyi yang tidak ada lagi di laporan, beserta jumlah SJ.
  const lists = useMemo(() => {
    const count = (pick: (r: SjState["rows"][number]) => string, kind: Kind) => {
      const m = new Map<string, number>();
      for (const r of s.rows) { const v = pick(r); m.set(v, (m.get(v) ?? 0) + 1); }
      for (const v of s.hidden[kind]) if (!m.has(v)) m.set(v, 0);
      return [...m].sort((a, b) => a[0].localeCompare(b[0], "id")).map(([value, sj]) => ({ value, sj }));
    };
    return { bp: count(bpOf, "bp"), area: count(areaOf, "area") };
  }, [s.rows, s.hidden]);

  const shown = (kind: Kind, v: string) => draft[kind].get(v) ?? !s.hidden[kind].has(v);
  const toggle = (kind: Kind, values: string[], on: boolean) => setDraft((d) => {
    const next = new Map(d[kind]);
    for (const v of values) {
      if (on === !s.hidden[kind].has(v)) next.delete(v); else next.set(v, on); // kembali ke kondisi tersimpan → bukan perubahan
    }
    return { ...d, [kind]: next };
  });
  const changes = draft.bp.size + draft.area.size;

  const query = q.trim().toLowerCase();
  const bpMatch = useMemo(() => (query ? lists.bp.filter((o) => o.value.toLowerCase().includes(query)) : lists.bp), [lists.bp, query]);
  const bpHiddenCount = lists.bp.filter((o) => !shown("bp", o.value)).length;
  const areaHiddenCount = lists.area.filter((o) => !shown("area", o.value)).length;

  async function save() {
    setSaving(true);
    try {
      for (const kind of ["area", "bp"] as Kind[]) {
        for (const hide of [true, false]) {
          const values = [...draft[kind]].filter(([, on]) => on !== hide).map(([v]) => v);
          if (!values.length) continue;
          const { error } = await supabase.rpc("sj_visibility_set" as never, { p_kind: kind, p_values: values, p_hidden: hide } as never);
          if (error) throw new Error(error.message);
        }
      }
      toast(`${n(changes)} perubahan tampilan disimpan.`, "success");
      setDraft({ bp: new Map(), area: new Map() });
      await s.ds.reload();
    } catch (e) {
      toast(`Gagal menyimpan: ${(e as Error).message}`, "danger", 8000);
    } finally { setSaving(false); }
  }

  const check = (kind: Kind, value: string, sj: number) => (
    <label key={value} className={`flex items-center gap-2 py-1 text-sm ${draft[kind].has(value) ? "font-medium" : ""}`}>
      <input type="checkbox" checked={shown(kind, value)} disabled={!can || saving} onChange={(e) => toggle(kind, [value], e.target.checked)}
        aria-label={`Tampilkan ${kind === "bp" ? "Business Partner" : "Area"} ${value}`} />
      <span className="min-w-0 flex-1 truncate" title={value}>{value}</span>
      <span className="text-xs tabular-nums text-fg-2">{n(sj)} SJ</span>
    </label>
  );

  return (
    <section className={`${card} space-y-3 p-4`} aria-labelledby="sj-vis-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sj-vis-title" className="font-medium">Business Partner & Area yang ditampilkan</h2>
        <span className="text-xs text-fg-2">Tidak dicentang = tidak tampil di Dashboard & Kertas Kerja (berlaku untuk semua user).</span>
        {can && (
          <span className="ml-auto flex gap-2">
            {changes > 0 && <button type="button" className={btnGhost} disabled={saving} onClick={() => setDraft({ bp: new Map(), area: new Map() })}>Batal</button>}
            <button type="button" className={btnPrimary} disabled={!changes || saving} onClick={() => void save()}>
              {saving ? "Menyimpan…" : `Simpan perubahan (${n(changes)})`}
            </button>
          </span>
        )}
      </div>
      {!can && s.ds.data && <p className="text-[13px] text-fg-2">Hanya Controller dan Super Admin yang dapat mengubah centang.</p>}
      {!s.ds.data && <p className="text-sm text-fg-2">Memuat daftar…</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div>
          <h3 className="text-sm font-medium">Area <span className="font-normal text-fg-2">· {n(lists.area.length - areaHiddenCount)} dari {n(lists.area.length)} ditampilkan</span></h3>
          <div className="mt-1 divide-y divide-line/40">
            {lists.area.map((o) => check("area", o.value, o.sj))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium">Business Partner <span className="font-normal text-fg-2">· {n(lists.bp.length - bpHiddenCount)} dari {n(lists.bp.length)} ditampilkan</span></h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari Business Partner…" aria-label="Cari Business Partner"
              className={`${inputCls} !w-64`} />
            {can && (
              <>
                <button type="button" className={btnGhost} disabled={saving || !bpMatch.length} onClick={() => toggle("bp", bpMatch.map((o) => o.value), true)}>
                  Centang semua{query ? ` hasil cari (${n(bpMatch.length)})` : ""}
                </button>
                <button type="button" className={btnGhost} disabled={saving || !bpMatch.length} onClick={() => toggle("bp", bpMatch.map((o) => o.value), false)}>
                  Hapus centang{query ? ` hasil cari (${n(bpMatch.length)})` : " semua"}
                </button>
              </>
            )}
          </div>
          <div className="mt-2 max-h-[50vh] divide-y divide-line/40 overflow-y-auto pr-1">
            {bpMatch.slice(0, MAX_SHOWN).map((o) => check("bp", o.value, o.sj))}
            {!bpMatch.length && <p className="py-2 text-sm text-fg-2">Tidak ada Business Partner yang cocok.</p>}
          </div>
          {bpMatch.length > MAX_SHOWN && (
            <p className="mt-1 text-xs text-fg-2">Menampilkan {n(MAX_SHOWN)} dari {n(bpMatch.length)} — ketik di kotak cari untuk mempersempit.</p>
          )}
        </div>
      </div>
    </section>
  );
}
