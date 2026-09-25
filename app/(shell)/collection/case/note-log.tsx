"use client";

import { Fragment, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtTimestamp, rupiah } from "@/lib/format";
import { todayJakarta } from "@/lib/parsers/date";
import { buildNoteGroups, filterGroups, type NoteGroup, type StatusFilter } from "@/lib/modules/collection/note-groups";
import { useDataset, optimistic } from "@/lib/local/store";
import { noteLatest } from "@/lib/modules/collection/rows";
import { arOf } from "@/lib/local/derived";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";

const EDIT_CATEGORIES = ["Case", "Administratif", "Reminder", "No Respon"];

// Kunci grup catatan (sama dengan note_group_* di database): Kategori + BP + isi.
const keyOf = (n: { kategori: string | null; business_partner: string | null; isi: string | null }) =>
  `${n.kategori}\0${(n.business_partner ?? "").trim() || "Tanpa Partner"}\0${(n.isi ?? "").trim()}`;

// Log catatan Case / Administratif (port pane "log" Dashboard Controller).
// invoiceFilter: batasi ke kumpulan invoice tertentu (dipakai Dashboard Mitra 10).
export function NoteLog({ kategori, invoiceFilter }: { kategori: string; invoiceFilter?: Set<string> | null }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const activity = useDataset("activity");
  const aging = useDataset("aging");
  const settings = useDataset("settings");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<NoteGroup | null>(null);
  const [draft, setDraft] = useState({ kategori: "", isi: "" });
  // Catatan terbaru per invoice (port v_note_latest) dihitung di browser dari dataset lokal.
  const notes = useMemo(() => {
    if (!activity.data || !aging.data) return [];
    const ar = arOf(aging.data.lines, settings.data ?? null);
    return noteLatest(activity.data.notes, ar).filter((n) => n.kategori === kategori);
  }, [activity.data, aging.data, settings.data, kategori]);
  const loading = !activity.data || !aging.data;

  const groups = useMemo(() => {
    const scoped = invoiceFilter ? notes.filter((n) => n.invoice_no && invoiceFilter.has(n.invoice_no)) : notes;
    return filterGroups(buildNoteGroups(scoped, todayJakarta().slice(0, 7)), status);
  }, [notes, invoiceFilter, status]);

  // Semua aksi: ubah data lokal dulu (optimistic), simpan ke server di belakang layar.
  const fail = (e: unknown) => toast(`Gagal: ${(e as Error).message}`, "danger");
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn as never, args as never);
    if (error) throw error;
    return data as unknown;
  };

  function toggleDone(g: NoteGroup) {
    const done = !g.done;
    optimistic("activity", (d) => ({ ...d, notes: d.notes.map((n) => (keyOf(n) === g.key ? { ...n, done, closed_at: done ? new Date().toISOString() : null } : n)) }),
      () => rpc("note_group_done", { p_cat: g.kategori, p_bp: g.bp, p_isi: g.isi, p_done: done })).catch(fail);
  }

  function saveEdit() {
    if (!editing) return;
    const g = editing;
    const isi = draft.isi.trim();
    setEditing(null);
    optimistic("activity", (d) => ({ ...d, notes: d.notes.map((n) => (keyOf(n) === g.key ? { ...n, kategori: draft.kategori, isi } : n)) }),
      () => rpc("note_group_update", { p_cat: g.kategori, p_bp: g.bp, p_isi: g.isi, p_new_cat: draft.kategori, p_new_isi: isi }))
      .then(() => toast("Catatan diperbarui.", "success")).catch(fail);
  }

  function remove(g: NoteGroup) {
    if (!confirm(`Hapus catatan "${g.isi}" untuk ${g.bp}? Semua invoice dalam catatan ini ikut terhapus.`)) return;
    optimistic("activity", (d) => ({ ...d, notes: d.notes.filter((n) => keyOf(n) !== g.key) }),
      () => rpc("note_group_delete", { p_cat: g.kategori, p_bp: g.bp, p_isi: g.isi }))
      .then(() => toast("Catatan dihapus.", "success")).catch(fail);
  }

  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <h2 className="font-medium">Log Catatan {kategori}</h2>
        <span className="text-xs text-fg-2">· {groups.length} catatan</span>
        <div className="ml-auto flex gap-1">
          {([["open", "Belum Selesai"], ["done", "Selesai"], ["all", "Semua"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setStatus(k)}
              className={`rounded-full px-3 py-1 text-xs ${status === k ? "bg-pill text-pill-fg" : "hover:bg-surface-2"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Collection</th><th className={th}>Business Partner</th>
              <th className={`${th} text-right`}>Nominal</th><th className={th}>Catatan</th><th className={`${th} text-right`}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const late = g.lateCount > 0;
              return (
                <Fragment key={g.key}>
                  <tr
                    onClick={() => setOpen(open === g.key ? null : g.key)}
                    className={`cursor-pointer border-t border-line hover:bg-surface-2 ${late ? "bg-danger/5 shadow-[inset_3px_0_0_var(--danger)]" : ""}`}
                  >
                    <td className={`${td} max-w-40 truncate`}>
                      <span className="material-symbols-outlined !text-base align-middle">{open === g.key ? "expand_less" : "expand_more"}</span>{" "}
                      {g.collections.join(", ")}
                    </td>
                    <td className={`${td} max-w-72 truncate`}>
                      {g.bp}
                      <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px]">{g.items.length} inv</span>
                      {late && <span className="ml-1 rounded-full border border-danger/60 px-2 py-0.5 text-[11px] text-danger">{g.lateCount} lewat bulan</span>}
                      {g.done && <span className="ml-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">Done</span>}
                    </td>
                    <td className={`${td} text-right`}>{rupiah(g.nomTotal)}</td>
                    <td className={`${td} max-w-96 whitespace-normal`}>
                      {g.isi || <span className="text-fg-2">—</span>}
                      {g.done && g.closedAt && (
                        <div className="text-[11px] text-success">✓ {g.closedBy ?? ""} · {fmtTimestamp(g.closedAt)}</div>
                      )}
                    </td>
                    <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                      <button type="button" title={g.done ? "Batalkan selesai" : "Tandai selesai"} onClick={() => toggleDone(g)} className="px-1 text-fg-2 hover:text-success">
                        <span className="material-symbols-outlined">{g.done ? "undo" : "check_circle"}</span>
                      </button>
                      <button type="button" title="Ubah" onClick={() => { setEditing(g); setDraft({ kategori: g.kategori, isi: g.isi }); }} className="px-1 text-fg-2 hover:text-fg">
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button type="button" title="Hapus" onClick={() => remove(g)} className="px-1 text-fg-2 hover:text-danger">
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </td>
                  </tr>
                  {open === g.key && g.items.map((n) => (
                    <tr key={n.invoice_no} className={`text-xs text-fg-2 ${n.invoice_date && n.invoice_date.slice(0, 7) < todayJakarta().slice(0, 7) ? "bg-danger/5" : ""}`}>
                      <td className={`${td} pl-10`} colSpan={2}>🧾 {n.invoice_no} · 📅 {fmtDate(n.invoice_date)}</td>
                      <td className={`${td} text-right`}>{rupiah(n.nominal)}</td>
                      <td className={td} colSpan={2}>{n.no_po || n.no_sj ? `PO: ${n.no_po ?? "—"} · SJ: ${n.no_sj ?? "—"}` : "—"}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {!loading && groups.length === 0 && (
              <tr><td className={`${td} text-fg-2`} colSpan={5}>Tidak ada catatan.</td></tr>
            )}
            {loading && <tr><td className={`${td} text-fg-2`} colSpan={5}>Memuat…</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Ubah Catatan"
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setEditing(null)}>Batal</button>
            <button type="button" className={btnPrimary} onClick={saveEdit}>Simpan</button>
          </>
        }
      >
        <p className="text-sm text-fg-2"><b className="text-fg">{editing?.bp}</b> · kategori saat ini: {editing?.kategori}</p>
        <select value={draft.kategori} onChange={(e) => setDraft({ ...draft, kategori: e.target.value })} className={`${inputCls} mt-3`}>
          {EDIT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <textarea value={draft.isi} onChange={(e) => setDraft({ ...draft, isi: e.target.value })} rows={3} className={`${inputCls} mt-3`} />
      </Modal>
    </section>
  );
}
