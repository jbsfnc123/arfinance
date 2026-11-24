"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/tabs";
import { EmptyState } from "@/components/empty-state";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { fmtDate, fmtTimestamp } from "@/lib/format";
import { useViewState } from "@/lib/ui/view-state";
import { useSj, type SjState } from "./use-sj";
import { SjDashboard } from "./sj-dashboard";
import { SjWorksheet } from "./sj-worksheet";
import { SjUpload } from "./sj-upload";

const TABS = [
  { key: "dash", label: "Dashboard", icon: "monitoring" },
  { key: "kk", label: "Kertas Kerja", icon: "table" },
  { key: "upload", label: "Upload & Setting", icon: "upload_file" },
] as const;
type Tab = (typeof TABS)[number]["key"];
export type Quick = "" | "open" | "cek";

// Monitor Surat Jalan: penerimaan dokumen SJ untuk semua SJ di "Laporan Serah Terima Surat Jalan By Shipment Date (NEW)"
// (Fase 85 — tidak bergantung pada Aging). Daftar SJ, Receive Date & Receiver diisi dari laporan itu (AR Bot / upload CSV). Semua angka dihitung di browser (lib/modules/sj/compute.ts).
export function SjView() {
  const s = useSj();
  const [tab, setTab] = useViewState<Tab>("sj:tab", "dash");
  const [quick, setQuick] = useViewState<Quick>("sj:kk:quick", "");
  const [focus, setFocus] = useViewState<string>("sj:kk:focus", "");
  const noDocs = !s.loading && !s.error && !!s.ds.data && s.ds.data.docs.length === 0;

  // Dashboard → Kertas Kerja dengan filter yang sesuai (SJ tertentu / belum diterima / perlu diperiksa).
  const openKk = (o: { quick?: Quick; focus?: string }) => { setQuick(o.quick ?? ""); setFocus(o.focus ?? ""); setTab("kk"); };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Monitor Surat Jalan</h1>
        <span className="text-xs text-fg-2">
          {s.lastUpload ? `Upload terakhir ${fmtTimestamp(s.lastUpload.at)} · ${s.lastUpload.file_name}` : "Belum ada upload"}
        </span>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {s.error && tab !== "upload" ? (
          <section className={`${card} p-4`} role="alert">
            <p className="text-sm font-medium text-danger">Gagal memuat data Monitor Surat Jalan.</p>
            <p className="mt-1 text-[13px] text-fg-2">{s.error.message}</p>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => void s.ds.reload()}>Coba lagi</button>
          </section>
        ) : (
          <>
            {noDocs && tab !== "upload" && (
              <div className={`${card} mb-4 flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]`} role="note">
                <EmptyState icon="fact_check" title="Belum ada laporan Serah Terima" />
                <span>Daftar SJ diisi dari Laporan Serah Terima Surat Jalan By Shipment Date (AR Bot setiap hari, atau upload CSV).</span>
                {s.canManage
                  ? <button type="button" className={btnPrimary} onClick={() => setTab("upload")}>Upload Laporan Serah Terima</button>
                  : <span className="text-fg-2">Upload dilakukan oleh Controller/Super Admin.</span>}
              </div>
            )}
            {tab === "dash" && <SjDashboard s={s} openKk={openKk} />}
            {tab === "kk" && <SjWorksheet s={s} quick={quick} setQuick={setQuick} focus={focus} setFocus={setFocus} />}
            {tab === "upload" && <SjUpload s={s} />}
          </>
        )}
      </div>
    </div>
  );
}

/** Filter periode Tanggal SJ + Area + Business Partner + Marketing Group (dinamis) — dipakai bersama Dashboard & Kertas Kerja. */
export function PeriodFilter({ s }: { s: SjState }) {
  const f = s.filter;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-fg-2">Tanggal SJ</span>
      <input type="date" aria-label="Tanggal SJ dari" value={f.from} max={f.to || undefined}
        onChange={(e) => s.setPeriod(e.target.value, f.to)} className={`${inputCls} !w-auto`} />
      <span className="text-fg-2">s/d</span>
      <input type="date" aria-label="Tanggal SJ sampai" value={f.to} min={f.from || undefined}
        onChange={(e) => s.setPeriod(f.from, e.target.value)} className={`${inputCls} !w-auto`} />
      <select aria-label="Area" value={f.area} onChange={(e) => s.setArea(e.target.value)} className={`${inputCls} !w-auto max-w-64`}>
        <option value="">Area: semua ({s.choices.area.length})</option>
        {s.choices.area.map((o) => <option key={o.value} value={o.value}>{o.value} ({o.n.toLocaleString("id-ID")})</option>)}
      </select>
      <BpFilter s={s} />
      <select aria-label="Marketing Group" value={f.mg} onChange={(e) => s.setMg(e.target.value)} className={`${inputCls} !w-auto max-w-64`}>
        <option value="">Marketing Group: semua ({s.choices.mg.length})</option>
        {s.choices.mg.map((o) => <option key={o.value} value={o.value}>{o.value} ({o.n.toLocaleString("id-ID")})</option>)}
      </select>
      {(f.from || f.to) && <button type="button" className={btnGhost} onClick={() => s.setPeriod("", "")}>Semua periode</button>}
    </div>
  );
}

/** Business Partner (±10 ribu): ketik/pilih dari daftar; filter berlaku bila nama cocok persis dengan salah satu opsi. */
function BpFilter({ s }: { s: SjState }) {
  const [text, setText] = useState(s.filter.bp);
  const valid = useMemo(() => new Set(s.choices.bp.map((o) => o.value)), [s.choices.bp]);
  // Filter diubah dari luar (mis. klik BP di Dashboard / Reset) → teks ikut (pola "state dari prop sebelumnya").
  const [prev, setPrev] = useState(s.filter.bp);
  if (prev !== s.filter.bp) { setPrev(s.filter.bp); setText(s.filter.bp); }
  const apply = (v: string) => { setText(v); if (!v) s.setBp(""); else if (valid.has(v)) s.setBp(v); };
  return (
    <span className="inline-flex items-center gap-1">
      <input list="sj-bp-options" aria-label="Business Partner" value={text} onChange={(e) => apply(e.target.value)}
        placeholder={`Business Partner: semua (${s.choices.bp.length.toLocaleString("id-ID")})`} className={`${inputCls} !w-72`} />
      <datalist id="sj-bp-options">
        {s.choices.bp.map((o) => <option key={o.value} value={o.value}>{`${o.n.toLocaleString("id-ID")} SJ`}</option>)}
      </datalist>
      {s.filter.bp && <button type="button" className={btnGhost} aria-label="Hapus filter Business Partner" onClick={() => apply("")}>×</button>}
      {text && !valid.has(text) && <span className="text-xs text-fg-2">pilih dari daftar</span>}
    </span>
  );
}

/** Teks filter aktif (selalu ditampilkan, bukan hanya warna/posisi kontrol). */
export function periodText(s: SjState) {
  const f = s.filter;
  const p = f.from || f.to ? `${f.from ? fmtDate(f.from) : "awal"} – ${f.to ? fmtDate(f.to) : "akhir"}` : "semua periode";
  return `Periode Tanggal SJ: ${p} · Area: ${f.area || "semua"} · Business Partner: ${f.bp || "semua"} · Marketing Group: ${f.mg || "semua"}`;
}
