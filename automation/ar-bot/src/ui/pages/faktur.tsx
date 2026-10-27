// Upload Faktur Pajak (EDI Mitra 10): PDF → pecah per faktur → data PO → pilih → uji coba / unggah (dengan konfirmasi).
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, chip, emptyTd, inputCls, segGroup, segItem, tableCls, td, th } from "@/components/ui";
import type { JobParams } from "~/shared/types";
import { parseAmount } from "~/faktur/amount";
import { checkedAfter, downloadName, EMPTY_FILTER, filterItems, isFiltered, STATUS_GROUPS, statusCounts, type FakturFilter } from "~/faktur/filter";
import { api, fileToBase64, fmtSize, withToken } from "../api";
import { useApp } from "../store";
import { Card, Confirm, Field, PageHeader } from "../parts/common";
import { JobLog, RunButtons, useSaveConfig } from "../parts/run";

type Item = { index: number; invoice: string; faktur: string; filename: string; pages: number; size: number; checked: boolean; status: string; no_po?: string; no_sj?: string; open_amt?: number; in_po?: boolean };
type PoResult = { matched: number; dataRows: number; excelRows: number; unmatchedExcel: string[]; notInPo: number; manifest: Manifest };
const FILTER_KEY = "arbot:faktur:filter";
/** URL PDF bernama No Faktur: penampil PDF & unduhan memakai nama itu. */
const fileUrl = (it: Pick<Item, "faktur" | "filename">, download = false) =>
  withToken(`/api/faktur/file/${encodeURIComponent(downloadName(it.faktur, it.filename))}?name=${encodeURIComponent(it.filename)}${download ? "&download=1" : ""}`);
type Manifest = { source: string | null; createdAt: string | null; totalPages: number; items: Item[] };

const statusTone = (s: string) => s.startsWith("Uploaded") ? "bg-success/15 text-success"
  : s === "Ready" ? "bg-fill-3 text-fg-2" : s.includes("(uji coba)") ? "bg-pill text-pill-fg" : "bg-warning/15 text-warning";

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
    const r = await api<PoResult>("/api/faktur/po", body);
    // Pilih cepat: invoice yang ada di data PO langsung dicentang (server), sisanya tidak.
    const extra = [r.unmatchedExcel.length ? `${r.unmatchedExcel.length} baris Excel tanpa faktur` : "", r.notInPo ? `${r.notInPo} faktur tidak ada di Excel (tidak dicentang)` : ""].filter(Boolean);
    toast([`${r.matched} invoice dicentang sesuai data PO`, ...extra].join(" · "), r.matched ? "success" : "warning", 8000);
    setPaste(false);
    setPasteText("");
    return r.manifest;
  });
  const patch = (it: Item, patch: Partial<Item>) => act("", () => api<Manifest>("/api/faktur/item", { invoice: it.invoice, patch }));
  const items = man?.items ?? [];
  const checked = items.filter((i) => i.checked);
  const queue = useMemo(() => items.filter((i) => i.checked && !i.status.startsWith("Uploaded") && (p.mode === "not_found" ? i.status === "Not Found in Draft" || !!i.no_po : true)), [items, p.mode]);
  // Filter (diingat di perangkat ini) — centang massal & checkbox header bekerja pada baris yang tampil.
  const [flt, setFltState] = useState<FakturFilter>(() => {
    try { return { ...EMPTY_FILTER, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? "{}") }; } catch { return EMPTY_FILTER; }
  });
  const setFlt = (x: Partial<FakturFilter>) => setFltState((f) => {
    const next = { ...f, ...x };
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch { /* penyimpanan diblokir */ }
    return next;
  });
  const shown = useMemo(() => filterItems(items, flt), [items, flt]);
  const counts = useMemo(() => statusCounts(items), [items]);
  const shownChecked = shown.filter((i) => i.checked).length;
  const hiddenChecked = checked.length - shownChecked;
  const setChecked = (invoices: string[]) => act("", () => api<Manifest>("/api/faktur/check", { invoices }));
  const headBox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headBox.current) headBox.current.indeterminate = shownChecked > 0 && shownChecked < shown.length; }, [shownChecked, shown.length]);
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
        {!!items.length && (
          <div className="mb-2 grid gap-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter">
              <input className={`${inputCls} !w-60`} value={flt.q} onChange={(e) => setFlt({ q: e.target.value })} placeholder="Cari invoice, faktur, PO, SJ, status" aria-label="Cari" />
              <select className={`${inputCls} !w-auto`} value={flt.status} onChange={(e) => setFlt({ status: e.target.value as FakturFilter["status"] })} aria-label="Filter status">
                <option value="">Semua status ({items.length})</option>
                {STATUS_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label} ({counts[g.id] ?? 0})</option>)}
              </select>
              <select className={`${inputCls} !w-auto`} value={flt.po} onChange={(e) => setFlt({ po: e.target.value as FakturFilter["po"] })} aria-label="Filter No PO">
                <option value="">No PO: semua</option>
                <option value="yes">Ada No PO ({items.filter((i) => i.no_po?.trim()).length})</option>
                <option value="no">Tanpa No PO ({items.filter((i) => !i.no_po?.trim()).length})</option>
              </select>
              <select className={`${inputCls} !w-auto`} value={flt.excel} onChange={(e) => setFlt({ excel: e.target.value as FakturFilter["excel"] })} aria-label="Filter Excel PO">
                <option value="">Excel PO: semua</option>
                <option value="yes">Ada di Excel PO ({items.filter((i) => i.in_po).length})</option>
                <option value="no">Tidak ada di Excel ({items.filter((i) => !i.in_po).length})</option>
              </select>
              {isFiltered(flt) && <button type="button" className={btnGhost} onClick={() => setFlt(EMPTY_FILTER)}><Icon name="filter_alt_off" />Reset filter</button>}
              <span className="ml-auto text-fg-2">Menampilkan {shown.length} dari {items.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Centang">
              <button type="button" className={btnGhost} disabled={!!busy || !shown.length} onClick={() => setChecked(checkedAfter(items, shown, "add"))}>Centang yang tampil</button>
              <button type="button" className={btnGhost} disabled={!!busy || !shownChecked} onClick={() => setChecked(checkedAfter(items, shown, "remove"))}>Hapus centang yang tampil</button>
              <button type="button" className={btnGhost} disabled={!!busy || !shown.length} onClick={() => setChecked(checkedAfter(items, shown, "only"))}
                title="Centang hanya baris yang tampil; centang lain dihapus">Hanya yang tampil</button>
              <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
              <button type="button" className={btnGhost} disabled={!!busy} onClick={() => setChecked(items.map((i) => i.invoice))}>Centang semua</button>
              <button type="button" className={btnGhost} disabled={!!busy || !checked.length} onClick={() => setChecked([])}>Hapus semua</button>
              <span className="ml-auto text-fg-2">
                {checked.length} dari {items.length} dicentang{hiddenChecked > 0 && <b className="text-warning"> · {hiddenChecked} di luar filter</b>}
              </span>
            </div>
          </div>
        )}
        <div className="max-h-[calc(100vh-410px)] overflow-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={th}><input ref={headBox} type="checkbox" aria-label="Pilih semua yang tampil" checked={!!shown.length && shownChecked === shown.length}
                onChange={(e) => setChecked(checkedAfter(items, shown, e.target.checked ? "add" : "remove"))} /></th>
              <th className={th}>No Invoice</th><th className={th}>No Faktur</th><th className={th}>Hal</th>
              <th className={th}>No PO</th><th className={th}>No SJ</th><th className={`${th} text-right`}>Open Amt</th><th className={th}>Status</th><th className={th} />
            </tr></thead>
            <tbody>
              {!items.length && <tr><td colSpan={9} className={emptyTd}>Belum ada faktur.</td></tr>}
              {!!items.length && !shown.length && <tr><td colSpan={9} className={emptyTd}>Tidak ada faktur yang cocok dengan filter.</td></tr>}
              {shown.map((it) => (
                <tr key={it.invoice}>
                  <td className={td}><input type="checkbox" checked={it.checked} aria-label={`Pilih ${it.invoice}`} onChange={(e) => patch(it, { checked: e.target.checked })} /></td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-1">{it.invoice}
                      {it.in_po && <span title="Ada di file Excel / tempel PO" className={`${chip} bg-accent/12 text-accent`}>PO</span>}
                    </span>
                  </td>
                  <td className={`${td} text-fg-2`}>{it.faktur}</td>
                  <td className={td}>{it.pages}</td>
                  <td className={td}><Cell value={it.no_po ?? ""} label="No PO" onSave={(v) => patch(it, { no_po: v })} /></td>
                  <td className={td}><Cell value={it.no_sj ?? ""} label="No SJ" onSave={(v) => patch(it, { no_sj: v })} /></td>
                  <td className={`${td} text-right`}><Cell value={it.open_amt ? it.open_amt.toLocaleString("id-ID") : ""} label="Open Amt" right onSave={(v) => patch(it, { open_amt: parseAmount(v) ?? 0 })} /></td>
                  <td className={td}><span className={`${chip} ${statusTone(it.status)}`} title={it.status}>{it.status.length > 34 ? `${it.status.slice(0, 34)}…` : it.status}</span></td>
                  <td className={`${td} whitespace-nowrap`}>
                    <button type="button" className={btnGhost} onClick={() => setPreview(it)} aria-label={`Lihat PDF ${it.invoice}`}><Icon name="visibility" /></button>
                    <a className={btnGhost} href={fileUrl(it, true)} download={downloadName(it.faktur, it.filename)} aria-label={`Unduh ${downloadName(it.faktur, it.filename)}`} title={downloadName(it.faktur, it.filename)}><Icon name="download" /></a>
                  </td>
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
        {preview && <>
          <div className="mb-2 flex justify-end">
            <a className={btnGhost} href={fileUrl(preview, true)} download={downloadName(preview.faktur, preview.filename)}><Icon name="download" />Unduh {downloadName(preview.faktur, preview.filename)}</a>
          </div>
          <iframe title="Pratinjau PDF" className="h-[72vh] w-full rounded-lg border border-hairline" src={fileUrl(preview)} />
        </>}
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
