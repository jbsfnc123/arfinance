"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLATFORMS } from "@/lib/modules/marketplace/config";
import { emptyReport, parseWorkbook, type Report } from "@/lib/modules/marketplace/parse";
import { readAllSheets } from "@/lib/xlsx-client";
import { parseErp } from "@/lib/uploads/parse";
import { uploadShared } from "@/lib/uploads/commit";
import { buildAudit, missingAdjustmentOrders, type OrderLookup } from "@/lib/modules/marketplace/analysis";
import { erpDetail, orderDetail, orderTableCols, withGroups } from "@/lib/modules/marketplace/tables";
import { DataTableModal, type TableSpec } from "@/components/data-table-modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { Dashboard } from "./dashboard";
import { ErpView } from "./erp-view";
import type { Json } from "@/lib/database.types";

export type ReportMeta = { report_id: string; platform: "shopee" | "tiktok"; username: string; dari: string; ke: string };

const LS_AUDIT = "refundAuditLimit";
const LS_ERP = "erpReconLimit";
const readLimit = (key: string) => {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
};
const writeLimit = (key: string, v: number) => {
  try { localStorage.setItem(key, String(v)); } catch { /* opsional */ }
};

// Port MarketPlace/index.html (Dashboard Penghasilan E-commerce Shopee & TikTok).
export function MarketplaceView({ initialList }: { initialList: ReportMeta[] }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [list, setList] = useState(initialList);
  const [selected, setSelected] = useState(initialList[0]?.report_id ?? "");
  const [R, setR] = useState<Report | null>(null);
  const [lookup, setLookup] = useState<OrderLookup>({});
  const [view, setView] = useState<"dash" | "erp">("dash");
  const [busy, setBusy] = useState<string | null>(null);
  const [table, setTable] = useState<TableSpec | null>(null);
  const [auditLimit, setAuditLimitState] = useState(0);
  const [erpLimit, setErpLimitState] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setAuditLimitState(readLimit(LS_AUDIT)); // eslint-disable-line react-hooks/set-state-in-effect -- nilai per-perangkat dari localStorage
    setErpLimitState(readLimit(LS_ERP));
  }, []);

  // Baris ERP tidak disimpan di laporan: dibaca dari tabel inti (erp_invoices/erp_payments) lewat
  // PO customer pesanan + invoice subsidi tanpa PO pada Payment Group & periode laporan.
  const fetchReport = useCallback(async (id: string) => {
    const { data, error } = await supabase.from("mp_reports").select("data").eq("report_id", id).maybeSingle();
    if (error) throw error;
    const rep = (data?.data as unknown as Report) ?? null;
    if (!rep) return null;
    const m = rep.erpMeta ?? {};
    const { data: erp, error: e2 } = await supabase.rpc("mp_erp_rows", {
      p_pos: rep.Orders.map((o) => String(o.no)), p_group: m.paymentGroup ?? null,
      p_dari: m.dari ?? rep.meta.dari ?? null, p_ke: m.ke ?? rep.meta.ke ?? null,
    });
    if (e2) throw e2;
    return { ...rep, Erp: (erp ?? []) as unknown as Report["Erp"] };
  }, [supabase]);

  // Muat laporan terpilih + pesanan asal refund dari periode lain.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      const rep = await fetchReport(selected);
      if (cancelled || !rep) return;
      setR(rep);
      setLookup({});
      const missing = missingAdjustmentOrders(rep);
      if (!missing.length) return;
      const found: OrderLookup = {};
      for (let i = 0; i < missing.length; i += 300) {
        const { data } = await supabase.from("mp_order_index").select("no, penghasilan, report_id")
          .in("no", missing.slice(i, i + 300)).neq("report_id", rep.meta.reportId);
        for (const d of data ?? []) found[d.no] = { penghasilan: Number(d.penghasilan), reportId: d.report_id };
      }
      if (!cancelled) setLookup(found);
    })().catch((e: Error) => !cancelled && toast(`Gagal memuat: ${e.message}`, "danger"));
    return () => { cancelled = true; };
  }, [selected, fetchReport, supabase, toast]);

  async function refreshList(select: string) {
    const { data } = await supabase.from("mp_reports").select("report_id, platform, username, dari, ke").order("dari", { ascending: false });
    setList((data ?? []) as ReportMeta[]);
    if (select === selected) {
      const rep = await fetchReport(select);
      if (rep) setR(rep);
    } else setSelected(select);
  }

  async function save(rep: Report) {
    const { error } = await supabase.rpc("mp_save_report", { p_report: { ...rep, Erp: [] } as unknown as Json });
    if (error) throw error;
    await refreshList(rep.meta.reportId);
  }

  async function onReportFile(f: File) {
    setBusy(`Membaca ${f.name}…`);
    try {
      const XLSX = await import("xlsx");
      const parsed = parseWorkbook(XLSX, XLSX.read(await f.arrayBuffer(), { type: "array" }));
      let rep: Report;
      let msg: string;
      if (parsed.kind === "balance") {
        // Riwayat saldo digabung ke laporan penghasilan periode yang sama (kalau sudah ada).
        const bal = parsed.data;
        const existing = await fetchReport(bal.meta.reportId);
        rep = { ...(existing ?? emptyReport(bal.meta)), Balance: bal.Balance, balanceSummary: bal.balanceSummary };
        msg = existing
          ? `Riwayat saldo digabung ke laporan ${bal.meta.dari} s/d ${bal.meta.ke} — ${bal.Balance.length.toLocaleString("id-ID")} transaksi.`
          : `Riwayat saldo dimuat (${bal.Balance.length.toLocaleString("id-ID")} transaksi). Upload Laporan Penghasilan periode ini untuk melihat rekonsiliasi.`;
      } else {
        // Laporan penghasilan baru: pertahankan riwayat saldo & data ERP yang sudah pernah diupload.
        rep = parsed.data;
        const prev = await fetchReport(rep.meta.reportId);
        if (prev?.Balance?.length) { rep.Balance = prev.Balance; rep.balanceSummary = prev.balanceSummary; }
        if (prev?.erpMeta) rep.erpMeta = prev.erpMeta;
        msg = `Berhasil: ${PLATFORMS[rep.meta.platform].label} — ${rep.Orders.length.toLocaleString("id-ID")} pesanan dimuat.`;
      }
      setBusy("Menyimpan…");
      await save(rep);
      setView("dash");
      toast(msg, "success", 6000);
    } catch (e) {
      toast(`Gagal: ${(e as Error).message}`, "danger", 6000);
    } finally {
      setBusy(null);
    }
  }

  async function onErpFile(f: File) {
    setBusy(`Membaca file ERP ${f.name}…`);
    try {
      const erp = parseErp(await readAllSheets(f));
      const erpMeta = { org: erp.meta.org, paymentGroup: erp.meta.paymentGroup, dari: erp.meta.dari, ke: erp.meta.ke };
      // Laporan dengan periode sama (dan platform sesuai Payment Group); bila tidak ada, laporan yang sedang dibuka.
      const grup = (erpMeta.paymentGroup ?? "").toLowerCase();
      const cocok = list.filter((x) => (!erpMeta.dari || x.dari === erpMeta.dari) && (!erpMeta.ke || x.ke === erpMeta.ke));
      const sama = cocok.filter((x) => !grup || x.platform === (grup.includes("tiktok") ? "tiktok" : "shopee"));
      const target = (sama[0] ?? cocok[0])?.report_id ?? (R?.Orders.length ? R.meta.reportId : null);
      if (!target) throw new Error("belum ada laporan marketplace untuk periode ERP ini. Upload laporannya dulu.");
      const rep = await fetchReport(target);
      if (!rep) throw new Error("laporan tujuan tidak ditemukan.");
      setBusy("Menyimpan…");
      // Disimpan sekali ke tabel inti ERP (juga terbaca Mutasi & Presentasi); laporan hanya menyimpan periodenya.
      await uploadShared(supabase, "erp", f, erp.rows, erp.meta);
      await save({ ...rep, erpMeta });
      setView("erp");
      toast(`Data ERP disimpan: ${erp.invoices.toLocaleString("id-ID")} invoice untuk periode ${rep.meta.dari} s/d ${rep.meta.ke}.`, "success", 6000);
    } catch (e) {
      toast(`Gagal membaca file ERP: ${(e as Error).message}`, "danger", 6000);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!selected || !confirm("Hapus data periode ini?")) return;
    const { error } = await supabase.from("mp_reports").delete().eq("report_id", selected);
    if (error) return toast(`Gagal menghapus: ${error.message}`, "danger");
    const rest = list.filter((x) => x.report_id !== selected);
    setList(rest);
    setR(null);
    setSelected(rest[0]?.report_id ?? "");
  }

  const audit = useMemo(() => (R && (R.Orders.length || R.Adjustment.length) ? buildAudit(R, auditLimit, lookup) : []), [R, auditLimit, lookup]);

  const showOrder = (no: string) => {
    if (!R) return;
    const spec = orderDetail(R, no, audit);
    if (!spec) return toast(`No. Pesanan ${no} tidak ditemukan di periode ini.`, "warning");
    setTable(spec);
  };

  function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    if (!q || !R) return;
    const all = new Set([R.Orders, R.Items, R.SellerFee, R.Adjustment, R.ShippingDiscrepancy, R.Balance].flatMap((t) => t.map((r) => String(r.no ?? ""))).filter(Boolean));
    if (all.has(q)) return showOrder(q);
    const hits = [...all].filter((x) => x.includes(q));
    if (!hits.length) return toast(`No. Pesanan "${q}" tidak ditemukan.`, "warning");
    if (hits.length === 1) return showOrder(hits[0]);
    const byNo = new Map(R.Orders.map((o) => [String(o.no), o]));
    setTable({ title: `Hasil pencarian "${q}"`, rows: withGroups(R, hits.map((x) => byNo.get(x) ?? { no: x })), cols: orderTableCols(R) });
  }

  const hasErp = !!R?.Erp?.length;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-medium">Dashboard Penghasilan Marketplace</h1>
          <p className="text-sm text-fg-2">
            {R ? `${PLATFORMS[R.meta.platform].label} · Toko: ${R.meta.username} · Periode ${R.meta.dari} s/d ${R.meta.ke}` : "Belum ada data — silakan upload file Excel."}
          </p>
        </div>
        <label className={`${btnPrimary} cursor-pointer`}>
          <span className="material-symbols-outlined">upload_file</span>{busy ?? "Upload Excel"}
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={!!busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onReportFile(f); }} />
        </label>
        <label className={`${btnGhost} cursor-pointer`}>
          <span className="material-symbols-outlined">receipt_long</span>Import ERP
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={!!busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onErpFile(f); }} />
        </label>
      </div>

      {list.length > 0 && (
        <div className={`${card} flex flex-wrap items-center gap-2 p-3`}>
          <select value={selected} onChange={(e) => { setSelected(e.target.value); setView("dash"); }} className={`${inputCls} !w-auto`}>
            {list.map((m) => (
              <option key={m.report_id} value={m.report_id}>{PLATFORMS[m.platform]?.label ?? "Shopee"} · {m.username} · {m.dari} s/d {m.ke}</option>
            ))}
          </select>
          <button type="button" className={`${btnGhost} text-danger`} onClick={remove}><span className="material-symbols-outlined">delete</span>Hapus periode</button>
          <form onSubmit={search} className="ml-auto flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari No. Pesanan…" className={`${inputCls} !w-60`} />
            <button type="submit" className={btnGhost}><span className="material-symbols-outlined">search</span></button>
          </form>
        </div>
      )}

      {hasErp && (
        <div className="flex gap-1 border-b border-line">
          {([["dash", "Dashboard"], ["erp", "Rekonsiliasi ERP"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm ${view === k ? "border-accent text-accent" : "border-transparent text-fg-2 hover:text-fg"}`}>{l}</button>
          ))}
        </div>
      )}

      {R && (view === "erp" && hasErp ? (
        <ErpView R={R} limit={erpLimit} setLimit={(v) => { setErpLimitState(v); writeLimit(LS_ERP, v); }} show={setTable} />
      ) : (
        <Dashboard R={R} audit={audit} auditLimit={auditLimit}
          setAuditLimit={(v) => { setAuditLimitState(v); writeLimit(LS_AUDIT, v); }} show={setTable} />
      ))}

      {!R && !list.length && (
        <p className={`${card} p-8 text-center text-sm text-fg-2`}>
          Upload Laporan Penghasilan Shopee (sheet Summary + Penghasilan), Riwayat Saldo Shopee (Transaction Report),
          atau Laporan TikTok (Laporan + Detail pesanan).
        </p>
      )}

      <DataTableModal spec={table} onClose={() => setTable(null)} onLink={showOrder} onErpLink={(no) => R && setTable(erpDetail(R, no))} />
    </div>
  );
}
