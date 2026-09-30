"use client";

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

// Monitor Surat Jalan (Fase 45): serah terima dokumen SJ dari "Laporan Serah Terima Surat Jalan" (CSV).
// Semua angka dihitung di browser dari kejadian terpublikasi (lib/modules/sj/compute.ts).
export function SjView() {
  const s = useSj();
  const [tab, setTab] = useViewState<Tab>("sj:tab", "dash");
  const [quick, setQuick] = useViewState<Quick>("sj:kk:quick", "");
  const [focus, setFocus] = useViewState<string>("sj:kk:focus", "");
  const empty = !s.loading && !s.error && s.ds.data && s.ds.data.events.length === 0;

  // Dashboard → Kertas Kerja dengan filter yang sesuai (SJ tertentu / belum diterima / perlu diperiksa).
  const openKk = (o: { quick?: Quick; focus?: string }) => { setQuick(o.quick ?? ""); setFocus(o.focus ?? ""); setTab("kk"); };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Monitor Surat Jalan</h1>
        {s.lastUpload && (
          <span className="text-xs text-fg-2">
            Data per {fmtTimestamp(s.lastUpload.published_at)} · {s.lastUpload.file_name}
          </span>
        )}
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {s.error && tab !== "upload" ? (
          <section className={`${card} p-4`} role="alert">
            <p className="text-sm font-medium text-danger">Gagal memuat data Monitor Surat Jalan.</p>
            <p className="mt-1 text-[13px] text-fg-2">{s.error.message}</p>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => void s.ds.reload()}>Coba lagi</button>
          </section>
        ) : empty && tab !== "upload" ? (
          <section className={card}>
            <EmptyState icon="fact_check" title="Belum ada data serah terima"
              hint={s.canManage
                ? "Upload file Laporan Serah Terima Surat Jalan (CSV) di tab Upload & Setting."
                : "Belum ada upload. Upload dilakukan oleh Controller/Super Admin."}
              action={s.canManage ? <button type="button" className={btnPrimary} onClick={() => setTab("upload")}>Ke Upload & Setting</button> : undefined} />
          </section>
        ) : (
          <>
            {tab === "dash" && <SjDashboard s={s} openKk={openKk} />}
            {tab === "kk" && <SjWorksheet s={s} quick={quick} setQuick={setQuick} focus={focus} setFocus={setFocus} />}
            {tab === "upload" && <SjUpload s={s} />}
          </>
        )}
      </div>
    </div>
  );
}

/** Filter periode Tanggal SJ + Area — dipakai bersama Dashboard & Kertas Kerja. */
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
      <select aria-label="Area" value={f.area} onChange={(e) => s.setArea(e.target.value)} className={`${inputCls} !w-auto`}>
        <option value="">Area: semua</option>
        {s.areas.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      {(f.from || f.to) && <button type="button" className={btnGhost} onClick={() => s.setPeriod("", "")}>Semua periode</button>}
      {!s.isDefaultPeriod && <button type="button" className={btnGhost} onClick={s.resetPeriod}>Bulan terbaru</button>}
    </div>
  );
}

/** Teks periode aktif (selalu ditampilkan, bukan hanya warna/posisi kontrol). */
export function periodText(s: SjState) {
  const f = s.filter;
  const p = f.from || f.to ? `${f.from ? fmtDate(f.from) : "awal"} – ${f.to ? fmtDate(f.to) : "akhir"}` : "semua periode";
  return `Periode Tanggal SJ: ${p}${s.isDefaultPeriod && (f.from || f.to) ? " (bulan terbaru)" : ""} · Area: ${f.area || "semua"}`;
}
