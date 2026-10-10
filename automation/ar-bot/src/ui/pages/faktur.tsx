// Upload Faktur Pajak (EDI Mitra 10): PDF → pecah per faktur → data PO → pilih → uji coba / unggah (dengan konfirmasi).
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, chip, emptyTd, inputCls, segGroup, segItem, tableCls, td, th } from "@/components/ui";
import type { JobParams } from "~/shared/types";
import { api, fileToBase64, fmtSize, withToken } from "../api";
import { useApp } from "../store";
import { Card, Confirm, Field, PageHeader } from "../parts/common";
import { JobLog, RunButtons, useSaveConfig } from "../parts/run";

type Item = { index: number; invoice: string; faktur: string; filename: string; pages: number; size: number; checked: boolean; status: string; no_po?: string; no_sj?: string; open_amt?: number };
type Manifest = { source: string | null; createdAt: string | null; totalPages: number; items: Item[] };

const statusTone = (s: string) => s.startsWith("Uploaded") ? "bg-success/15 text-success"
  : s === "Ready" ? "bg-fill-3 text-fg-2" : s.endsWith("(uji coba)") ? "bg-pill text-pill-fg" : "bg-warning/15 text-warning";

export function FakturPage() {
  const { state, history } = useApp();
  const save = useSaveConfig();
  const toast = useToast();
  const [man, setMan] = useState<Manifest | null>(null);
  const [busy, setBusy] = useState("");
  const [paste, setPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<Item | null>(null);
  const [confirm, setConfirm] = useState<(() => void) | null>(null);
  const [clear, setClear] = useState(false);
  const pdfIn = useRef<HTMLInputElement>(null), poIn = useRef<HTMLInputElement>(null);
  const cfg = state!.config;
  const p: JobParams = { mode: "draft", ...cfg.jobs["edi.upload-faktur"] };
  const accounts = cfg.edi.accounts;
  const account = p.accounts?.[0] ?? accounts.find((a) => a.active)?.id;
  const lastRun = history.find((r) => r.jobs.some((j) => j.id === "edi.upload-faktur"));

  const reload = () => api<Manifest>("/api/faktur").then(setMan);
  useEffect(() => { void reload(); }, [lastRun?.finishedAt]); // status diperbarui runner

  const act = async (label: string, fn: () => Promise<Manifest | void>) => {
    setBusy(label);
    try { const m = await fn(); if (m) setMan(m); } catch (e) { toast((e as Error).message, "danger", 6000); } finally { setBusy(""); }
  };
  const onPdf = (f?: File) => f && act("pdf", async () => {
    const m = await api<Manifest>("/api/faktur/pdf", { name: f.name, base64: await fileToBase64(f) });
    toast(`${m.items.length} faktur dari ${m.totalPages} halaman.`, "success");
    return m;
  });
  const onPo = (body: { base64?: string; text?: string }) => act("po", async () => {
    const r = await api<{ matched: number; dataRows: number; manifest: Manifest }>("/api/faktur/po", body);
    toast(`${r.matched} invoice cocok dari ${r.dataRows} baris data.`, r.matched ? "success" : "warning");
    setPaste(false);
    setPasteText("");
    return r.manifest;
  });
  const patch = (it: Item, patch: Partial<Item>) => act("", () => api<Manifest>("/api/faktur/item", { invoice: it.invoice, patch }));
  const items = man?.items ?? [];
  const checked = items.filter((i) => i.checked);
  const queue = useMemo(() => items.filter((i) => i.checked && !i.status.startsWith("Uploaded") && (p.mode === "not_found" ? i.status === "Not Found in Draft" || !!i.no_po : true)), [items, p.mode]);
  const setParam = (x: JobParams) => save((c) => ({ ...c, jobs: { ...c.jobs, "edi.upload-faktur": { ...c.jobs["edi.upload-faktur"], ...x } } }));
  const reason = !account ? "Tambahkan akun EDI dulu." : !queue.length ? "Tidak ada faktur tercentang yang belum terunggah." : null;

  return (
    <div className="grid gap-4">
      <PageHeader title="Upload Faktur Pajak">
        <RunButtons jobs={[{ id: "edi.upload-faktur", params: { accounts: account ? [account] : [], mode: p.mode } }]} disabledReason={reason}
          confirm={(go) => setConfirm(() => go)} />
      </PageHeader>

      <Card title="Dokumen" actions={<>
        <input ref={pdfIn} type="file" accept="application/pdf" hidden onChange={(e) => { onPdf(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={poIn} type="file" accept=".xlsx,.xls,.csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPo({ base64: await fileToBase64(f) }); }} />
        <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => pdfIn.current?.click()}><Icon name="picture_as_pdf" />{busy === "pdf" ? "Memecah…" : "PDF Faktur"}</button>
        <button type="button" className={btnGhost} disabled={!!busy || !items.length} onClick={() => poIn.current?.click()}><Icon name="table_view" />Excel PO</button>
        <button type="button" className={btnGhost} disabled={!!busy || !items.length} onClick={() => setPaste(true)}><Icon name="edit_note" />Tempel PO</button>
        <button type="button" className={btnGhost} disabled={!!busy || !items.length} onClick={() => setClear(true)} aria-label="Kosongkan daftar"><Icon name="delete_sweep" /></button>
      </>}>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[13px]">
          {man?.source && <span className="text-fg-2">{man.source} · {items.length} faktur · {checked.length} dipilih · {queue.length} antre</span>}
          <div className={segGroup} role="group" aria-label="Mode">
            {(["draft", "not_found"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={p.mode === m} className={segItem(p.mode === m)} onClick={() => setParam({ mode: m })}>
                {m === "draft" ? "Draft (No Invoice)" : "Not Found in Draft (No PO)"}
              </button>
            ))}
          </div>
          <Field label="" className="w-56">
            <select className={inputCls} value={account ?? ""} onChange={(e) => setParam({ accounts: [e.target.value] })} aria-label="Akun EDI">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label || a.username}</option>)}
            </select>
          </Field>
        </div>
        <div className="max-h-[calc(100vh-330px)] overflow-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={th}><input type="checkbox" aria-label="Pilih semua" checked={!!items.length && checked.length === items.length}
                onChange={(e) => act("", () => api<Manifest>("/api/faktur/check", { invoices: e.target.checked ? items.map((i) => i.invoice) : [] }))} /></th>
              <th className={th}>No Invoice</th><th className={th}>No Faktur</th><th className={th}>Hal</th>
              <th className={th}>No PO</th><th className={th}>No SJ</th><th className={`${th} text-right`}>Open Amt</th><th className={th}>Status</th><th className={th} />
            </tr></thead>
            <tbody>
              {!items.length && <tr><td colSpan={9} className={emptyTd}>Belum ada faktur.</td></tr>}
              {items.map((it) => (
                <tr key={it.invoice}>
                  <td className={td}><input type="checkbox" checked={it.checked} aria-label={`Pilih ${it.invoice}`} onChange={(e) => patch(it, { checked: e.target.checked })} /></td>
                  <td className={td}>{it.invoice}</td>
                  <td className={`${td} text-fg-2`}>{it.faktur}</td>
                  <td className={td}>{it.pages}</td>
                  <td className={td}><Cell value={it.no_po ?? ""} label="No PO" onSave={(v) => patch(it, { no_po: v })} /></td>
                  <td className={td}><Cell value={it.no_sj ?? ""} label="No SJ" onSave={(v) => patch(it, { no_sj: v })} /></td>
                  <td className={`${td} text-right`}><Cell value={it.open_amt ? it.open_amt.toLocaleString("id-ID") : ""} label="Open Amt" right onSave={(v) => patch(it, { open_amt: Number(v.replace(/\D/g, "")) || 0 })} /></td>
                  <td className={td}><span className={`${chip} ${statusTone(it.status)}`} title={it.status}>{it.status.length > 34 ? `${it.status.slice(0, 34)}…` : it.status}</span></td>
                  <td className={td}><button type="button" className={btnGhost} onClick={() => setPreview(it)} aria-label={`Lihat PDF ${it.invoice}`}><Icon name="visibility" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Log"><JobLog jobId="edi.upload-faktur" /></Card>

      <Modal open={paste} title="Tempel data PO" onClose={() => setPaste(false)} wide
        footer={<>
          <button type="button" className={btnGhost} onClick={() => setPaste(false)}>Batal</button>
          <button type="button" className={btnPrimary} disabled={!pasteText.trim() || busy === "po"} onClick={() => onPo({ text: pasteText })}>Cocokkan</button>
        </>}>
        <textarea className={`${inputCls} h-64 font-mono`} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
          placeholder={"Invoice No\tNo PO\tNo SJ\tOpen Amt"} aria-label="Data PO" />
      </Modal>
      <Modal open={!!preview} title={preview ? `${preview.invoice} · ${preview.faktur} · ${fmtSize(preview.size)}` : ""} onClose={() => setPreview(null)} xl>
        {preview && <iframe title="Pratinjau PDF" className="h-[75vh] w-full rounded-lg border border-hairline" src={withToken(`/api/faktur/file?name=${encodeURIComponent(preview.filename)}`)} />}
      </Modal>
      <Confirm open={!!confirm} title="Unggah ke EDI Mitra 10" confirmLabel={`Unggah ${queue.length} faktur`} onClose={() => setConfirm(null)} onConfirm={() => confirm?.()}>
        {queue.length} faktur akan diunggah & dikirim (Send) dengan akun <b>{accounts.find((a) => a.id === account)?.label}</b>, mode <b>{p.mode === "not_found" ? "Not Found in Draft" : "Draft"}</b>. Tindakan ini tidak bisa dibatalkan dari aplikasi.
      </Confirm>
      <Confirm open={clear} title="Kosongkan daftar faktur" confirmLabel="Kosongkan" danger onClose={() => setClear(false)}
        onConfirm={() => act("", () => api<Manifest>("/api/faktur/clear", {}))}>
        Daftar dan file PDF hasil pecahan dihapus dari folder kerja AR Bot.
      </Confirm>
    </div>
  );
}

/** Sel teks yang bisa diubah langsung (simpan saat Enter / fokus lepas). */
function Cell({ value, label, onSave, right }: { value: string; label: string; onSave: (v: string) => void; right?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input className={`${inputCls} !min-h-7 w-36 !py-0.5 ${right ? "text-right" : ""}`} value={v} aria-label={label}
      onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
