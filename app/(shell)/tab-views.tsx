"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import type { NavGroup } from "@/lib/menu";
import { NoAccess } from "@/components/no-access";

// Registri view per halaman untuk tab shell (Fase 68). Halaman di sini berpola "menuGuard → satu view client" sehingga
// shell bisa merender view-nya sendiri di dalam <Activity> dan menyimpannya saat tab disembunyikan (tanpa reload).
// page.tsx tetap ada (akses langsung, SSR, menuGuard). Halaman yang membaca data di server (Beranda, Marketplace,
// Upload Target, Template WA) TIDAK didaftarkan: tetap dirender lewat children dan dimuat ulang saat dibuka kembali.
// Setiap kali page.tsx di bawah berubah propsnya, sesuaikan juga entri di sini.

export type TabCtx = { menu: NavGroup[]; roleKind: string; userName: string; collection: string | null };
type Entry = { menuId: string; View: ComponentType<Record<string, unknown>>; props?: (ctx: TabCtx) => Record<string, unknown> };

const v = <P,>(load: () => Promise<ComponentType<P>>) => dynamic(load) as unknown as ComponentType<Record<string, unknown>>;
const unlocked = (menu: NavGroup[], id: string) => menu.some((g) => g.children.some((c) => c.id === id && !c.locked));

function CollectionTab(p: { canPayHist: boolean; preferred: string | null }) {
  const c = useSearchParams().get("c") ?? "";
  return <CollectionView canPayHist={p.canPayHist} preferred={p.preferred} initial={c} />;
}
const CollectionView = v(() => import("./collection/collection-view").then((m) => m.CollectionView));
const PengajuanForm = v(() => import("./faktur/pengajuan/pengajuan-form").then((m) => m.PengajuanForm));
const UploadJadwal = v(() => import("./tukar-faktur/upload/upload-jadwal").then((m) => m.UploadJadwal));

const VIEWS: Record<string, Entry> = {
  "/collection": { menuId: "coll.tagihan", View: CollectionTab as ComponentType<Record<string, unknown>>,
    props: (c) => ({ canPayHist: unlocked(c.menu, "coll.payhist"), preferred: c.collection }) },
  "/collection/case": { menuId: "coll.case", View: v(() => import("./collection/case/case-view").then((m) => m.CaseView)) },
  "/collection/history-pembayaran": { menuId: "coll.payhist", View: v(() => import("./collection/history-pembayaran/history-view").then((m) => m.HistoryView)) },
  "/dashboard/collection": { menuId: "dash.coll", View: v(() => import("./dashboard/collection/dashboard-view").then((m) => m.DashboardView)) },
  "/dashboard/tukar-faktur": { menuId: "dash.tukar", View: v(() => import("./dashboard/tukar-faktur/tukar-dashboard").then((m) => m.TukarDashboard)) },
  "/mutasi-bank": { menuId: "rek.mutasi", View: v(() => import("./mutasi-bank/mutasi-view").then((m) => m.MutasiView)) },
  "/presentasi": { menuId: "lap.presentasi", View: v(() => import("./presentasi/deck-frame").then((m) => m.DeckFrame)), props: (c) => ({ kind: c.roleKind }) },
  "/tukar-faktur/kurir": { menuId: "tukar.detail", View: v(() => import("./tukar-faktur/kurir/kurir-app").then((m) => m.KurirApp)),
    props: (c) => ({ ownName: c.roleKind === "kurir" ? c.userName : null }) },
  "/tukar-faktur/ekspedisi": { menuId: "tukar.ekspedisi", View: v(() => import("./tukar-faktur/ekspedisi/ekspedisi-view").then((m) => m.EkspedisiView)) },
  "/tukar-faktur/jadwal": { menuId: "tukar.jadwal", View: v(() => import("./tukar-faktur/jadwal/jadwal-view").then((m) => m.JadwalView)) },
  "/tukar-faktur/upload": { menuId: "tukar.upload", View: () => (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Upload Jadwal Tukar Faktur</h1>
      <UploadJadwal />
    </div>
  ) },
  "/mitra10": { menuId: "rek.mitra10", View: v(() => import("./mitra10/mitra10-view").then((m) => m.Mitra10View)) },
  "/rkm": { menuId: "tukar.rkm", View: v(() => import("./rkm/rkm-view").then((m) => m.RkmView)) },
  "/monitor-surat-jalan": { menuId: "tukar.monitor_sj", View: v(() => import("./monitor-surat-jalan/sj-view").then((m) => m.SjView)) },
  "/faktur/pengajuan": { menuId: "inv.pengajuan", View: () => (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Pengajuan Pembatalan &amp; Revisi Faktur Pajak</h1>
      <PengajuanForm />
    </div>
  ) },
  "/faktur/list": { menuId: "inv.batal", View: v(() => import("./faktur/list/pengajuan-list").then((m) => m.PengajuanList)), props: (c) => ({ myName: c.userName }) },
  "/faktur/hold": { menuId: "inv.hold", View: v(() => import("./faktur/hold/hold-view").then((m) => m.HoldView)) },
  "/faktur/ltkp": { menuId: "ext.ltkp", View: v(() => import("./faktur/ltkp/ltkp-search").then((m) => m.LtkpSearch)) },
  "/coretax": { menuId: "rek.coretax", View: v(() => import("./coretax/coretax-view").then((m) => m.CoretaxView)) },
  "/billing/komisi": { menuId: "bill.komisi", View: v(() => import("./billing/komisi/komisi-view").then((m) => m.KomisiView)) },
  "/billing/email-customer": { menuId: "bill.email", View: v(() => import("./billing/email-customer/email-customer-view").then((m) => m.EmailCustomerView)) },
  "/cek-harga": { menuId: "rek.cekharga", View: v(() => import("./cek-harga/cek-harga-view").then((m) => m.CekHargaView)) },
  "/tools/pdf-editor": { menuId: "tool.pdf", View: v(() => import("./tools/pdf-editor/pdf-editor").then((m) => m.PdfEditor)) },
  "/pengaturan/upload": { menuId: "set.update", View: v(() => import("./pengaturan/upload/upload-center").then((m) => m.UploadCenter)) },
  "/pengaturan/arsip": { menuId: "set.arsip", View: v(() => import("./pengaturan/arsip/archive-view").then((m) => m.ArchiveView)) },
};

export const hasTabView = (path: string) => path in VIEWS;
export const TAB_VIEW_PATHS = Object.keys(VIEWS);
export const tabViewMenuId = (path: string) => VIEWS[path]?.menuId ?? null;

/** Isi tab untuk `path` (harus hasTabView). Akses dicek dengan aturan yang sama dengan menuGuard (menu `locked`). */
export function TabView({ path, ctx }: { path: string; ctx: TabCtx }) {
  const e = VIEWS[path];
  const item = ctx.menu.flatMap((g) => g.children).find((c) => c.id === e.menuId);
  if (!item || item.locked) return <NoAccess label={item?.label ?? e.menuId} />;
  const { View } = e;
  return <View {...(e.props?.(ctx) ?? {})} />;
}
