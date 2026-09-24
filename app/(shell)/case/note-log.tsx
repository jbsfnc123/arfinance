"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtTimestamp, rupiah } from "@/lib/format";
import { todayJakarta } from "@/lib/parsers/date";
import { buildNoteGroups, filterGroups, type NoteGroup, type NoteLatest, type StatusFilter } from "@/lib/modules/collection/note-groups";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";

const EDIT_CATEGORIES = ["Case", "Administratif", "Reminder", "No Respon"];

async function fetchNotes(supabase: ReturnType<typeof createClient>, kategori: string) {
  const out: NoteLatest[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("v_note_latest").select("*")
      .eq("kategori", kategori).order("id", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// Log catatan Case / Administratif (port pane "log" Dashboard Controller).
// invoiceFilter: batasi ke kumpulan invoice tertentu (dipakai Dashboard Mitra 10).
export function NoteLog({ kategori, invoiceFilter }: { kategori: string; invoiceFilter?: Set<string> | null }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [notes, setNotes] = useState<NoteLatest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<NoteGroup | null>(null);
  const [draft, setDraft] = useState({ kategori: "", isi: "" });

  useEffect(() => {
    let cancelled = false;
    fetchNotes(supabase, kategori)
      .then((n) => !cancelled && setNotes(n))
      .catch((e: Error) => !cancelled && toast(`Gagal memuat catatan: ${e.message}`, "danger"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [kategori, reloadKey, supabase, toast]);

  // Catatan baru/berubah dari pengguna lain → muat ulang (ditunda 1 detik).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel(`note-log:${kategori}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setReloadKey((k) => k + 1), 1000);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [kategori, supabase]);

  const groups = useMemo(() => {
    const scoped = invoiceFilter ? notes.filter((n) => n.invoice_no && invoiceFilter.has(n.invoice_no)) : notes;
    return filterGroups(buildNoteGroups(scoped, todayJakarta().slice(0, 7)), status);
  }, [notes, invoiceFilter, status]);

  async function toggleDone(g: NoteGroup) {
    const done = !g.done;
    const keyOf = (n: NoteLatest) => `${n.kategori}\0${(n.business_partner ?? "").trim() || "Tanpa Partner"}\0${(n.isi ?? "").trim()}`;
    const before = notes;
    setNotes(notes.map((n) => (keyOf(n) === g.key ? { ...n, done, closed_at: done ? new Date().toISOString() : null } : n)));
    const { error } = await supabase.rpc("note_group_done", { p_cat: g.kategori, p_bp: g.bp, p_isi: g.isi, p_done: done });
    if (error) {
      setNotes(before);
      toast(`Gagal: ${error.message}`, "danger");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const { data, error } = await supabase.rpc("note_group_update", {
      p_cat: editing.kategori, p_bp: editing.bp, p_isi: editing.isi, p_new_cat: draft.kategori, p_new_isi: draft.isi.trim(),
    });
    if (error) return toast(`Gagal menyimpan: ${error.message}`, "danger");
    toast(`Catatan diperbarui (${data} baris).`, "success");
    setEditing(null);
    setReloadKey((k) => k + 1);
  }

  async function remove(g: NoteGroup) {
    if (!confirm(`Hapus catatan "${g.isi}" untuk ${g.bp}? Semua invoice dalam catatan ini ikut terhapus.`)) return;
    const { data, error } = await supabase.rpc("note_group_delete", { p_cat: g.kategori, p_bp: g.bp, p_isi: g.isi });
    if (error) return toast(`Gagal menghapus: ${error.message}`, "danger");
    toast(`Catatan dihapus (${data} baris).`, "success");
    setReloadKey((k) => k + 1);
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
