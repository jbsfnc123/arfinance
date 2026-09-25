"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { fmtTimestamp } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnPrimary } from "@/components/ui";

type Note = Tables<"sticky_notes">;

export const MAX_NOTES = 10;
const SAVE_DELAY = 800;

// Warna transparan di atas permukaan kartu: terbaca di tema gelap maupun terang.
const COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  yellow: { bg: "rgba(253,214,99,.16)", border: "rgba(253,214,99,.55)", dot: "#fdd663" },
  green:  { bg: "rgba(129,201,149,.16)", border: "rgba(129,201,149,.55)", dot: "#81c995" },
  blue:   { bg: "rgba(138,180,248,.16)", border: "rgba(138,180,248,.55)", dot: "#8ab4f8" },
  pink:   { bg: "rgba(242,139,130,.16)", border: "rgba(242,139,130,.55)", dot: "#f28b82" },
  purple: { bg: "rgba(197,138,249,.16)", border: "rgba(197,138,249,.55)", dot: "#c58af9" },
};

const sortNotes = (list: Note[]) => [...list].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);

// Papan sticky notes bersama (maks. 10, dijaga juga oleh trigger server). Semua pemilik akses
// Beranda boleh menambah/mengubah/menghapus; perubahan pengguna lain masuk lewat realtime.
export function StickyBoard({ initial }: { initial: Note[] }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>(() => sortNotes(initial));
  const [adding, setAdding] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  // Teks yang sedang diketik (belum tersimpan) tidak ditimpa data realtime.
  const drafts = useRef(new Map<number, string>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const channel = supabase
      .channel("sticky_notes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sticky_notes" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as Partial<Note>).id;
          setNotes((list) => list.filter((n) => n.id !== id));
          return;
        }
        const row = payload.new as Note;
        const draft = drafts.current.get(row.id);
        const merged = draft === undefined ? row : { ...row, body: draft };
        setNotes((list) => sortNotes([...list.filter((n) => n.id !== row.id), merged]));
      })
      .subscribe();
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const replace = (row: Note) => setNotes((list) => list.map((n) => (n.id === row.id ? { ...row, body: drafts.current.get(row.id) ?? row.body } : n)));

  async function save(id: number, patch: Partial<Pick<Note, "body" | "color">>, prev: Note) {
    const { data, error } = await supabase.from("sticky_notes").update(patch).eq("id", id).select().single();
    if (error) {
      drafts.current.delete(id);
      setNotes((list) => list.map((n) => (n.id === id ? prev : n)));
      toast(`Gagal menyimpan note: ${error.message}`, "danger");
      return;
    }
    if (patch.body !== undefined && drafts.current.get(id) === patch.body) drafts.current.delete(id);
    replace(data);
  }

  function flush(id: number) {
    const t = timers.current.get(id);
    if (!t) return;
    clearTimeout(t);
    timers.current.delete(id);
    const body = drafts.current.get(id);
    const note = notes.find((n) => n.id === id);
    if (body !== undefined && note) void save(id, { body }, note);
  }

  function type(note: Note, body: string) {
    drafts.current.set(note.id, body);
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, body } : n)));
    clearTimeout(timers.current.get(note.id));
    timers.current.set(note.id, setTimeout(() => {
      timers.current.delete(note.id);
      void save(note.id, { body }, note);
    }, SAVE_DELAY));
  }

  function recolor(note: Note, color: string) {
    if (note.color === color) return;
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, color } : n)));
    void save(note.id, { color }, note);
  }

  async function add() {
    if (notes.length >= MAX_NOTES) return;
    setAdding(true);
    const color = Object.keys(COLORS)[notes.length % Object.keys(COLORS).length];
    const { data, error } = await supabase.from("sticky_notes").insert({ body: "", color }).select().single();
    setAdding(false);
    if (error) return toast(error.message.includes("Maksimal") ? `Maksimal ${MAX_NOTES} sticky notes.` : `Gagal menambah note: ${error.message}`, "danger");
    setNotes((list) => sortNotes([...list.filter((n) => n.id !== data.id), data]));
    setFocusId(data.id);
  }

  async function remove(note: Note) {
    if (!window.confirm("Hapus sticky note ini untuk semua pengguna?")) return;
    clearTimeout(timers.current.get(note.id));
    timers.current.delete(note.id);
    drafts.current.delete(note.id);
    setNotes((list) => list.filter((n) => n.id !== note.id));
    const { error } = await supabase.from("sticky_notes").delete().eq("id", note.id);
    if (error) {
      setNotes((list) => sortNotes([...list, note]));
      toast(`Gagal menghapus note: ${error.message}`, "danger");
    }
  }

  const full = notes.length >= MAX_NOTES;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-medium">Beranda</h1>
        <span className="text-xs text-fg-2">{notes.length}/{MAX_NOTES} sticky notes</span>
        <button type="button" className={`${btnPrimary} ml-auto`} onClick={add} disabled={full || adding}
          title={full ? `Maksimal ${MAX_NOTES} sticky notes — hapus salah satu untuk menambah` : "Tambah sticky note"}>
          <span className="material-symbols-outlined">add</span>
          Note
        </button>
      </div>

      {notes.length === 0 ? (
        <button type="button" onClick={add} disabled={adding}
          className="mt-10 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-line py-16 text-sm text-fg-2 hover:bg-surface-2">
          <span className="material-symbols-outlined !text-4xl">sticky_note_2</span>
          Belum ada sticky note. Klik untuk menambah.
        </button>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {notes.map((n) => {
            const c = COLORS[n.color] ?? COLORS.yellow;
            return (
              <div key={n.id} className="flex min-h-52 flex-col rounded-2xl border p-3 shadow-sm"
                style={{ background: c.bg, borderColor: c.border }}>
                <textarea
                  value={n.body}
                  autoFocus={n.id === focusId}
                  onChange={(e) => type(n, e.target.value)}
                  onBlur={() => flush(n.id)}
                  maxLength={1000}
                  placeholder="Tulis catatan…"
                  className="min-h-36 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-fg-2"
                />
                <div className="mt-2 flex items-center gap-1.5">
                  {Object.entries(COLORS).map(([key, col]) => (
                    <button key={key} type="button" onClick={() => recolor(n, key)} title={`Warna ${key}`}
                      className={`h-4 w-4 rounded-full border ${n.color === key ? "border-fg" : "border-transparent"}`}
                      style={{ background: col.dot }} />
                  ))}
                  <button type="button" onClick={() => remove(n)} title="Hapus note"
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-danger">
                    <span className="material-symbols-outlined !text-lg">delete</span>
                  </button>
                </div>
                <div className="mt-1 truncate text-[11px] text-fg-2" title={`Dibuat ${n.created_by_name ?? "-"} · ${fmtTimestamp(n.created_at)}`}>
                  diubah {n.updated_by_name ?? "-"} · {fmtTimestamp(n.updated_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
