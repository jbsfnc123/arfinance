"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rupiah } from "@/lib/format";
import { todayJakarta } from "@/lib/parsers/date";
import type { CollectionRow } from "@/lib/modules/collection/view-model";
import { DEFAULT_WA_TEMPLATE, type WaTemplate } from "@/lib/modules/collection/wa-message";
import { Modal } from "@/components/modal";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";

export type Contact = { business_partner: string; nama: string | null; no_wa: string };

export const NOTE_CATEGORIES = ["Janji Bayar", "Reminder", "No Respon", "Case", "Administratif"] as const;

// ── Catatan / Janji Bayar ────────────────────────────────────────────
export function NoteModal(props: {
  open: boolean;
  onClose: () => void;
  count: number;
  onSave: (kategori: string, isi: string, date: string) => Promise<boolean>;
}) {
  const [kategori, setKategori] = useState<string>("Janji Bayar");
  const [isi, setIsi] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const janji = kategori === "Janji Bayar";
  const valid = janji ? !!date : !!isi.trim();

  async function save() {
    setBusy(true);
    const ok = await props.onSave(kategori, isi.trim(), date);
    setBusy(false);
    if (ok) {
      setKategori("Janji Bayar");
      setIsi("");
      setDate("");
      props.onClose();
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Update Status Tagihan"
      footer={
        <>
          <button type="button" className={btnGhost} onClick={props.onClose}>Batal</button>
          <button type="button" className={btnPrimary} disabled={!valid || busy} onClick={save}>
            {busy ? "Menyimpan…" : `Simpan untuk ${props.count} invoice`}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-fg-2">Kategori</span>
          <select value={kategori} onChange={(e) => setKategori(e.target.value)} className={`${inputCls} mt-1`}>
            {NOTE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        {janji && (
          <label className="block">
            <span className="text-fg-2">Tanggal Janji *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
        )}
        <label className="block">
          <span className="text-fg-2">{janji ? "Keterangan (opsional)" : "Detail Catatan *"}</span>
          <textarea value={isi} onChange={(e) => setIsi(e.target.value)} rows={3} className={`${inputCls} mt-1`} />
        </label>
      </div>
    </Modal>
  );
}

// ── Tukar Faktur via WA / Email ──────────────────────────────────────
export function TukarModal(props: {
  open: boolean;
  onClose: () => void;
  count: number;
  total: number;
  onSave: (via: "WA" | "Email", date: string) => Promise<boolean>;
}) {
  const [via, setVia] = useState<"WA" | "Email">("WA");
  const [date, setDate] = useState(todayJakarta());
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const ok = await props.onSave(via, date);
    setBusy(false);
    if (ok) props.onClose();
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Tukar Faktur"
      footer={
        <>
          <button type="button" className={btnGhost} onClick={props.onClose}>Batal</button>
          <button type="button" className={btnPrimary} disabled={!date || busy} onClick={save}>Simpan</button>
        </>
      }
    >
      <p className="text-sm text-fg-2">{props.count} invoice dipilih · Total: {rupiah(props.total)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <label>
          <span className="text-fg-2">Via</span>
          <select value={via} onChange={(e) => setVia(e.target.value as "WA" | "Email")} className={`${inputCls} mt-1`}>
            <option>WA</option>
            <option>Email</option>
          </select>
        </label>
        <label>
          <span className="text-fg-2">Tanggal Tukar Faktur *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>
    </Modal>
  );
}

// ── Kontak ───────────────────────────────────────────────────────────
export function ContactsModal(props: {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  firstBp: string;
  onPick: (phone: string) => void;
  onSave: (list: Contact[]) => Promise<boolean>;
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Contact>({ business_partner: "", nama: "", no_wa: "" });
  const [batch, setBatch] = useState<Contact[] | null>(null);

  const list = useMemo(() => {
    const needle = q.toLowerCase();
    return props.contacts
      .filter((c) => `${c.nama ?? ""} ${c.business_partner} ${c.no_wa}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.business_partner === props.firstBp) - Number(a.business_partner === props.firstBp));
  }, [props.contacts, props.firstBp, q]);

  async function saveBatch() {
    const valid = (batch ?? []).filter((c) => c.business_partner.trim() && c.no_wa.trim());
    if (!valid.length) return;
    if (await props.onSave(valid)) setBatch(null);
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="Pilih Nomor Kontak" wide>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, BP, nomor…" className={inputCls} />
        <button type="button" className={btnGhost} onClick={() => setBatch([{ business_partner: props.firstBp, nama: "", no_wa: "" }])}>
          <span className="material-symbols-outlined">add</span>Tambah
        </button>
      </div>

      {batch && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface-2 p-3">
          {batch.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              {(["nama", "business_partner", "no_wa"] as const).map((f) => (
                <input
                  key={f}
                  value={c[f] ?? ""}
                  placeholder={f === "nama" ? "Nama (opsional)" : f === "no_wa" ? "No WA" : "Business Partner"}
                  onChange={(e) => setBatch(batch.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))}
                  className={inputCls}
                />
              ))}
              <button type="button" className="text-fg-2 hover:text-danger" onClick={() => setBatch(batch.filter((_, j) => j !== i))} aria-label="Hapus baris">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={() => setBatch([...batch, { business_partner: "", nama: "", no_wa: "" }])}>+ Baris</button>
            <button type="button" className={btnPrimary} onClick={saveBatch}>Simpan Semua</button>
          </div>
        </div>
      )}

      <ul className="mt-3 divide-y divide-line">
        {list.slice(0, 200).map((c) => (
          <li key={c.business_partner} className="py-2">
            {editing === c.business_partner ? (
              <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2">
                <input value={draft.nama ?? ""} onChange={(e) => setDraft({ ...draft, nama: e.target.value })} placeholder="Nama" className={inputCls} />
                <input value={draft.no_wa} onChange={(e) => setDraft({ ...draft, no_wa: e.target.value })} placeholder="No WA" className={inputCls} />
                <button type="button" className={btnGhost} onClick={() => setEditing(null)}>Batal</button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={!draft.no_wa.trim()}
                  onClick={async () => { if (await props.onSave([draft])) setEditing(null); }}
                >
                  Simpan
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { props.onPick(c.no_wa); props.onClose(); }}>
                  <div className="truncate text-sm">{c.nama || c.business_partner}</div>
                  <div className="truncate text-xs text-fg-2">{c.business_partner} · {c.no_wa}</div>
                </button>
                <button type="button" className="text-fg-2 hover:text-fg" onClick={() => { setEditing(c.business_partner); setDraft(c); }} aria-label="Ubah kontak">
                  <span className="material-symbols-outlined">edit</span>
                </button>
              </div>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="py-4 text-sm text-fg-2">Tidak ada kontak.</li>}
      </ul>
    </Modal>
  );
}

// ── Edit Pesan WA (disimpan di perangkat ini) ────────────────────────
export const WA_DEVICE_KEY = "waCustomMsg_v1";

export function readDeviceTemplate(): Partial<WaTemplate> | null {
  try {
    const raw = localStorage.getItem(WA_DEVICE_KEY);
    return raw ? (JSON.parse(raw) as Partial<WaTemplate>) : null;
  } catch {
    return null;
  }
}

export function WaEditModal(props: {
  open: boolean;
  onClose: () => void;
  current: WaTemplate;
  server: Partial<WaTemplate> | null;
  onChange: (device: Partial<WaTemplate> | null) => void;
}) {
  const { open, current } = props;
  const [tpl, setTpl] = useState(current);
  // Isi ulang dari template aktif setiap kali modal dibuka.
  const [openedFor, setOpenedFor] = useState(false);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) setTpl(current);
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Edit Pesan WA"
      wide
      footer={
        <>
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              try { localStorage.removeItem(WA_DEVICE_KEY); } catch {}
              props.onChange(null);
              setTpl({ header: props.server?.header || DEFAULT_WA_TEMPLATE.header, footer: props.server?.footer || DEFAULT_WA_TEMPLATE.footer });
            }}
          >
            Set Default
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              try { localStorage.setItem(WA_DEVICE_KEY, JSON.stringify(tpl)); } catch {}
              props.onChange(tpl);
              props.onClose();
            }}
          >
            Simpan Pesan
          </button>
        </>
      }
    >
      <p className="text-xs text-fg-2">
        Placeholder: <code>{"{{collection}}"}</code> = nama collection, <code>{"{{total}}"}</code> = total tagihan. Pesan ini
        hanya tersimpan di perangkat ini.
      </p>
      <textarea value={tpl.header} onChange={(e) => setTpl({ ...tpl, header: e.target.value })} rows={3} className={`${inputCls} mt-3`} />
      <div className="my-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2">[Daftar invoice otomatis + Total Tagihan]</div>
      <textarea value={tpl.footer} onChange={(e) => setTpl({ ...tpl, footer: e.target.value })} rows={5} className={inputCls} />
    </Modal>
  );
}

// ── Foto tanda terima ────────────────────────────────────────────────
function driveThumb(url: string) {
  const id = /\/d\/([\w-]+)/.exec(url)?.[1] ?? /[?&]id=([\w-]+)/.exec(url)?.[1];
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : url;
}

export function FotoModal(props: { open: boolean; onClose: () => void; rows: CollectionRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of props.rows) if (r.foto_path) map.set(r.foto_path, [...(map.get(r.foto_path) ?? []), r.invoice_no]);
    return [...map.entries()];
  }, [props.rows]);
  const [signed, setSigned] = useState<Record<string, string>>({});

  // Foto dari aplikasi kurir (Fase 2) tersimpan di Storage privat → butuh signed URL.
  useEffect(() => {
    const paths = groups.map(([p]) => p).filter((p) => !/^https?:/.test(p));
    if (!props.open || !paths.length) return;
    createClient().storage.from("tanda-terima").createSignedUrls(paths, 3600).then(({ data }) => {
      const map: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      setSigned(map);
    });
  }, [props.open, groups]);

  return (
    <Modal open={props.open} onClose={props.onClose} title={`Jumlah Foto: ${groups.length} (dari ${props.rows.length} invoice dipilih)`} wide>
      {groups.length === 0 && <p className="text-sm text-fg-2">Tidak ada foto tanda terima untuk invoice yang dipilih.</p>}
      <div className="space-y-4">
        {groups.map(([path, invs], i) => {
          const url = /^https?:/.test(path) ? path : signed[path];
          return (
            <figure key={path} className="rounded-xl bg-surface-2 p-3">
              <figcaption className="mb-2 text-sm">
                <b>Foto #{i + 1}</b> · {invs.join(", ")}
                {url && <a href={url} target="_blank" rel="noreferrer" className="ml-2 text-accent hover:underline">Buka / Unduh</a>}
              </figcaption>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={/^https?:/.test(path) ? driveThumb(path) : url} alt={`Tanda terima ${invs.join(", ")}`} className="max-h-[60vh] rounded-lg" />
              ) : (
                <p className="text-xs text-fg-2">Pratinjau tidak tersedia.</p>
              )}
            </figure>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Resi ekspedisi (TIKI) ────────────────────────────────────────────
export function ResiModal(props: { open: boolean; onClose: () => void; rows: CollectionRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of props.rows) {
      if (r.metode_tukar !== "Ekspedisi") continue;
      const resi = r.resi || r.ket_tukar;
      if (resi) map.set(resi, [...(map.get(resi) ?? []), r.invoice_no]);
    }
    return [...map.entries()];
  }, [props.rows]);

  return (
    <Modal open={props.open} onClose={props.onClose} title="No Resi Ekspedisi">
      {groups.length === 0 && <p className="text-sm text-fg-2">Tidak ada No Resi. Hanya Ekspedisi (Tiki).</p>}
      <ul className="space-y-2">
        {groups.map(([resi, invs]) => (
          <li key={resi} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{resi}</div>
              <div className="truncate text-xs text-fg-2">{invs.join(", ")}</div>
            </div>
            <a href={`https://tiki.id/id/track?awb=${encodeURIComponent(resi)}`} target="_blank" rel="noreferrer" className={btnGhost}>
              Lacak
            </a>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
