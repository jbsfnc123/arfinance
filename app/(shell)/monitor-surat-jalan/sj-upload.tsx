"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/modal";
import { TableBox } from "@/components/table-box";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, emptyTd, inputCls, td, th } from "@/components/ui";
import { fmtTimestamp } from "@/lib/format";
import { parseSjCsv, SJ_HEADERS, type SjParseResult } from "@/lib/modules/sj/parse";
import { activeSet, normName, receiverImpact, type SjReceiver } from "@/lib/modules/sj/compute";
import type { SjState } from "./use-sj";

const CHUNK = 2000;
const MAX_ROWS = 60000; // batas server per upload (commit atomik tetap di bawah batas waktu query)
const REQUIRED = new Set(["SJ No.", "Tanggal SJ", "Receive Date", "Receiver"]);
const n = (v: number) => v.toLocaleString("id-ID");

async function sha256(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Parsed = SjParseResult & { file: File; sha: string };
type Result = { batch: number; total: number; new: number; dup: number; bad: number; seenAt: string | null; file: string };

// Upload & Setting: file → parse & validasi di browser → pratinjau → Import bertahap (staging) → commit atomik di server.
// Hasil yang ditampilkan adalah hitungan dari server. Kontrol tulis hanya untuk Controller/Super Admin (server tetap menolak).
export function SjUpload({ s }: { s: SjState }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"parse" | "import" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const can = s.canManage;
  const ready = !!s.ds.data; // sebelum data termuat: hak akses & daftar Receiver belum diketahui (jangan tampil "tidak berhak")

  async function pick(file: File | undefined) {
    setParsed(null); setParseErr(null); setResult(null); setImportErr(null);
    if (!file) return;
    setBusy("parse");
    try {
      const [text, sha] = await Promise.all([file.text(), sha256(file)]);
      const p = parseSjCsv(text);
      if (!p.rows.length) throw new Error("Tidak ada baris data yang bisa diimpor.");
      if (p.rows.length > MAX_ROWS) throw new Error(`File berisi ${n(p.rows.length)} baris; maksimal ${n(MAX_ROWS)} per upload. Pecah file per periode lalu upload bergantian.`);
      setParsed({ ...p, file, sha });
    } catch (e) {
      setParseErr((e as Error).message);
    } finally { setBusy(null); }
  }

  async function runImport() {
    if (!parsed || !can) return;
    setBusy("import"); setImportErr(null); setProgress({ done: 0, total: parsed.rows.length });
    const call = async <T,>(fn: string, args: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc(fn as never, args as never);
      if (error) throw new Error(error.message);
      return data as T;
    };
    try {
      const b = await call<{ batch: number; seenAt: string | null }>("sj_upload_begin", {
        p_file_name: parsed.file.name, p_sha256: parsed.sha, p_rows_total: parsed.rows.length, p_rows_bad: parsed.bad.length,
      });
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const chunk = parsed.rows.slice(i, i + CHUNK).map((r, j) => ({ ...r, line: parsed.lines[i + j] }));
        await call("sj_upload_rows", { p_batch: b.batch, p_offset: i, p_rows: chunk });
        setProgress({ done: Math.min(i + CHUNK, parsed.rows.length), total: parsed.rows.length });
      }
      const r = await call<Omit<Result, "seenAt" | "file">>("sj_upload_commit", { p_batch: b.batch });
      setResult({ ...r, seenAt: b.seenAt, file: parsed.file.name });
      setParsed(null); setInputKey((k) => k + 1);
      await s.ds.reload();
      toast(`Upload selesai: ${n(r.new)} kejadian baru, ${n(r.dup)} identik dilewati.`, "success", 8000);
    } catch (e) {
      // Batch yang gagal tidak pernah terpublikasi; ulangi aman (kejadian identik dilewati).
      setImportErr((e as Error).message);
    } finally { setBusy(null); setProgress(null); }
  }

  const unknownReceivers = useMemo(() => {
    if (!parsed || !s.ds.data) return null;
    const m = new Map<string, number>();
    for (const r of parsed.rows) if (r.receiver && !s.recognized.has(normName(r.receiver))) m.set(r.receiver.trim(), (m.get(r.receiver.trim()) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [parsed, s.ds.data, s.recognized]);

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
          <p className="text-xs text-fg-2">
            File CSV <i>LaporanSerahTerimaSuratJalan</i> (18 kolom, pemisah koma, maks. 60.000 baris per upload). File dibaca dan divalidasi di browser dulu; data
            baru tampil setelah seluruh upload selesai.
          </p>
          <label className="block text-sm">
            <span className="sr-only">Pilih file CSV</span>
            <input key={inputKey} type="file" accept=".csv,text/csv" disabled={!can || busy !== null}
              onChange={(e) => void pick(e.target.files?.[0])} className={inputCls} aria-describedby="sj-upload-policy" />
          </label>
          {busy === "parse" && <p className="text-sm text-accent" role="status">Membaca & memvalidasi file…</p>}
          {parseErr && <p className="text-sm text-danger" role="alert">{parseErr}</p>}
          <ul id="sj-upload-policy" className="list-disc space-y-0.5 pl-5 text-xs text-fg-2">
            <li>Satu baris CSV = satu kejadian kirim/terima. SJ yang sama bisa muncul beberapa kali (riwayat) — semuanya disimpan.</li>
            <li>Upload ulang file yang sama atau yang tumpang tindih tidak menggandakan data: baris yang identik persis dilewati, baris baru ditambahkan.</li>
            <li>Upload tidak pernah menghapus atau mengubah data lama. Penerimaan pertama dari upload yang lebih awal tetap menjadi acuan.</li>
            <li>Upload yang gagal di tengah jalan tidak ditampilkan sama sekali dan aman diulang.</li>
          </ul>
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
              <button type="button" className={btnPrimary} disabled={!ready || !can || busy !== null} onClick={() => void runImport()}>
                Import {n(parsed.rows.length)} baris
              </button>
            </div>
          </div>
          {progress && (
            <div role="progressbar" aria-label="Progres upload" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}
              aria-valuetext={`${n(progress.done)} dari ${n(progress.total)} baris terkirim`}>
              <div className="h-2 overflow-hidden rounded-full bg-fill-3">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-fg-2">{n(progress.done)} / {n(progress.total)} baris terkirim ke staging…</p>
            </div>
          )}
          {importErr && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px]" role="alert">
              <b className="text-danger">Upload gagal, tidak ada data yang ditampilkan:</b> {importErr} — tekan Import lagi untuk mengulang.
            </p>
          )}
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Stat k="Baris data dibaca" v={n(parsed.stats.records)} />
            <Stat k="Siap diimpor" v={n(parsed.rows.length)} />
            <Stat k="Baris bermasalah (tidak diimpor)" v={n(parsed.bad.length)} />
            <Stat k="SJ unik" v={n(parsed.stats.uniqueSj)} />
            <Stat k="SJ muncul lebih dari sekali" v={n(parsed.stats.repeatedSj)} />
            <Stat k="Baris dengan Receiver" v={n(parsed.stats.withReceiver)} />
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
                          <td className={`${td} ${found ? "" : REQUIRED.has(h) ? "text-danger" : "text-warning"}`}>
                            {found ? "Ditemukan" : REQUIRED.has(h) ? "Tidak ada (wajib)" : "Tidak ada (dikosongkan)"}{REQUIRED.has(h) && found ? " · wajib" : ""}
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
                <h3 className="text-sm font-medium">Receiver di luar daftar</h3>
                {unknownReceivers === null ? <p className="mt-1 text-[13px] text-fg-2">Menunggu daftar Receiver…</p> : unknownReceivers.length ? (
                  <ul className="mt-1 text-[13px]">
                    {unknownReceivers.slice(0, 10).map(([name, c]) => <li key={name}>{name} — {n(c)} baris (tidak diakui sebagai penerimaan)</li>)}
                  </ul>
                ) : <p className="mt-1 text-[13px] text-fg-2">Tidak ada.</p>}
              </div>
              <div>
                <h3 className="text-sm font-medium">Baris bermasalah</h3>
                {parsed.bad.length ? (
                  <TableBox bare fill={false} maxHeight="max-h-[25vh]" className="mt-1">
                    <table className="w-full text-[13px]">
                      <thead><tr className="border-b border-line"><th className={th}>Baris file</th><th className={th}>Alasan</th></tr></thead>
                      <tbody>{parsed.bad.slice(0, 200).map((b) => <tr key={b.line} className="border-b border-line/50"><td className={td}>{b.line}</td><td className={td}>{b.reason}</td></tr>)}</tbody>
                    </table>
                  </TableBox>
                ) : <p className="mt-1 text-[13px] text-fg-2">Tidak ada.</p>}
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium">Contoh 5 baris pertama</h3>
            <TableBox bare fill={false} maxHeight="max-h-[30vh]" className="mt-1">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line">
                  <th className={th}>Baris</th><th className={th}>SJ No.</th><th className={th}>Tanggal SJ</th><th className={th}>Area</th>
                  <th className={th}>Receiver</th><th className={th}>Receive Date</th>
                </tr></thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className={td}>{parsed.lines[i]}</td><td className={td}>{r.sj_no}</td>
                      <td className={td}>{r.tanggal_sj_raw} → {r.tanggal_sj ?? "tidak valid"}</td><td className={td}>{r.area}</td>
                      <td className={td}>{r.receiver ?? "—"}</td><td className={td}>{r.receive_date ?? (r.receive_date_raw === "-" ? "—" : `${r.receive_date_raw} (tidak valid)`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableBox>
          </div>
        </section>
      )}

      {result && (
        <section className={`${card} p-4`} role="status" aria-label="Hasil upload">
          <h2 className="font-medium">Hasil upload (dikonfirmasi server): {result.file}</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Stat k="Baris dikirim" v={n(result.total)} />
            <Stat k="Kejadian baru disimpan" v={n(result.new)} />
            <Stat k="Identik, dilewati" v={n(result.dup)} />
            <Stat k="Bermasalah, tidak diimpor" v={n(result.bad)} />
          </dl>
          {result.seenAt && <p className="mt-2 text-xs text-fg-2">File yang sama persis pernah diunggah pada {fmtTimestamp(result.seenAt)}.</p>}
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
  const batches = s.ds.data?.batches ?? [];
  return (
    <section className={`${card} overflow-hidden`}>
      <h2 className="px-4 pt-3 text-sm font-medium">Riwayat upload</h2>
      <TableBox bare fill={false} maxHeight="max-h-[40vh]" className="mt-2">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="border-b border-line">
            <th className={th}>Waktu</th><th className={th}>File</th><th className={th}>Oleh</th><th className={`${th} text-right`}>Baris</th>
            <th className={`${th} text-right`}>Baru</th><th className={`${th} text-right`}>Identik</th><th className={`${th} text-right`}>Bermasalah</th>
          </tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-line/50">
                <td className={td}>{fmtTimestamp(b.published_at)}</td>
                <td className={`${td} max-w-[18rem] truncate`} title={b.file_name}>{b.file_name}</td>
                <td className={td}>{b.uploader}</td><td className={`${td} text-right`}>{n(b.rows_total)}</td>
                <td className={`${td} text-right`}>{n(b.rows_new)}</td><td className={`${td} text-right`}>{n(b.rows_dup)}</td><td className={`${td} text-right`}>{n(b.rows_bad)}</td>
              </tr>
            ))}
            {!batches.length && <tr><td className={emptyTd} colSpan={7}>{s.loading ? "Memuat…" : "Belum ada upload."}</td></tr>}
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
    return receiverImpact(s.ds.data.events, s.recognized, activeSet(next), s.today);
  }, [pending, receivers, s.ds.data, s.recognized, s.today]);

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
      <p className="text-xs text-fg-2">
        SJ dianggap sudah diterima bila salah satu baris sumbernya berisi nama aktif di daftar ini (tanpa beda huruf besar/kecil dan
        spasi berlebih; tanpa pencocokan mirip). Perubahan langsung memengaruhi status, acuan, dan rata-rata.
      </p>
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
              <li>{n(impact?.statusChanged ?? 0)} SJ berubah status (Sudah ↔ Belum diterima)</li>
              <li>{n(impact?.refChanged ?? 0)} SJ berubah acuan penerimaan (Receiver / Receive Date / durasi)</li>
            </ul>
            <p className="text-xs text-fg-2">Riwayat baris sumber tidak diubah atau dihapus. Perubahan dicatat di jejak perubahan.</p>
          </div>
        )}
      </Modal>
    </section>
  );
}
