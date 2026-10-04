"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { closingReport, closingSheets, monthEnd, type ClosingSource, type ClosingPreview, type CollectionPeriod } from "@/lib/modules/collection/closing";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, monthLabel, rupiah } from "@/lib/format";
import { downloadXlsxSheets } from "@/lib/xlsx-client";
import { Modal } from "@/components/modal";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";

export function ClosingControls({period,onChange}:{period:CollectionPeriod;onChange:()=>void|Promise<void>}) {
  const [mode,setMode]=useState<"preview"|"history"|"reopen"|null>(null);
  const [preview,setPreview]=useState<ClosingPreview|null>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  const [confirmed,setConfirmed]=useState(false), [reason,setReason]=useState("");
  const cutoff=monthEnd(period.month);
  async function prepare() {
    setMode("preview");setBusy(true);setError("");setPreview(null);setConfirmed(false);
    try {
      const {data,error}=await createClient().rpc("collection_closing_preview",{p_month:period.month,p_cutoff:cutoff});
      if(error) throw error;setPreview(data as unknown as ClosingPreview);
    } catch(e){setError((e as Error).message);} finally {setBusy(false);}
  }
  async function close() {
    if(!preview || !confirmed)return;
    setBusy(true);setError("");
    try {
      const {error}=await createClient().rpc("collection_close",{p_month:period.month,p_cutoff:cutoff,p_token:preview.token,p_revision:preview.revision,p_confirm_source:confirmed});
      if(error) throw error;await onChange();setMode(null);setPreview(null);
    } catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function reopen() {
    setBusy(true);setError("");
    try {
      const {error}=await createClient().rpc("collection_reopen",{p_month:period.month,p_revision:period.revision,p_reason:reason});
      if(error)throw error;await onChange();setMode(null);setReason("");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function exportReport(revision?:number) {
    setBusy(true);setError("");
    try {
      let source=period.source;
      if(revision!==undefined) {
        const {data,error}=await createClient().rpc("collection_closing_source",{p_month:period.month,p_revision:revision});
        if(error)throw error;source=data as unknown as ClosingSource;
      }
      await downloadXlsxSheets(`Collection ${period.month} ${revision===undefined?period.status:`Closing v${revision}`}.xlsx`,closingSheets(source));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const report=useMemo(()=>preview?closingReport(preview.source):null,[preview]);
  return <>
    <div className={`${card} mt-4 flex flex-wrap items-center gap-3 p-3 text-sm`}>
      <span className={`rounded-full px-3 py-1 font-medium ${period.status==="closed"?"bg-success/10 text-success":"bg-accent/10 text-accent"}`}>
        {period.status==="closed"?"Closed · Terkunci":"Open"}
      </span>
      <span className="text-fg-2">{period.status==="closed"?`Cut off ${period.source.cutoff} · versi ${period.revision} · ${fmtTimestamp(period.closedAt)}`:
        `Aging: ${period.source.aging?.asOf??"belum tersedia"}`}</span>
      <div className="ml-auto flex flex-wrap gap-2">
        {period.status==="open" && period.canManage && <button className={btnPrimary} onClick={()=>void prepare()} disabled={cutoff>todayJakarta()}>Closing Bulan</button>}
        {period.status==="closed" && period.canReopen && <button className={btnGhost} onClick={()=>{setError("");setMode("reopen");}}>Buka Kembali</button>}
        <button className={btnGhost} disabled={busy} onClick={()=>void exportReport()}>Ekspor Laporan</button>
        <button className={btnGhost} onClick={()=>{setError("");setMode("history");}}>Riwayat Closing</button>
      </div>
    </div>
    {error && mode===null && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    <Modal open={mode!==null} onClose={()=>{if(!busy)setMode(null);}} title={`${mode==="history"?"Riwayat":mode==="reopen"?"Buka Kembali":"Closing"} · ${monthLabel(period.month)}`}>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {mode==="preview" && <div className="space-y-4 text-sm">
        <p>Cut off <b>{cutoff}</b>. Laporan bulan ini akan dikunci, termasuk rincian, grafik, dan rekonsiliasi.</p>
        {busy && !preview && <p>Menyiapkan pratinjau…</p>}
        {report && preview && <>
          <p className="break-words text-fg-2">Sumber: {preview.source.aging?.fileName} · {preview.source.aging?.asOf}</p>
          <dl className="grid grid-cols-2 gap-2">
            <dt>Invoice target</dt><dd>{report.data.invTotal.toLocaleString("id-ID")}</dd>
            <dt>Target</dt><dd>{rupiah(report.data.target)}</dd>
            <dt>Sisa</dt><dd>{rupiah(report.data.sisa)}</dd>
            <dt>Terkumpul</dt><dd>{rupiah(report.data.terkumpul)}</dd>
            <dt>Alokasi target</dt><dd>{rupiah(report.alloc.totalAllocT)}</dd>
            <dt>Selisih rekonsiliasi</dt><dd>{rupiah(report.recon.selisih)}</dd>
          </dl>
          {!preview.source.aging?.verified && <p className="text-warning">Tanggal sumber lama diturunkan dari tanggal invoice. Pastikan file benar-benar merupakan laporan posisi akhir bulan sebelum closing.</p>}
          <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>
            <span>Saya memastikan Aging ini adalah posisi {cutoff}, serta target dan pembayaran yang ditampilkan sudah diperiksa.</span></label>
          <button className={btnPrimary} disabled={busy||!confirmed} onClick={()=>void close()}>{busy?"Menyimpan…":"Konfirmasi Closing"}</button>
        </>}
        <button className={btnGhost} disabled={busy} onClick={()=>void prepare()}>Muat Ulang Pratinjau</button>
      </div>}
      {mode==="history" && <div className="space-y-3 text-sm">{period.history.length===0?<p>Belum ada riwayat closing.</p>:period.history.map(h=><div key={h.id} className="border-b border-line pb-2">
        <b>{h.action==="close"?"Closing":"Buka kembali"} · versi {h.revision}</b><p>{fmtTimestamp(h.at)}</p><p className="text-fg-2">{h.reason}</p><p className="break-all text-xs text-fg-2">Pelaksana: {h.actor}</p>{h.action==="close" && <button className={`${btnGhost} mt-2`} disabled={busy} onClick={()=>void exportReport(h.revision)}>Unduh laporan versi {h.revision}</button>}
      </div>)}</div>}
      {mode==="reopen" && <div className="space-y-3 text-sm"><p>Riwayat versi {period.revision} tetap tersimpan. Periode kembali Open dengan sumber Aging closing sebelumnya. Koreksi sumber melalui upload Aging ke bulan ini.</p>
        <label className="block">Alasan pembukaan kembali<textarea className={`${inputCls} mt-1`} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} /></label>
        <button className={btnPrimary} disabled={busy||reason.trim().length<10} onClick={()=>void reopen()}>{busy?"Memproses…":"Buka Kembali Periode"}</button>
      </div>}
    </Modal>
  </>;
}
