"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, emptyTd, inputCls, segGroup, segItem, tableCls, td, th } from "@/components/ui";
import { useViewState } from "@/lib/ui/view-state";
import { confirmText, fakturQueue, isActive, lastRunFor, mergeItemStatus, type BotParams, type BotRun } from "@/lib/modules/m10/bot";
import { isFilled, type FakturItem } from "@/lib/modules/m10/faktur";
import { LastRun } from "./bot-job-form";
import {
  clearSheet, EMPTY_SHEET, loadInvoices, loadPdf, loadPo, loadSheet, replaceSheet, saveInvoices, saveSheet,
  type FakturSheet, type InvoiceRow, type PoList,
} from "./faktur-local";
import type { Bot } from "./use-bot";

type Mode = NonNullable<BotParams["mode"]>;
const MODES: [Mode, string][] = [["draft", "Upload FP"], ["not_found", "Isi No Invoice+Upload FP"], ["fill", "Isi No Invoice"]];
const rp = (n?: number) => (n === undefined || n === null ? "" : n.toLocaleString("id-ID", { maximumFractionDigits: 2 }));
const statusTone = (s: string) => (s.startsWith("Uploaded") || isFilled(s) ? "text-success" : s === "Ready" ? "text-fg-2" : /uji coba/i.test(s) ? "text-accent" : "text-danger");

// Kartu Upload Faktur Pajak di tab BOT (Fase 93). PDF Coretax dipecah & disimpan di browser; data PO dari Import to BOT
// (Kertas Kerja). Run: PDF faktur dalam antrean diunggah sementara ke bucket transit → bot cloud → dihapus setelah selesai.
export function FakturPanel({ bot, users }: { bot: Bot; users: string[] }) {
  const toast = useToast();
  const [mode, setMode] = useViewState<Mode>("mitra10:bot:faktur-mode", "draft");
  const [account, setAccount] = useViewState("mitra10:bot:faktur-acc", "");
  const [pending, setPending] = useViewState<number | null>("mitra10:bot:faktur-run", null);
  const [sheet, setSheet] = useState<FakturSheet>(EMPTY_SHEET);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [po, setPo] = useState<PoList | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [ask, setAsk] = useState<null | "run" | "clear">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fill = mode === "fill";
  const acc = account && users.includes(account) ? account : users[0] ?? "";

  const reload = useCallback(async () => {
    const [s, i, p] = await Promise.all([loadSheet(), loadInvoices(), loadPo()]);
    setSheet(s); setInvoices(i); setPo(p);
  }, []);
  useEffect(() => { void reload(); }, [reload]); // eslint-disable-line react-hooks/set-state-in-effect -- muat data kerja faktur dari IndexedDB saat dibuka

  // Run sungguhan selesai → status per invoice disimpan ke daftar lokal (uji coba tidak mengubah status, seperti AR Bot).
  const last = lastRunFor(bot.runs, "edi.upload-faktur");
  useEffect(() => {
    const r = pending ? bot.runs.find((x) => x.id === pending) : null;
    if (!r || isActive(r.status)) return;
    setPending(null);
    const items = r.result?.items ?? [];
    if (r.dry_run || !items.length) return;
    void (async () => {
      const s = await loadSheet(), inv = await loadInvoices();
      const ns = { ...s, items: mergeItemStatus(s.items, items) }, ni = mergeItemStatus(inv, items);
      await saveSheet(ns); await saveInvoices(ni);
      setSheet(ns); setInvoices(ni);
    })();
  }, [bot.runs, pending, setPending]);

  async function onPdf(f: File | undefined) {
    if (!f) return;
    setSplitting(true);
    try {
      const { splitFakturBrowser } = await import("@/lib/modules/m10/faktur-browser");
      const r = await splitFakturBrowser(f);
      const next = await replaceSheet({ source: f.name, createdAt: new Date().toISOString(), totalPages: r.totalPages, items: r.items }, r.files);
      setSheet(next);
      toast(`${r.items.length} faktur dari ${r.totalPages} halaman (disimpan di browser ini).`, "success");
    } catch (e) {
      toast(`PDF gagal diproses: ${(e as Error).message}`, "danger", 7000);
    } finally {
      setSplitting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const patchItem = (inv: string, patch: Partial<FakturItem>) => {
    const ns = { ...sheet, items: sheet.items.map((i) => (i.invoice === inv ? { ...i, ...patch } : i)) };
    setSheet(ns); void saveSheet(ns);
  };
  const patchInv = (inv: string, patch: Partial<InvoiceRow>) => {
    const ni = invoices.map((i) => (i.invoice === inv ? { ...i, ...patch } : i));
    setInvoices(ni); void saveInvoices(ni);
  };
  const setAll = (on: boolean) => {
    if (fill) { const ni = invoices.map((i) => ({ ...i, checked: on })); setInvoices(ni); void saveInvoices(ni); }
    else { const ns = { ...sheet, items: sheet.items.map((i) => ({ ...i, checked: on })) }; setSheet(ns); void saveSheet(ns); }
  };

  const queue = useMemo(() => (fill ? invoices.filter((i) => i.checked && !isFilled(i.status)) : fakturQueue(sheet.items, mode)), [fill, invoices, sheet.items, mode]);
  const rows: (FakturItem | InvoiceRow)[] = fill ? invoices : sheet.items;
  const blocked = !!bot.active || bot.busy || !queue.length || !acc;

  async function run(dryRun: boolean) {
    setAsk(null);
    try {
      const items = fill ? queue : queue.map((i) => ({ ...i }));
      let files: { name: string; blob: Blob }[] | undefined;
      if (!fill) {
        files = [];
        for (const it of queue as FakturItem[]) {
          const blob = await loadPdf(it.filename);
          if (!blob) throw new Error(`PDF ${it.filename} tidak ada di browser ini — unggah ulang PDF Faktur.`);
          files.push({ name: it.filename, blob });
        }
      }
      const id = await bot.request({ jobs: [{ id: "edi.upload-faktur", params: { mode, accounts: [acc], items } }], dryRun, files });
      setPending(id);
      toast(`Upload Faktur${dryRun ? " (uji coba)" : ""} dikirim ke bot cloud · run #${id}.`, "success", 5000);
    } catch (e) {
      toast(`Upload Faktur: ${(e as Error).message}`, "danger", 7000);
    }
  }

  const dryItems = last?.dry_run && !isActive(last.status) ? last.result?.items ?? [] : [];
  const allOn = rows.length > 0 && rows.every((r) => r.checked);

  return (
    <div className="grid gap-3">
      <p className="text-xs text-fg-2">
        PDF Coretax dipecah per faktur <b>di browser ini</b> dan disimpan lokal. Saat dijalankan, PDF dalam antrean hanya transit sementara
        ke bot cloud dan dihapus setelah run selesai. Data PO berasal dari <b>Kertas Kerja › Import to BOT</b>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className={segGroup} role="group" aria-label="Mode Upload Faktur">
          {MODES.map(([m, l]) => <button key={m} type="button" aria-pressed={mode === m} className={segItem(mode === m)} onClick={() => setMode(m)}>{l}</button>)}
        </div>
        {users.length > 0 && (
          <select className={`${inputCls} !w-auto`} value={acc} onChange={(e) => setAccount(e.target.value)} aria-label="Akun EDI Upload Faktur">
            {users.map((u) => <option key={u} value={u}>Akun: {u}</option>)}
          </select>
        )}
        {!fill && (
          <>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void onPdf(e.target.files?.[0])} aria-label="Pilih PDF Faktur" />
            <button type="button" className={btnGhost} disabled={splitting} onClick={() => fileRef.current?.click()}>
              <Icon name={splitting ? "progress_activity" : "picture_as_pdf"} className={splitting ? "animate-spin" : ""} />{splitting ? "Memecah PDF…" : "PDF Faktur"}
            </button>
          </>
        )}
        {(fill ? invoices.length : sheet.items.length) > 0 && (
          <button type="button" className={btnGhost} onClick={() => setAsk("clear")}><Icon name="delete_sweep" />Kosongkan</button>
        )}
      </div>
      <p className="text-xs text-fg-2">
        {po ? <>Data PO: <b className="text-fg">{po.rows.length.toLocaleString("id-ID")}</b> invoice dari Import to BOT ({new Date(po.at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}).</>
          : <>Belum ada data PO — centang invoice di Kertas Kerja lalu tekan <b>Import to BOT</b>.</>}
        {!fill && sheet.source && <> · PDF: {sheet.source} · {sheet.items.length} faktur · {sheet.items.filter((i) => i.in_po).length} cocok dengan data PO</>}
      </p>

      <div className="max-h-[420px] overflow-auto rounded-xl border border-hairline">
        <table className={tableCls}>
          <thead><tr>
            <th className={`${th} w-8`}><input type="checkbox" checked={allOn} onChange={(e) => setAll(e.target.checked)} aria-label="Centang semua" /></th>
            <th className={th}>Invoice</th>{!fill && <th className={th}>Faktur</th>}{!fill && <th className={th}>Hal</th>}
            <th className={th}>No PO</th><th className={th}>No SJ</th><th className={`${th} text-right`}>Open Amt</th><th className={th}>Status</th>{!fill && <th className={th}>PDF</th>}
          </tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={9} className={emptyTd}>{fill ? "Belum ada invoice — gunakan Import to BOT di Kertas Kerja." : "Belum ada PDF faktur."}</td></tr>}
            {rows.map((r) => {
              const it = r as FakturItem;
              const patch = (p: Partial<FakturItem & InvoiceRow>) => (fill ? patchInv(r.invoice, p) : patchItem(r.invoice, p));
              const dry = dryItems.find((d) => d.invoice.toUpperCase() === r.invoice.toUpperCase());
              return (
                <tr key={r.invoice}>
                  <td className={td}><input type="checkbox" checked={r.checked} onChange={(e) => patch({ checked: e.target.checked })} aria-label={`Centang ${r.invoice}`} /></td>
                  <td className={`${td} font-medium`}>{r.invoice}{!fill && it.in_po && <span className="ml-1 text-[10px] text-accent">PO</span>}</td>
                  {!fill && <td className={td}>{it.faktur}</td>}
                  {!fill && <td className={td}>{it.pages}</td>}
                  <td className={td}><input className={`${inputCls} !w-32`} value={r.no_po ?? ""} onChange={(e) => patch({ no_po: e.target.value })} aria-label={`No PO ${r.invoice}`} /></td>
                  <td className={td}><input className={`${inputCls} !w-32`} value={r.no_sj ?? ""} onChange={(e) => patch({ no_sj: e.target.value })} aria-label={`No SJ ${r.invoice}`} /></td>
                  <td className={`${td} text-right`}>{rp(r.open_amt)}</td>
                  <td className={`${td} max-w-72 whitespace-normal text-xs ${statusTone(r.status)}`}>
                    {r.status}{dry && <span className="block text-accent">Uji coba: {dry.status}</span>}
                  </td>
                  {!fill && <td className={td}><button type="button" className="text-xs text-accent hover:underline" onClick={() => void openPdf(it.filename)}>Lihat</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fg-2">Antrean: <b className="text-fg">{queue.length}</b> {fill ? "invoice" : "faktur"} (tercentang & belum {fill ? "terisi" : "terunggah"})</span>
        <span className="ml-auto" />
        <button type="button" className={btnGhost} disabled={blocked} onClick={() => void run(true)}><Icon name="visibility" />Uji Coba</button>
        <button type="button" className={btnPrimary} disabled={blocked} onClick={() => setAsk("run")}>
          <Icon name="cloud_upload" />{fill ? `Isi ${queue.length} invoice` : `Unggah ${queue.length} faktur`}
        </button>
      </div>
      {bot.active && <p className="text-xs text-warning">Run #{bot.active.id} sedang berjalan — tunggu sampai selesai.</p>}
      <LastRun run={last as BotRun | null} summary={last?.result?.jobs?.[0]?.error ?? last?.result?.jobs?.[0]?.summary} />

      <Modal open={ask === "run"} title={fill ? "Isi No Invoice di EDI Mitra 10" : "Unggah ke EDI Mitra 10"} onClose={() => setAsk(null)}
        footer={<>
          <button type="button" className={btnGhost} onClick={() => setAsk(null)}>Batal</button>
          <button type="button" className={btnPrimary} onClick={() => void run(false)}>{fill ? `Isi ${queue.length} invoice` : `Unggah ${queue.length} faktur`}</button>
        </>}>
        <p className="text-[13px] leading-relaxed">{confirmText("edi.upload-faktur", { mode }, queue.length)} Akun: <b>{acc}</b>.</p>
      </Modal>
      <Modal open={ask === "clear"} title={fill ? "Kosongkan sheet Invoice" : "Kosongkan daftar faktur"} onClose={() => setAsk(null)}
        footer={<>
          <button type="button" className={btnGhost} onClick={() => setAsk(null)}>Batal</button>
          <button type="button" className={`${btnPrimary} !bg-danger`} onClick={() => void (async () => {
            setAsk(null);
            if (fill) { await saveInvoices([]); setInvoices([]); } else { await clearSheet(); setSheet(EMPTY_SHEET); }
          })()}>Kosongkan</button>
        </>}>
        <p className="text-[13px]">{fill ? "Semua baris sheet Invoice" : "Daftar faktur & PDF hasil pecah"} di browser ini akan dihapus.</p>
      </Modal>
    </div>
  );
}

async function openPdf(name: string) {
  const blob = await loadPdf(name);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
