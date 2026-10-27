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
// Sheet Invoice (mode Isi No Invoice): data sendiri dari Excel Invoice / tempel, tanpa PDF faktur.
type InvRow = { invoice: string; no_po: string; no_sj: string; open_amt: number; checked: boolean; status: string };
type InvSheet = { source: string | null; createdAt: string | null; items: InvRow[] };
type Mode = NonNullable<JobParams["mode"]>;
const MODES: { id: Mode; label: string }[] = [
  { id: "draft", label: "Upload FP" },
  { id: "not_found", label: "Isi No Invoice+Upload FP" },
  { id: "fill", label: "Isi No Invoice" },
];
const filled = (s: string) => s.startsWith("No Invoice Terisi");

const statusTone = (s: string) => s.startsWith("Uploaded") || filled(s) ? "bg-success/15 text-success"
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
  const [inv, setInv] = useState<InvSheet | null>(null);
  const invIn = useRef<HTMLInputElement>(null);
  // Sheet mengikuti mode: Isi No Invoice ⇔ sheet Invoice, dua mode lain ⇔ sheet Invoice+FP (data yang dijalankan = yang tampil).
  const fill = p.mode === "fill";

  const reload = () => Promise.all([api<Manifest>("/api/faktur").then(setMan), api<InvSheet>("/api/faktur/invoices").then(setInv)]);
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
  // Sheet Invoice
  const actInv = (label: string, fn: () => Promise<InvSheet>) => act(label, async () => { setInv(await fn()); });
  const onInv = (body: { base64?: string; text?: string; name?: string }) => actInv("inv", async () => {
    const r = await api<{ imported: number; skipped: number; sheet: InvSheet }>("/api/faktur/invoices/import", body);
    toast([`${r.imported} invoice dimuat ke sheet Invoice`, r.skipped ? `${r.skipped} baris tanpa No Invoice dilewati` : ""].filter(Boolean).join(" · "), "success", 6000);
    setPaste(false);
    setPasteText("");
    return r.sheet;
  });
  const patchInv = (it: InvRow, patch: Partial<InvRow>) => actInv("", () => api<InvSheet>("/api/faktur/invoices/item", { invoice: it.invoice, patch }));
  const items = man?.items ?? [];
  const invItems = inv?.items ?? [];
  const rows: { invoice: string; checked: boolean; status: string }[] = fill ? invItems : items;
  const checked = rows.filter((i) => i.checked);
  const queue = useMemo(() => fill ? invItems.filter((i) => i.checked && !filled(i.status))
    : items.filter((i) => i.checked && !i.status.startsWith("Uploaded") && (p.mode === "not_found" ? i.status === "Not Found in Draft" || !!i.no_po : true)), [items, invItems, p.mode, fill]);
  // Filter (diingat di perangkat ini) — centang massal & checkbox header bekerja pada baris yang tampil.
  const [flt, setFltState] = useState<FakturFilter>(() => {
    try { return { ...EMPTY_FILTER, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? "{}") }; } catch { return EMPTY_FILTER; }
  });
  const setFlt = (x: Partial<FakturFilter>) => setFltState((f) => {
    const next = { ...f, ...x };
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch { /* penyimpanan diblokir */ }
    return next;
  });
  const shownFp = useMemo(() => filterItems(items, flt), [items, flt]);
  // Sheet Invoice tidak punya No Faktur / tanda Excel PO: filter No PO & Excel diabaikan.
  const shownInv = useMemo(() => filterItems(invItems, { ...flt, po: "", excel: "" }), [invItems, flt]);
  const shown: { invoice: string; checked: boolean; status: string }[] = fill ? shownInv : shownFp;
  const counts = useMemo(() => statusCounts(fill ? invItems : items), [items, invItems, fill]);
  const shownChecked = shown.filter((i) => i.checked).length;
  const hiddenChecked = checked.length - shownChecked;
  const setChecked = (invoices: string[]) => fill
    ? actInv("", () => api<InvSheet>("/api/faktur/invoices/check", { invoices }))
    : act("", () => api<Manifest>("/api/faktur/check", { invoices }));
  const headBox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headBox.current) headBox.current.indeterminate = shownChecked > 0 && shownChecked < shown.length; }, [shownChecked, shown.length]);
  const setParam = (x: JobParams) => save((c) => ({ ...c, jobs: { ...c.jobs, "edi.upload-faktur": { ...c.jobs["edi.upload-faktur"], ...x } } }));
  const reason = !account ? "Tambahkan akun EDI dulu."
    : !queue.length ? (fill ? "Tidak ada invoice tercentang yang belum terisi." : "Tidak ada faktur tercentang yang belum terunggah.") : null;
  const modeLabel = MODES.find((x) => x.id === p.mode)?.label ?? "Upload FP";

  return (
    <div className="grid gap-4">
      <PageHeader title="Upload Faktur Pajak">
        <RunButtons jobs={[{ id: "edi.upload-faktur", params: { accounts: account ? [account] : [], mode: p.mode } }]} disabledReason={reason}
          confirm={(go) => setConfirm(() => go)} />
      </PageHeader>

      <Card title="Dokumen" actions={fill ? <>
        <input ref={invIn} type="file" accept=".xlsx,.xls,.csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onInv({ base64: await fileToBase64(f), name: f.name }); }} />
        <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => invIn.current?.click()}><Icon name="table_view" />{busy === "inv" ? "Memuat…" : "Excel Invoice"}</button>
        <button type="button" className={btnGhost} disabled={!!busy} onClick={() => setPaste(true)}><Icon name="edit_note" />Tempel Invoice</button>
        <button type="button" className={btnGhost} disabled={!!busy || !invItems.length} onClick={() => setClear(true)} aria-label="Kosongkan sheet Invoice"><Icon name="delete_sweep" /></button>
      </> : <>
        <input ref={pdfIn} type="file" accept="application/pdf" hidden onChange={(e) => { onPdf(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={poIn} type="file" accept=".xlsx,.xls,.csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPo({ base64: await fileToBase64(f) }); }} />
        <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => pdfIn.current?.click()}><Icon name="picture_as_pdf" />{busy === "pdf" ? "Memecah…" : "PDF Faktur"}</button>
        <button type="button" className={btnGhost} disabled={!!busy || !items.length} onClick={() => poIn.current?.click()}><Icon name="table_view" />Excel PO</button>
        <button type="button" className={btnGhost} disabled={!!busy || !items.length} onClick={() => setPaste(true)}><Icon name="edit_note" />Tempel PO</button>
        <button type="button" className={btnGhost} disabled={!!busy || !items.length} onClick={() => setClear(true)} aria-label="Kosongkan daftar"><Icon name="delete_sweep" /></button>
      </>}>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[13px]">
          {fill
            ? inv?.source && <span className="text-fg-2">{inv.source} · {invItems.length} invoice · {checked.length} dipilih · {queue.length} antre</span>
            : man?.source && <span className="text-fg-2">{man.source} · {items.length} faktur · {checked.length} dipilih · {queue.length} antre</span>}
          <div className={segGroup} role="group" aria-label="Mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={p.mode === m.id} className={segItem(p.mode === m.id)} onClick={() => setParam({ mode: m.id })}>
                {m.label}
              </button>
            ))}
          </div>
          <Field label="" className="w-56">
            <select className={inputCls} value={account ?? ""} onChange={(e) => setParam({ accounts: [e.target.value] })} aria-label="Akun EDI">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label || a.username}</option>)}
            </select>
          </Field>
        </div>
        <div className={`${segGroup} mb-3`} role="tablist" aria-label="Sheet">
          {([["fp", "Invoice+FP", items.length], ["inv", "Invoice", invItems.length]] as const).map(([id, label, n]) => {
            const on = (id === "inv") === fill;
            return (
              <button key={id} type="button" role="tab" aria-selected={on} className={segItem(on)}
                onClick={() => { if (!on) setParam({ mode: id === "inv" ? "fill" : "draft" }); }}>
                {label} <span className="text-fg-2">({n})</span>
              </button>
            );
          })}
        </div>
        {!!rows.length && (
          <div className="mb-2 grid gap-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter">
              <input className={`${inputCls} !w-60`} value={flt.q} onChange={(e) => setFlt({ q: e.target.value })} placeholder={fill ? "Cari invoice, PO, SJ, status" : "Cari invoice, faktur, PO, SJ, status"} aria-label="Cari" />
              <select className={`${inputCls} !w-auto`} value={flt.status} onChange={(e) => setFlt({ status: e.target.value as FakturFilter["status"] })} aria-label="Filter status">
                <option value="">Semua status ({rows.length})</option>
                {STATUS_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label} ({counts[g.id] ?? 0})</option>)}
              </select>
              {!fill && <>
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
              </>}
              {isFiltered(flt) && <button type="button" className={btnGhost} onClick={() => setFlt(EMPTY_FILTER)}><Icon name="filter_alt_off" />Reset filter</button>}
              <span className="ml-auto text-fg-2">Menampilkan {shown.length} dari {rows.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Centang">
              <button type="button" className={btnGhost} disabled={!!busy || !shown.length} onClick={() => setChecked(checkedAfter(rows, shown, "add"))}>Centang yang tampil</button>
              <button type="button" className={btnGhost} disabled={!!busy || !shownChecked} onClick={() => setChecked(checkedAfter(rows, shown, "remove"))}>Hapus centang yang tampil</button>
              <button type="button" className={btnGhost} disabled={!!busy || !shown.length} onClick={() => setChecked(checkedAfter(rows, shown, "only"))}
                title="Centang hanya baris yang tampil; centang lain dihapus">Hanya yang tampil</button>
              <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
              <button type="button" className={btnGhost} disabled={!!busy} onClick={() => setChecked(rows.map((i) => i.invoice))}>Centang semua</button>
              <button type="button" className={btnGhost} disabled={!!busy || !checked.length} onClick={() => setChecked([])}>Hapus semua</button>
              <span className="ml-auto text-fg-2">
                {checked.length} dari {rows.length} dicentang{hiddenChecked > 0 && <b className="text-warning"> · {hiddenChecked} di luar filter</b>}
              </span>
            </div>
          </div>
        )}
        <div className="max-h-[calc(100vh-410px)] overflow-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={th}><input ref={headBox} type="checkbox" aria-label="Pilih semua yang tampil" checked={!!shown.length && shownChecked === shown.length}
                onChange={(e) => setChecked(checkedAfter(rows, shown, e.target.checked ? "add" : "remove"))} /></th>
              {fill ? <>
                <th className={th}>No Invoice</th><th className={th}>No PO</th><th className={th}>No SJ</th><th className={`${th} text-right`}>Open Amt</th><th className={th}>Status</th>
              </> : <>
                <th className={th}>No Invoice</th><th className={th}>No Faktur</th><th className={th}>Hal</th>
                <th className={th}>No PO</th><th className={th}>No SJ</th><th className={`${th} text-right`}>Open Amt</th><th className={th}>Status</th><th className={th} />
              </>}
            </tr></thead>
            {fill ? (
              <tbody>
                {!invItems.length && <tr><td colSpan={6} className={emptyTd}>Belum ada data. Unggah Excel Invoice (kolom Invoice No, No PO, No SJ, Open Amt).</td></tr>}
                {!!invItems.length && !shownInv.length && <tr><td colSpan={6} className={emptyTd}>Tidak ada invoice yang cocok dengan filter.</td></tr>}
                {shownInv.map((it) => (
                  <tr key={it.invoice}>
                    <td className={td}><input type="checkbox" checked={it.checked} aria-label={`Pilih ${it.invoice}`} onChange={(e) => patchInv(it, { checked: e.target.checked })} /></td>
                    <td className={td}>{it.invoice}</td>
                    <td className={td}><Cell value={it.no_po} label="No PO" onSave={(v) => patchInv(it, { no_po: v })} /></td>
                    <td className={td}><Cell value={it.no_sj} label="No SJ" onSave={(v) => patchInv(it, { no_sj: v })} /></td>
                    <td className={`${td} text-right`}><Cell value={it.open_amt ? it.open_amt.toLocaleString("id-ID") : ""} label="Open Amt" right onSave={(v) => patchInv(it, { open_amt: parseAmount(v) ?? 0 })} /></td>
                    <td className={td}><span className={`${chip} ${statusTone(it.status)}`} title={it.status}>{it.status.length > 34 ? `${it.status.slice(0, 34)}…` : it.status}</span></td>
                  </tr>
                ))}
              </tbody>
            ) : (
            <tbody>
              {!items.length && <tr><td colSpan={9} className={emptyTd}>Belum ada faktur.</td></tr>}
              {!!items.length && !shownFp.length && <tr><td colSpan={9} className={emptyTd}>Tidak ada faktur yang cocok dengan filter.</td></tr>}
              {shownFp.map((it) => (
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
            )}
          </table>
        </div>
      </Card>

      <Card title="Log"><JobLog jobId="edi.upload-faktur" /></Card>

      <Modal open={paste} title={fill ? "Tempel data Invoice" : "Tempel data PO"} onClose={() => setPaste(false)} wide
        footer={<>
          <button type="button" className={btnGhost} onClick={() => setPaste(false)}>Batal</button>
          {fill
            ? <button type="button" className={btnPrimary} disabled={!pasteText.trim() || busy === "inv"} onClick={() => onInv({ text: pasteText })}>Muat ke sheet Invoice</button>
            : <button type="button" className={btnPrimary} disabled={!pasteText.trim() || busy === "po"} onClick={() => onPo({ text: pasteText })}>Cocokkan</button>}
        </>}>
        {fill && <p className="mb-2 text-[13px] text-fg-2">Isi sheet Invoice diganti dengan data ini.</p>}
        <textarea className={`${inputCls} h-64 font-mono`} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
          placeholder={"Invoice No\tNo PO\tNo SJ\tOpen Amt"} aria-label={fill ? "Data Invoice" : "Data PO"} />
      </Modal>
      <Modal open={!!preview} title={preview ? `${preview.invoice} · ${preview.faktur} · ${fmtSize(preview.size)}` : ""} onClose={() => setPreview(null)} xl>
        {preview && <>
          <div className="mb-2 flex justify-end">
            <a className={btnGhost} href={fileUrl(preview, true)} download={downloadName(preview.faktur, preview.filename)}><Icon name="download" />Unduh {downloadName(preview.faktur, preview.filename)}</a>
          </div>
          <iframe title="Pratinjau PDF" className="h-[72vh] w-full rounded-lg border border-hairline" src={fileUrl(preview)} />
        </>}
      </Modal>
      <Confirm open={!!confirm} title={fill ? "Isi No Invoice di EDI Mitra 10" : "Unggah ke EDI Mitra 10"}
        confirmLabel={fill ? `Isi ${queue.length} invoice` : `Unggah ${queue.length} faktur`} onClose={() => setConfirm(null)} onConfirm={() => confirm?.()}>
        {fill
          ? <>{queue.length} invoice akan diisi No Invoice-nya (Vendor Invoice No) di Draft EDI <b>tanpa upload FP</b>, dengan akun <b>{accounts.find((a) => a.id === account)?.label}</b>.</>
          : <>{queue.length} faktur akan diunggah & dikirim (Send) dengan akun <b>{accounts.find((a) => a.id === account)?.label}</b>, mode <b>{modeLabel}</b>.</>}
        {" "}Tindakan ini tidak bisa dibatalkan dari aplikasi.
      </Confirm>
      <Confirm open={clear} title={fill ? "Kosongkan sheet Invoice" : "Kosongkan daftar faktur"} confirmLabel="Kosongkan" danger onClose={() => setClear(false)}
        onConfirm={() => fill ? actInv("", () => api<InvSheet>("/api/faktur/invoices/clear", {})) : act("", () => api<Manifest>("/api/faktur/clear", {}))}>
        {fill ? "Data sheet Invoice dihapus. Sheet Invoice+FP tidak berubah." : "Daftar dan file PDF hasil pecahan dihapus dari folder kerja AR Bot."}
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
