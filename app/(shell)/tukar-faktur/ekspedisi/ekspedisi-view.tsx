"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDataset } from "@/lib/local/store";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate, rupiah } from "@/lib/format";
import { ekspedisiRows, resiError, resiHistory, type EkspedisiRow, type ResiGroup } from "@/lib/modules/tukar/ekspedisi";
import { LocalTable, type LCol } from "@/lib/local/table";
import { useViewState } from "@/lib/ui/view-state";
import { useToast } from "@/components/toast";
import { Tabs } from "@/components/tabs";
import { Modal } from "@/components/modal";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";

const TABS = [
  { key: "input", label: "Input Resi", icon: "local_shipping" },
  { key: "riwayat", label: "Riwayat Resi", icon: "history" },
] as const;

const STATE = "tukar-ekspedisi";
const SEL_KEY = `table:${STATE}:sel`; // centang tabel Pilih Invoice (dibagi dengan panel No Resi)

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
const tiki = (resi: string) => `https://tiki.id/id/track?awb=${encodeURIComponent(resi)}`;

// Kolom default: BP, Invoice No, Invoice Date, Nominal; sisanya bisa ditampilkan dari header.
const COLS: LCol<EkspedisiRow>[] = [
  { k: "business_partner", l: "Business Partner", w: 260 },
  { k: "invoice_no", l: "Invoice No", w: 170 },
  { k: "invoice_date", l: "Invoice Date", d: true, w: 100 },
  { k: "nominal", l: "Nominal", n: true, sum: true, w: 130 },
  { k: "status", l: "Status TF", w: 100, badge: { "Sudah TF": "bg-success/15 text-success", "Belum TF": "bg-warning/15 text-warning" } },
  { k: "metode", l: "Metode TF", w: 100 },
  { k: "tf_date", l: "Tgl Tukar Faktur", d: true, w: 120 },
  { k: "resi", l: "No Resi", w: 150 },
  { k: "payment_group", l: "Payment Group", w: 200 },
  { k: "bp_key", l: "Key BP", w: 110 },
  { k: "collection", l: "Collection", w: 130 },
];
const HIDDEN = ["status", "metode", "tf_date", "resi", "payment_group", "bp_key", "collection"];

const HIST_COLS: LCol<ResiGroup>[] = [
  { k: "resi", l: "No Resi", w: 180, render: (g) => <span className="font-medium">{g.resi}</span> },
  { k: "tanggal", l: "Tgl Tukar Faktur", d: true, w: 120 },
  { k: "count", l: "Jumlah Invoice", n: true, w: 110 },
  { k: "total", l: "Total Nominal", n: true, sum: true, w: 140 },
  { k: "bps", l: "Business Partner", w: 360, wrap: true },
];

// Tukar Faktur › Ekspedisi: (1) pilih invoice dari aging terbaru, (2) masukkan No Resi & tanggal tukar faktur.
// Tersimpan sebagai tukar faktur metode Ekspedisi → Tgl Tukar Faktur & No Resi di Daftar Tagihan ikut terisi.
export function EkspedisiView() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const aging = useDataset("aging");
  const activity = useDataset("activity");
  const [tab, setTab] = useViewState<(typeof TABS)[number]["key"]>("ekspedisi:tab", "input");
  const [from, setFrom] = useViewState("ekspedisi:from", "");
  const [to, setTo] = useViewState("ekspedisi:to", "");
  const [sel, setSel] = useViewState<Set<string | number>>(SEL_KEY, new Set(), { set: true });
  const [open, setOpen] = useState<ResiGroup | null>(null);
  const loading = !aging.data || !activity.data;
  const err = aging.error ?? activity.error;

  const all = useMemo(() => ekspedisiRows(aging.data?.lines ?? [], activity.data?.exchanges ?? []), [aging.data, activity.data]);
  const rows = useMemo(() => all.filter((r) =>
    (!from || (r.invoice_date ?? "") >= from) && (!to || (r.invoice_date ?? "") <= to)), [all, from, to]);
  const selected = useMemo(() => all.filter((r) => sel.has(r.invoice_no)), [all, sel]);
  const history = useMemo(() => resiHistory(activity.data?.exchanges ?? [], aging.data?.lines ?? []), [activity.data, aging.data]);
  const filters = useMemo(() => [
    { k: "payment_group" as const, l: "Payment Group", options: uniq(all.map((r) => r.payment_group)) },
    { k: "business_partner" as const, l: "Business Partner", options: uniq(all.map((r) => r.business_partner)) },
    { k: "bp_key" as const, l: "Key BP", options: uniq(all.map((r) => r.bp_key)) },
    { k: "status" as const, l: "Status TF", options: ["Belum TF", "Sudah TF"] },
  ], [all]);

  async function save(resi: string, tanggal: string) {
    const invoices = selected.map((r) => r.invoice_no);
    const { data, error } = await supabase.rpc("ekspedisi_save", { p_invoices: invoices, p_resi: resi.trim(), p_tanggal: tanggal });
    if (error) { toast(`Gagal menyimpan: ${error.message}`, "danger"); return false; }
    toast(`No Resi ${resi.trim()} dicatat untuk ${Number(data ?? invoices.length)} invoice.`, "success");
    setSel(new Set());
    await activity.reload();
    return true;
  }

  async function edit(g: ResiGroup, resi: string, tanggal: string) {
    const { error } = await supabase.rpc("ekspedisi_edit", { p_ids: g.ids, p_resi: resi.trim(), p_tanggal: tanggal });
    if (error) { toast(`Gagal mengubah: ${error.message}`, "danger"); return; }
    toast(`Resi diperbarui untuk ${g.count} invoice.`, "success");
    setOpen(null);
    await activity.reload();
  }

  async function remove(g: ResiGroup) {
    if (!confirm(`Hapus resi ${g.resi} dari ${g.count} invoice? Tukar faktur ekspedisi invoice tersebut dibatalkan.`)) return;
    const { error } = await supabase.rpc("ekspedisi_delete", { p_ids: g.ids });
    if (error) { toast(`Gagal menghapus: ${error.message}`, "danger"); return; }
    toast(`Resi ${g.resi} dihapus.`, "success");
    setOpen(null);
    await activity.reload();
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-[22px] font-semibold tracking-tight">Tukar Faktur Ekspedisi</h1>
        <span className="text-sm text-fg-2">
          {aging.data?.month ? `Data aging per ${aging.data.month}` : ""}
        </span>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {err && <p className="text-sm text-danger">Sebagian data gagal dimuat: {err.message}</p>}

      {tab === "input" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 space-y-2 xl:order-1">
            <h2 className="font-medium">1. Pilih Invoice</h2>
            <LocalTable title="Pilih Invoice Ekspedisi" stateKey={STATE} hideKey="tukar-ekspedisi" defaultHidden={HIDDEN}
              rows={rows} cols={COLS} rowKey={(r) => r.invoice_no} loading={loading} selectable
              search={["invoice_no", "business_partner", "bp_key", "payment_group"]}
              filters={filters} defaultFilter={{ status: "Belum TF" }}
              toolbar={
                <span className="flex flex-wrap items-center gap-1 text-sm text-fg-2">
                  Invoice date
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Invoice date dari" className={`${inputCls} !w-auto`} />
                  –
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Invoice date sampai" className={`${inputCls} !w-auto`} />
                  {(from || to) && (
                    <button type="button" className="text-accent hover:underline" onClick={() => { setFrom(""); setTo(""); }}>hapus</button>
                  )}
                </span>
              }
              emptyText="Tidak ada invoice yang cocok." />
          </section>
          <ResiPanel selected={selected} onClear={() => setSel(new Set())} onSave={save} />
        </div>
      ) : (
        <LocalTable title="Riwayat Resi Ekspedisi" stateKey="tukar-ekspedisi-riwayat" rows={history} cols={HIST_COLS}
          rowKey={(g) => g.key} loading={loading} search={["resi", "bps"]} defaultSort={{ k: "tanggal", dir: -1 }}
          onRowClick={setOpen} rowClass={() => "cursor-pointer"}
          emptyText="Belum ada resi ekspedisi yang dicatat." />
      )}

      {open && <ResiModal group={open} onClose={() => setOpen(null)} onEdit={edit} onDelete={remove} />}
    </div>
  );
}

// Bagian 2: No Resi + tanggal tukar faktur untuk invoice yang dicentang.
function ResiPanel(props: { selected: EkspedisiRow[]; onClear: () => void; onSave: (resi: string, tanggal: string) => Promise<boolean> }) {
  const today = todayJakarta();
  const [resi, setResi] = useState("");
  const [tanggal, setTanggal] = useState(today);
  const [busy, setBusy] = useState(false);
  const { selected } = props;
  const total = selected.reduce((s, r) => s + r.nominal, 0);
  const bps = uniq(selected.map((r) => r.business_partner));
  const done = selected.filter((r) => r.status === "Sudah TF").length;
  const invalid = resiError(resi, tanggal, today);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid || !selected.length) return;
    setBusy(true);
    const ok = await props.onSave(resi, tanggal);
    setBusy(false);
    if (ok) setResi("");
  }

  return (
    <form onSubmit={submit} className={`${card} h-fit space-y-3 p-4 xl:sticky xl:top-4 xl:order-2`}>
      <h2 className="font-medium">2. Masukkan No Resi</h2>
      {selected.length === 0 ? (
        <p className="text-sm text-fg-2">Belum ada invoice dipilih.</p>
      ) : (
        <div className="space-y-1 rounded-lg bg-surface-2 p-3 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{selected.length.toLocaleString("id-ID")} invoice</span>
            <span className="ml-auto tabular-nums">{rupiah(total)}</span>
          </div>
          <div className="line-clamp-3 text-xs text-fg-2" title={bps.join(", ")}>{bps.join(", ")}</div>
          <button type="button" className="text-xs text-accent hover:underline" onClick={props.onClear}>Batalkan pilihan</button>
        </div>
      )}
      {done > 0 && (
        <p className="rounded-lg bg-warning/10 p-2 text-xs text-warning">
          {done} invoice terpilih sudah tukar faktur — resi ekspedisinya akan ditambahkan/diganti.
        </p>
      )}
      <label className="block space-y-1 text-sm">
        <span className="text-fg-2">No Resi</span>
        <input value={resi} onChange={(e) => setResi(e.target.value)} maxLength={60} className={inputCls} placeholder="mis. 030123456789" autoComplete="off" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-fg-2">Tanggal Tukar Faktur</span>
        <input type="date" value={tanggal} max={today} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
      </label>
      {resi.trim() && invalid && <p className="text-xs text-danger">{invalid}</p>}
      <button type="submit" className={`${btnPrimary} w-full`} disabled={busy || !selected.length || !!invalid}>
        <Icon name="save" size={16} />
        {busy ? "Menyimpan…" : `Simpan Resi${selected.length ? ` (${selected.length})` : ""}`}
      </button>
    </form>
  );
}

// Rincian satu resi: daftar invoice + ubah resi/tanggal atau hapus.
function ResiModal(props: {
  group: ResiGroup; onClose: () => void;
  onEdit: (g: ResiGroup, resi: string, tanggal: string) => Promise<void>; onDelete: (g: ResiGroup) => Promise<void>;
}) {
  const g = props.group;
  const today = todayJakarta();
  const [resi, setResi] = useState(g.resi === "(tanpa resi)" ? "" : g.resi);
  const [tanggal, setTanggal] = useState(g.tanggal ?? today);
  const [busy, setBusy] = useState(false);
  const invalid = resiError(resi, tanggal, today);
  const changed = resi.trim() !== g.resi || tanggal !== g.tanggal;
  const run = async (fn: () => Promise<void>) => { setBusy(true); await fn(); setBusy(false); };

  return (
    <Modal open wide title={`Resi ${g.resi}`} onClose={props.onClose}
      footer={<>
        <button type="button" className={`${btnGhost} mr-auto text-danger`} disabled={busy} onClick={() => run(() => props.onDelete(g))}>
          <Icon name="delete" size={16} />Hapus resi
        </button>
        <button type="button" className={btnGhost} onClick={props.onClose}>Tutup</button>
        <button type="button" className={btnPrimary} disabled={busy || !!invalid || !changed} onClick={() => run(() => props.onEdit(g, resi, tanggal))}>
          <Icon name="save" size={16} />Simpan perubahan
        </button>
      </>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="text-fg-2">No Resi</span>
            <input value={resi} onChange={(e) => setResi(e.target.value)} maxLength={60} className={inputCls} autoComplete="off" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-fg-2">Tanggal Tukar Faktur</span>
            <input type="date" value={tanggal} max={today} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
          </label>
        </div>
        {changed && invalid && <p className="text-xs text-danger">{invalid}</p>}
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-medium">{g.count} invoice · {rupiah(g.total)}</span>
          {g.resi !== "(tanpa resi)" && (
            <a href={tiki(g.resi)} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">Lacak di TIKI</a>
          )}
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {g.invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
              <span className="font-medium">{i.invoice_no}</span>
              <span className="text-fg-2">{i.business_partner || "(tidak ada di aging terbaru)"}</span>
              <span className="ml-auto tabular-nums">{fmtDate(i.invoice_date)} · {rupiah(i.nominal)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
