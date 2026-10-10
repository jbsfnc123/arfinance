"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/modal";
import { TableBox } from "@/components/table-box";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, emptyTd, inputCls, td, th } from "@/components/ui";
import { fmtDate, fmtTimestamp } from "@/lib/format";
import { parseSjCsv, receiptCandidates, SJ_HEADERS, type SjCandidate, type SjParseResult } from "@/lib/modules/sj/parse";
import { activeSet, normName, receiverImpact, type SjReceiver } from "@/lib/modules/sj/compute";
import type { SjState } from "./use-sj";

const MAX_ROWS = 60000; // batas server per upload
const REQUIRED = new Set(["SJ No.", "Receive Date", "Receiver"]);
const n = (v: number) => v.toLocaleString("id-ID");

type Parsed = SjParseResult & { file: File };
type Result = { sent: number; saved: number; existing: number; notInAging: number; notRecognized: number; badDate: number; file: string };

/** Pratinjau: kandidat penerimaan dibagi menurut relasi aging & data tersimpan (perkiraan; hasil final dari server). */
export function previewCandidates(cands: readonly SjCandidate[], agingKeys: ReadonlySet<string>, receiptKeys: ReadonlySet<string>) {
  const inAging = cands.filter((c) => agingKeys.has(c.sj_key));
  const toSave = inAging.filter((c) => !receiptKeys.has(c.sj_key));
  return { inAging: inAging.length, notInAging: cands.length - inAging.length, existing: inAging.length - toSave.length, toSave };
}

// Upload & Setting: file → parse di browser → kandidat (per SJ: baris pertama dengan Receiver diakui & Receive Date valid)
// → pratinjau relasi aging → satu RPC atomik. Server menyaring ulang (aging terbaru, Receiver aktif, tanggal) dan tidak
// menimpa Receive Date yang sudah ada. Kontrol tulis hanya untuk Controller/Super Admin (server tetap menolak).
export function SjUpload({ s }: { s: SjState }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"parse" | "import" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const can = s.canManage;
  const ready = !!s.ds.data; // sebelum data termuat: hak akses, aging & daftar Receiver belum diketahui

  async function pick(file: File | undefined) {
    setParsed(null); setParseErr(null); setResult(null); setImportErr(null);
    if (!file) return;
    setBusy("parse");
    try {
      const p = parseSjCsv(await file.text());
      if (!p.rows.length) throw new Error("Tidak ada baris data yang bisa dibaca.");
      if (p.rows.length > MAX_ROWS) throw new Error(`File berisi ${n(p.rows.length)} baris; maksimal ${n(MAX_ROWS)} per upload. Pecah file per periode lalu upload bergantian.`);
      setParsed({ ...p, file });
    } catch (e) {
      setParseErr((e as Error).message);
    } finally { setBusy(null); }
  }

  const cands = useMemo(() => (parsed && ready ? receiptCandidates(parsed, s.recognized) : null), [parsed, ready, s.recognized]);
  const prev = useMemo(() => (cands ? previewCandidates(cands, s.agingKeys, s.receiptKeys) : null), [cands, s.agingKeys, s.receiptKeys]);

  async function runImport() {
    if (!parsed || !can || !prev) return;
    setBusy("import"); setImportErr(null);
    try {
      // Hanya kandidat yang cocok aging & belum punya Receive Date yang dikirim; server tetap memeriksa ulang.
      const rows = prev.toSave.map(({ sj_key, sj_no, receive_date, receiver }) => ({ sj_key, sj_no, receive_date, receiver }));
      const { data, error } = await supabase.rpc("sj_receipts_apply" as never, { p_file_name: parsed.file.name, p_rows: rows } as never);
      if (error) throw new Error(error.message);
      const r = data as Omit<Result, "file">;
      setResult({ ...r, file: parsed.file.name });
      setParsed(null); setInputKey((k) => k + 1);
      await s.ds.reload();
      toast(`Upload selesai: ${n(r.saved)} SJ mendapat Receive Date.`, "success", 8000);
    } catch (e) {
      setImportErr((e as Error).message);
    } finally { setBusy(null); }
  }

  const unknownReceivers = useMemo(() => {
    if (!parsed || !ready) return null;
    const m = new Map<string, number>();
    for (const r of parsed.rows) if (r.receiver && !s.recognized.has(normName(r.receiver))) m.set(r.receiver.trim(), (m.get(r.receiver.trim()) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [parsed, ready, s.recognized]);

  return (
    <div className="space-y-4">
      {!ready && !s.error && <p className="text-sm text-fg-2" role="status">Memuat data & hak akses…</p>}
      {s.error && <p className="text-sm text-danger" role="alert">Gagal memuat data: {s.error.message}</p>}
      {ready && !can && (
        <p className={`${card} px-4 py-3 text-[13px]`} role="note">
          Anda dapat melihat data dan pengaturan. Upload dan perubahan daftar Receiver hanya untuk <b>Controller</b> dan <b>Super Admin</b>.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} space-y-3 p-4`}>
          <h2 className="font-medium">Upload Laporan Serah Terima Surat Jalan</h2>
          <label className="block text-sm">
            <span className="sr-only">Pilih file CSV</span>
            <input key={inputKey} type="file" accept=".csv,text/csv" disabled={!can || busy !== null}
              onChange={(e) => void pick(e.target.files?.[0])} className={inputCls} />
          </label>
          {busy === "parse" && <p className="text-sm text-accent" role="status">Membaca & memvalidasi file…</p>}
          {parseErr && <p className="text-sm text-danger" role="alert">{parseErr}</p>}
        </section>

        <ReceiverSettings s={s} />
      </div>

      {parsed && (
        <section className={`${card} space-y-3 p-4`} aria-label="Pratinjau upload">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">Pratinjau: {parsed.file.name}</h2>
            <span className="text-xs text-fg-2">{(parsed.file.size / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB</span>
            <div className="ml-auto flex gap-2">
              <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => { setParsed(null); setInputKey((k) => k + 1); }}>Batal</button>
              <button type="button" className={btnPrimary} disabled={!ready || !can || busy !== null || !prev?.toSave.length} onClick={() => void runImport()}>
                {busy === "import" ? "Menyimpan…" : `Simpan ${n(prev?.toSave.length ?? 0)} Receive Date`}
              </button>
            </div>
          </div>
          {importErr && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px]" role="alert">
              <b className="text-danger">Upload gagal, tidak ada data yang tersimpan:</b> {importErr} — tekan Simpan lagi untuk mengulang.
            </p>
          )}
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Stat k="Baris data dibaca" v={n(parsed.stats.records)} />
            <Stat k="SJ unik di file" v={n(parsed.stats.uniqueSj)} />
            <Stat k="SJ dengan penerimaan diakui" v={cands ? n(cands.length) : "…"} />
            <Stat k="· cocok Aging terbaru" v={prev ? n(prev.inAging) : "…"} />
            <Stat k="· tidak ada di Aging (dilewati)" v={prev ? n(prev.notInAging) : "…"} />
            <Stat k="· sudah punya Receive Date (dilewati)" v={prev ? n(prev.existing) : "…"} />
            <Stat k="Akan disimpan" v={prev ? n(prev.toSave.length) : "…"} />
            <Stat k="Baris bermasalah (No. SJ kosong / kolom)" v={n(parsed.bad.length)} />
            <Stat k="Baris dengan masalah tanggal" v={n(parsed.stats.dateIssues)} />
          </dl>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">Pemetaan kolom</h3>
              <TableBox bare fill={false} maxHeight="max-h-[40vh]" className="mt-1">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-line"><th className={th}>Kolom CSV</th><th className={th}>Status</th></tr></thead>
                  <tbody>
                    {SJ_HEADERS.map((h) => {
                      const found = parsed.headers.includes(h);
                      return (
                        <tr key={h} className="border-b border-line/50">
                          <td className={td}>{h}</td>
                          <td className={`${td} ${found ? "" : REQUIRED.has(h) ? "text-danger" : "text-fg-2"}`}>
                            {REQUIRED.has(h) ? (found ? "Ditemukan · dipakai" : "Tidak ada (wajib)") : found ? "Ditemukan · tidak disimpan" : "Tidak ada"}
                          </td>
                        </tr>
                      );
                    })}
                    {parsed.extraHeaders.map((h) => (
                      <tr key={`x-${h}`} className="border-b border-line/50"><td className={td}>{h}</td><td className={`${td} text-fg-2`}>Kolom tambahan — diabaikan</td></tr>
                    ))}
                  </tbody>
                </table>
              </TableBox>
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Receiver di luar daftar (tidak disimpan)</h3>
                {unknownReceivers === null ? <p className="mt-1 text-[13px] text-fg-2">Menunggu daftar Receiver…</p> : unknownReceivers.length ? (
                  <ul className="mt-1 text-[13px]">
                    {unknownReceivers.slice(0, 10).map(([name, c]) => <li key={name}>{name} — {n(c)} baris</li>)}
                  </ul>
                ) : <p className="mt-1 text-[13px] text-fg-2">Tidak ada.</p>}
              </div>
              <div>
                <h3 className="text-sm font-medium">Contoh yang akan disimpan</h3>
                {prev?.toSave.length ? (
                  <TableBox bare fill={false} maxHeight="max-h-[25vh]" className="mt-1">
                    <table className="w-full text-[13px]">
                      <thead><tr className="border-b border-line"><th className={th}>Baris</th><th className={th}>SJ No.</th><th className={th}>Receive Date</th><th className={th}>Receiver</th></tr></thead>
                      <tbody>{prev.toSave.slice(0, 8).map((c) => (
                        <tr key={c.sj_key} className="border-b border-line/50"><td className={td}>{c.line}</td><td className={td}>{c.sj_no}</td><td className={td}>{fmtDate(c.receive_date)}</td><td className={td}>{c.receiver}</td></tr>
                      ))}</tbody>
                    </table>
                  </TableBox>
                ) : <p className="mt-1 text-[13px] text-fg-2">{prev ? "Tidak ada SJ baru yang bisa diisi dari file ini." : "Menunggu data…"}</p>}
              </div>
            </div>
          </div>
        </section>
      )}

      {result && (
        <section className={`${card} p-4`} role="status" aria-label="Hasil upload">
          <h2 className="font-medium">Hasil upload (dikonfirmasi server): {result.file}</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Stat k="SJ dikirim" v={n(result.sent)} />
            <Stat k="Receive Date disimpan" v={n(result.saved)} />
            <Stat k="Sudah ada, tidak ditimpa" v={n(result.existing)} />
            <Stat k="Tidak ada di Aging" v={n(result.notInAging)} />
            <Stat k="Receiver tidak diakui" v={n(result.notRecognized)} />
            <Stat k="Tanggal tidak valid" v={n(result.badDate)} />
          </dl>
        </section>
      )}

      <UploadHistory s={s} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/40 py-1">
      <dt className="text-fg-2">{k}</dt><dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}

function UploadHistory({ s }: { s: SjState }) {
  const uploads = s.ds.data?.uploads ?? [];
  return (
    <section className={`${card} overflow-hidden`}>
      <h2 className="px-4 pt-3 text-sm font-medium">Riwayat upload</h2>
      <TableBox bare fill={false} maxHeight="max-h-[40vh]" className="mt-2">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="border-b border-line">
            <th className={th}>Waktu</th><th className={th}>File</th><th className={th}>Oleh</th><th className={`${th} text-right`}>Receive Date disimpan</th>
          </tr></thead>
          <tbody>
            {uploads.map((u, i) => (
              <tr key={i} className="border-b border-line/50">
                <td className={td}>{fmtTimestamp(u.at)}</td>
                <td className={`${td} max-w-[18rem] truncate`} title={u.file_name}>{u.file_name}</td>
                <td className={td}>{u.uploader}</td><td className={`${td} text-right`}>{n(u.rows ?? 0)}</td>
              </tr>
            ))}
            {!uploads.length && <tr><td className={emptyTd} colSpan={4}>{s.loading ? "Memuat…" : "Belum ada upload."}</td></tr>}
          </tbody>
        </table>
      </TableBox>
    </section>
  );
}

type Change = { id: number | null; name: string; active: boolean; label: string };
const ACTION_LABEL: Record<string, string> = { tambah: "Tambah", ubah: "Ubah nama", aktifkan: "Aktifkan", nonaktifkan: "Nonaktifkan" };

/** Daftar Receiver yang diakui: tambah / ubah / nonaktifkan, dengan pratinjau dampak dan jejak perubahan. */
function ReceiverSettings({ s }: { s: SjState }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const receivers = useMemo(() => s.ds.data?.receivers ?? [], [s.ds.data]);
  const log = s.ds.data?.log ?? [];
  const can = s.canManage;
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<{ id: number; name: string } | null>(null);
  const [pending, setPending] = useState<Change | null>(null);
  const [saving, setSaving] = useState(false);

  const validate = (name: string, id: number | null) => {
    const norm = normName(name);
    if (!norm) return "Nama wajib diisi.";
    if (norm.length > 120) return "Maksimal 120 karakter.";
    const dup = receivers.find((r) => normName(r.name) === norm && r.id !== id);
    return dup ? `Nama "${dup.name}" sudah ada di daftar${dup.active ? "" : " (nonaktif — aktifkan saja)"}.` : null;
  };
  const draftErr = draft ? validate(draft, null) : null;
  const editErr = edit ? validate(edit.name, edit.id) : null;

  const impact = useMemo(() => {
    if (!pending || !s.ds.data) return null;
    const next: SjReceiver[] = pending.id === null
      ? [...receivers, { id: -1, name: pending.name, active: pending.active }]
      : receivers.map((r) => (r.id === pending.id ? { ...r, name: pending.name, active: pending.active } : r));
    return receiverImpact(s.ds.data.receipts, s.agingKeys, s.recognized, activeSet(next));
  }, [pending, receivers, s.ds.data, s.agingKeys, s.recognized]);

  async function confirm() {
    if (!pending) return;
    setSaving(true);
    const { error } = await supabase.rpc("sj_receiver_save" as never, { p_id: pending.id, p_name: pending.name, p_active: pending.active } as never);
    setSaving(false);
    if (error) { toast(`Gagal: ${error.message}`, "danger", 7000); return; }
    toast(`${pending.label}: ${pending.name.trim()} disimpan.`, "success");
    setPending(null); setDraft(""); setEdit(null);
    await s.ds.reload();
  }

  return (
    <section className={`${card} space-y-3 p-4`}>
      <h2 className="font-medium">Receiver yang diakui</h2>
      {!s.ds.data && <p className="text-sm text-fg-2">Memuat daftar Receiver…</p>}
      <ul className="divide-y divide-line/50 text-sm">
        {receivers.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
            {edit?.id === r.id ? (
              <>
                <input value={edit.name} onChange={(e) => setEdit({ id: r.id, name: e.target.value })} className={`${inputCls} !w-56`}
                  aria-label={`Nama baru untuk ${r.name}`} aria-invalid={!!editErr} />
                <button type="button" className={btnPrimary} disabled={!!editErr || normName(edit.name) === normName(r.name) && edit.name.trim() === r.name}
                  onClick={() => setPending({ id: r.id, name: edit.name, active: r.active, label: "Ubah nama" })}>Simpan…</button>
                <button type="button" className={btnGhost} onClick={() => setEdit(null)}>Batal</button>
                {editErr && <span className="w-full text-xs text-danger">{editErr}</span>}
              </>
            ) : (
              <>
                <span className={r.active ? "" : "text-fg-2 line-through"}>{r.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${r.active ? "bg-success/20 text-success" : "bg-fill-3 text-fg-2"}`}>{r.active ? "Aktif" : "Nonaktif"}</span>
                {can && (
                  <span className="ml-auto flex gap-1.5">
                    <button type="button" className={btnGhost} onClick={() => setEdit({ id: r.id, name: r.name })}>Ubah</button>
                    <button type="button" className={btnGhost}
                      onClick={() => setPending({ id: r.id, name: r.name, active: !r.active, label: r.active ? "Nonaktifkan" : "Aktifkan" })}>
                      {r.active ? "Nonaktifkan…" : "Aktifkan…"}
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {can && (
        <form className="flex flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); if (draft && !draftErr) setPending({ id: null, name: draft, active: true, label: "Tambah" }); }}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Nama Receiver baru</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nama Receiver baru" className={inputCls} aria-invalid={!!draftErr} />
            {draftErr && <span className="mt-1 block text-xs text-danger">{draftErr}</span>}
          </label>
          <button type="submit" className={btnPrimary} disabled={!draft.trim() || !!draftErr}>Tambah…</button>
        </form>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-fg-2">Jejak perubahan ({log.length})</summary>
        <TableBox bare fill={false} maxHeight="max-h-[30vh]" className="mt-2">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line"><th className={th}>Waktu</th><th className={th}>Aksi</th><th className={th}>Nama</th><th className={th}>Oleh</th></tr></thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={i} className="border-b border-line/50">
                  <td className={td}>{fmtTimestamp(l.at)}</td><td className={td}>{ACTION_LABEL[l.action] ?? l.action}</td>
                  <td className={td}>{l.action === "ubah" ? `${l.old_name} → ${l.new_name}` : l.new_name}</td><td className={td}>{l.by_name}</td>
                </tr>
              ))}
              {!log.length && <tr><td className={emptyTd} colSpan={4}>Belum ada perubahan (daftar awal: Bintang Anugia Arragi, Wienda Aswar).</td></tr>}
            </tbody>
          </table>
        </TableBox>
      </details>

      <Modal open={!!pending} title={`${pending?.label ?? ""} Receiver`} onClose={() => setPending(null)}
        footer={(
          <>
            <button type="button" className={btnGhost} onClick={() => setPending(null)}>Batal</button>
            <button type="button" className={btnPrimary} disabled={saving} onClick={() => void confirm()}>{saving ? "Menyimpan…" : "Simpan perubahan"}</button>
          </>
        )}>
        {pending && (
          <div className="space-y-2 text-sm">
            <p><b>{pending.label}:</b> {pending.name.trim().replace(/\s+/g, " ")}</p>
            <p className="font-medium">Dampak pada data saat ini:</p>
            <ul className="list-disc pl-5">
              <li>{n(impact?.statusChanged ?? 0)} SJ berubah status (Sudah ↔ Belum diterima) pada data tersimpan</li>
            </ul>
          </div>
        )}
      </Modal>
    </section>
  );
}
