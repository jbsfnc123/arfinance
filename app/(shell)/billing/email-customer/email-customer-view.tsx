"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDataset } from "@/lib/local/store";
import { LocalTable, type LCol } from "@/lib/local/table";
import { useViewState } from "@/lib/ui/view-state";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtTimestamp, monthLabel } from "@/lib/format";
import { readAllSheets } from "@/lib/xlsx-client";
import {
  buildRows, monthWeeks, parseCbdSales, salesDatesById, splitEmails, TABS, type EmailCustomer, type EmailData, type EmailGroup, type EmailRow, type Level, type TabKey, type Term,
} from "@/lib/modules/email-customer";
import { useToast } from "@/components/toast";
import { Tabs } from "@/components/tabs";
import { Modal } from "@/components/modal";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
const WEEK_BADGE = { "✓": "bg-success/15 text-success", "✗": "bg-danger/10 text-danger" };
const HIDDEN = ["bp_key", "sales", "branch", "email_note", "match"];

// Billing › Email Customer: 4 tab seperti file Excel. Klik baris = ubah; tombol Tambah BP / Tambah Grup.
export function EmailCustomerView() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const ds = useDataset("emailCustomer");
  const [tab, setTab] = useViewState<TabKey>("email-customer:tab", "bp-cbd");
  const [month, setMonth] = useViewState("email-customer:month", todayJakarta().slice(0, 7));
  const [editBp, setEditBp] = useState<Partial<EmailCustomer> | null>(null);
  const [editGroup, setEditGroup] = useState<Partial<EmailGroup> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = TABS.find((x) => x.key === tab) ?? TABS[0];
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const data: EmailData = useMemo(() => ds.data ?? { groups: [], customers: [], emails: [], lookup: [] }, [ds.data]);
  const sales = useMemo(() => salesDatesById(data), [data]);
  const rows = useMemo(() => buildRows(data, t.term, t.level, weeks, sales), [data, t.term, t.level, weeks, sales]);
  const lastCbd = data.uploads?.find((u) => u.kind === "cbd");
  const lastErp = data.uploads?.find((u) => u.kind === "erp");
  const groups = useMemo(() => data.groups.filter((g) => g.term === t.term)
    .sort((a, b) => a.payment_group.localeCompare(b.payment_group, "id")), [data.groups, t.term]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((x) => [x.key,
    data.customers.filter((c) => c.term === x.term && c.level === x.level).length])), [data.customers]);

  const cols = useMemo<LCol<EmailRow>[]>(() => [
    { k: "payment_group", l: "Payment Group", w: 200,
      render: (r) => r.pg_from_db ? <span className="text-fg-2" title="Diisi dari database (Aging/ERP)">{r.payment_group}</span> : r.payment_group },
    { k: "business_partner", l: "Business Partner", w: 230 },
    { k: "bp_value", l: "Value", w: 150 },
    { k: "bp_key", l: "Key BP (database)", w: 150 },
    { k: "collection", l: "Collection", w: 140 },
    { k: "marketing", l: "Marketing", w: 140 },
    { k: "sales", l: "Sales", w: 140 },
    { k: "branch", l: "Branch", w: 110 },
    { k: "pic_ar", l: "PIC AR", w: 100 },
    { k: "emails", l: "Email", w: 260, wrap: true },
    { k: "email_note", l: "Catatan Email", w: 220, wrap: true },
    { k: "keterangan", l: "Keterangan", w: 240, wrap: true },
    { k: "match", l: "Key BP", w: 100, badge: { Cocok: "bg-success/15 text-success", "Tidak cocok": "bg-warning/15 text-warning" } },
    ...weeks.map((w) => ({ k: w.key, l: w.label, w: 74, badge: WEEK_BADGE } as LCol<EmailRow>)),
  ], [weeks]);
  const filters = useMemo(() => [
    { k: "payment_group" as const, l: "Payment Group", options: uniq(rows.map((r) => r.payment_group)) },
    { k: "collection" as const, l: "Collection", options: uniq(rows.map((r) => r.collection)) },
    { k: "pic_ar" as const, l: "PIC AR", options: uniq(rows.map((r) => r.pic_ar)) },
    { k: "match" as const, l: "Key BP", options: ["Cocok", "Tidak cocok"] },
  ], [rows]);

  async function saveBp(p: Record<string, unknown>) {
    const { data: res, error } = await supabase.rpc("email_customer_save" as never, { p } as never);
    if (error) { toast(`Gagal menyimpan: ${error.message}`, "danger", 7000); return false; }
    const key = (res as { bp_key: string | null }).bp_key;
    toast(key ? "Data BP disimpan." : "Data BP disimpan — Value belum cocok dengan Key BP di database (lookup kosong).", key ? "success" : "warning", 7000);
    setEditBp(null);
    await ds.reload();
    return true;
  }
  async function saveGroup(p: Record<string, unknown>) {
    const { error } = await supabase.rpc("email_group_save" as never, { p } as never);
    if (error) { toast(`Gagal menyimpan: ${error.message}`, "danger", 7000); return false; }
    toast("Payment Group disimpan.", "success");
    setEditGroup(null);
    await ds.reload();
    return true;
  }
  // Upload "CBD sales": dibaca di browser; yang dikirim hanya tanda (Value BP + tanggal), tanpa nominal/dokumen.
  async function uploadCbd(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const parsed = parseCbdSales(await readAllSheets(file));
      const matched = salesDatesById({ ...data, cbdMarks: parsed.marks, topSales: [] });
      const cbdIds = new Set(data.customers.filter((c) => c.term === "CBD").map((c) => c.id));
      const hit = [...matched.keys()].filter((id) => cbdIds.has(id)).length;
      const { data: res, error } = await supabase.rpc("email_cbd_sales_upload" as never,
        { p_rows: parsed.marks.map((m) => ({ bp_value: m.bp_value, date: m.sale_date })), p_from: parsed.from, p_to: parsed.to, p_file_name: file.name } as never);
      if (error) throw new Error(error.message);
      const r = res as { marks: number; deactivated: number };
      toast(`CBD sales ${parsed.from} s/d ${parsed.to}: ${parsed.receipts} penerimaan Prepaid (${parsed.reversed} Reversed diabaikan) · ` +
        `${parsed.bps} BP → ${hit} BP CBD cocok · ${r.marks} tanda tersimpan${r.deactivated ? ` · ${r.deactivated} tanda lama dibatalkan` : ""}.`, "success", 10000);
      await ds.reload();
    } catch (e) {
      toast(`Upload CBD sales gagal: ${(e as Error).message}`, "danger", 8000);
    } finally { setUploading(false); }
  }

  async function archive(customer: number | null, group: number | null, label: string) {
    if (!confirm(`Hapus ${label}? Data diarsipkan (tidak tampil lagi).`)) return;
    const { error } = await supabase.rpc("email_customer_archive" as never, { p_customer: customer, p_group: group } as never);
    if (error) { toast(`Gagal menghapus: ${error.message}`, "danger"); return; }
    toast(`${label} dihapus.`, "success");
    setEditBp(null); setEditGroup(null);
    await ds.reload();
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-[22px] font-semibold tracking-tight">Email Customer</h1>
        <span className="text-sm text-fg-2">Email penagihan per Business Partner · Payment Group, Collection & Marketing kosong diisi dari database</span>
      </div>
      <Tabs tabs={TABS.map((x) => ({ key: x.key, label: `${x.label} (${counts[x.key] ?? 0})`, icon: x.level === "BP" ? "person" : "groups" }))}
        value={tab} onChange={setTab} />
      {ds.error && <p className="text-sm text-danger">Gagal memuat data: {ds.error.message}</p>}
      <LocalTable key={tab} title={`Email Customer ${t.label}`} stateKey={`email-customer-${tab}`} hideKey="email-customer" defaultHidden={HIDDEN}
        rows={rows} cols={cols} rowKey={(r) => r.id} loading={!ds.data}
        search={["business_partner", "bp_value", "payment_group", "emails", "pic_ar", "collection", "keterangan"]}
        filters={filters} onRowClick={(r) => setEditBp(data.customers.find((c) => c.id === r.id) ?? null)} rowClass={() => "cursor-pointer"}
        toolbar={
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1 text-fg-2">Penjualan
              <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputCls} !w-auto`} aria-label="Bulan penjualan mingguan" />
            </label>
            <button type="button" className={btnPrimary} onClick={() => setEditBp({ term: t.term, level: t.level })}>
              <Icon name="add" size={16} />Tambah BP
            </button>
            {t.term === "CBD" && (
              <button type="button" className={btnGhost} disabled={uploading} onClick={() => fileRef.current?.click()}
                title="File ERP Payment/Receipt; dipakai: AR Receipt (Prepaid) & (Prepaid-ESPAY), Transaction Date, bukan Reversed">
                <Icon name="upload" size={16} />{uploading ? "Membaca…" : "Upload CBD Sales"}
              </button>
            )}
            {t.level === "Group" && (
              <button type="button" className={btnGhost} onClick={() => setEditGroup({ term: t.term })}>
                <Icon name="add" size={16} />Tambah Grup
              </button>
            )}
          </span>
        }
        emptyText={ds.data ? "Belum ada data di tab ini." : "Memuat…"} />
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden aria-label="Pilih file CBD sales" onChange={(e) => void uploadCbd(e.target.files?.[0])} />
      <p className="text-xs text-fg-2">
        Kolom minggu ({monthLabel(month)}, dipotong setiap Sabtu): ✓ ada penjualan, ✗ tidak ada.{" "}
        {t.term === "TOP"
          ? <>Sumber: invoice ERP &ldquo;Invoice and Payment Date Comparison&rdquo; (Pusat Upload){lastErp ? `, upload terakhir ${fmtTimestamp(lastErp.at)}` : ""} — dicocokkan lewat Key BP.</>
          : <>Sumber: upload CBD Sales (AR Receipt Prepaid &amp; Prepaid-ESPAY){lastCbd ? `, terakhir ${lastCbd.file_name} · ${fmtTimestamp(lastCbd.at)} oleh ${lastCbd.uploader}` : " — belum ada upload"}. Hanya tanda yang disimpan, tanpa nominal.</>}
      </p>

      {editBp && (
        <BpModal value={editBp} groups={groups} onClose={() => setEditBp(null)} onSave={saveBp}
          onEditGroup={(id) => setEditGroup(data.groups.find((g) => g.id === id) ?? null)}
          onArchive={editBp.id ? () => archive(editBp.id!, null, editBp.business_partner ?? "BP") : undefined}
          emails={editBp.id ? data.emails.filter((e) => e.customer_id === editBp.id).map((e) => e.email) : []} />
      )}
      {editGroup && (
        <GroupModal value={editGroup} onClose={() => setEditGroup(null)} onSave={saveGroup}
          members={editGroup.id ? data.customers.filter((c) => c.group_id === editGroup.id).length : 0}
          onArchive={editGroup.id ? () => archive(null, editGroup.id!, `Payment Group ${editGroup.payment_group}`) : undefined}
          emails={editGroup.id ? data.emails.filter((e) => e.group_id === editGroup.id).map((e) => e.email) : []} />
      )}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode; hint?: string; wide?: boolean }) {
  return (
    <label className={`block space-y-1 text-sm ${props.wide ? "sm:col-span-2" : ""}`}>
      <span className="text-fg-2">{props.label}</span>
      {props.children}
      {props.hint && <span className="block text-xs text-fg-2">{props.hint}</span>}
    </label>
  );
}

// Daftar email: satu per baris (koma/spasi juga boleh); teks yang bukan alamat ditolak di sini.
function EmailInput(props: { value: string; onChange: (v: string) => void }) {
  const { emails, rest } = splitEmails(props.value);
  return (
    <>
      <textarea value={props.value} onChange={(e) => props.onChange(e.target.value)} rows={3} className={inputCls}
        placeholder={"nama@perusahaan.com\nfinance@perusahaan.com"} />
      <span className={`block text-xs ${rest ? "text-danger" : "text-fg-2"}`}>
        {rest ? `Bukan alamat email: "${rest}" — pindahkan ke Catatan Email.` : `${emails.length} alamat email`}
      </span>
    </>
  );
}

function BpModal(props: {
  value: Partial<EmailCustomer>; groups: EmailGroup[]; emails: string[];
  onClose: () => void; onSave: (p: Record<string, unknown>) => Promise<boolean>; onEditGroup: (id: number) => void; onArchive?: () => void;
}) {
  const v = props.value;
  const level = (v.level ?? "BP") as Level; const term = (v.term ?? "CBD") as Term;
  const [f, setF] = useState({
    group_id: v.group_id ? String(v.group_id) : "", business_partner: v.business_partner ?? "", bp_value: v.bp_value ?? "",
    payment_group: v.payment_group ?? "", pic_ar: v.pic_ar ?? "", emails: props.emails.join("\n"),
    email_note: v.email_note ?? "", keterangan: v.keterangan ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const mail = splitEmails(f.emails);
  const invalid = !f.business_partner.trim() || (level === "Group" && !f.group_id) || !!mail.rest;

  async function save() {
    setBusy(true);
    await props.onSave({ id: v.id ?? null, term, level, group_id: level === "Group" ? Number(f.group_id) : null,
      business_partner: f.business_partner, bp_value: f.bp_value, payment_group: level === "BP" ? f.payment_group : null,
      pic_ar: level === "BP" ? f.pic_ar : null, emails: level === "BP" ? mail.emails : [], email_note: f.email_note, keterangan: f.keterangan });
    setBusy(false);
  }

  return (
    <Modal open wide title={`${v.id ? "Ubah" : "Tambah"} Business Partner · ${level} ${term}`} onClose={props.onClose}
      footer={<>
        {props.onArchive && <button type="button" className={`${btnGhost} mr-auto text-danger`} disabled={busy} onClick={props.onArchive}><Icon name="delete" size={16} />Hapus</button>}
        <button type="button" className={btnGhost} onClick={props.onClose}>Batal</button>
        <button type="button" className={btnPrimary} disabled={busy || invalid} onClick={save}><Icon name="save" size={16} />{busy ? "Menyimpan…" : "Simpan"}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {level === "Group" && (
          <Field label="Payment Group *" wide hint="PIC AR & email mengikuti Payment Group (berlaku untuk semua BP di grup).">
            <span className="flex gap-2">
              <select value={f.group_id} onChange={set("group_id")} className={inputCls}>
                <option value="">Pilih Payment Group…</option>
                {props.groups.map((g) => <option key={g.id} value={g.id}>{g.payment_group}</option>)}
              </select>
              {f.group_id && <button type="button" className={btnGhost} onClick={() => props.onEditGroup(Number(f.group_id))}>Ubah grup</button>}
            </span>
          </Field>
        )}
        <Field label="Business Partner *"><input value={f.business_partner} onChange={set("business_partner")} maxLength={200} className={inputCls} /></Field>
        <Field label="Value (Key BP)" hint="Mis. 1000258-PKP. Dicocokkan ke database untuk mengisi Payment Group, Collection & Marketing.">
          <input value={f.bp_value} onChange={set("bp_value")} maxLength={120} className={inputCls} />
        </Field>
        {level === "BP" && <>
          <Field label="Payment Group" hint="Kosongkan agar diambil dari database."><input value={f.payment_group} onChange={set("payment_group")} maxLength={200} className={inputCls} /></Field>
          <Field label="PIC AR"><input value={f.pic_ar} onChange={set("pic_ar")} maxLength={120} className={inputCls} /></Field>
          <Field label="Email" wide><EmailInput value={f.emails} onChange={(x) => setF({ ...f, emails: x })} /></Field>
        </>}
        <Field label="Catatan Email" wide hint="Mis. Kirim ke Adm Sales Surabaya."><input value={f.email_note} onChange={set("email_note")} maxLength={1000} className={inputCls} /></Field>
        <Field label="Keterangan" wide><textarea value={f.keterangan} onChange={set("keterangan")} rows={2} maxLength={1000} className={inputCls} /></Field>
      </div>
    </Modal>
  );
}

function GroupModal(props: {
  value: Partial<EmailGroup>; emails: string[]; members: number;
  onClose: () => void; onSave: (p: Record<string, unknown>) => Promise<boolean>; onArchive?: () => void;
}) {
  const v = props.value;
  const [f, setF] = useState({ payment_group: v.payment_group ?? "", pic_ar: v.pic_ar ?? "", emails: props.emails.join("\n"),
    email_note: v.email_note ?? "", keterangan: v.keterangan ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const mail = splitEmails(f.emails);

  async function save() {
    setBusy(true);
    await props.onSave({ id: v.id ?? null, term: v.term, payment_group: f.payment_group, pic_ar: f.pic_ar, emails: mail.emails,
      email_note: f.email_note, keterangan: f.keterangan });
    setBusy(false);
  }

  return (
    <Modal open wide title={`${v.id ? "Ubah" : "Tambah"} Payment Group · ${v.term}`} onClose={props.onClose}
      footer={<>
        {props.onArchive && <button type="button" className={`${btnGhost} mr-auto text-danger`} disabled={busy} onClick={props.onArchive}><Icon name="delete" size={16} />Hapus grup</button>}
        <button type="button" className={btnGhost} onClick={props.onClose}>Batal</button>
        <button type="button" className={btnPrimary} disabled={busy || !f.payment_group.trim() || !!mail.rest} onClick={save}><Icon name="save" size={16} />{busy ? "Menyimpan…" : "Simpan"}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Payment Group *"><input value={f.payment_group} onChange={set("payment_group")} maxLength={200} className={inputCls} /></Field>
        <Field label="PIC AR"><input value={f.pic_ar} onChange={set("pic_ar")} maxLength={120} className={inputCls} /></Field>
        <Field label="Email grup" wide><EmailInput value={f.emails} onChange={(x) => setF({ ...f, emails: x })} /></Field>
        <Field label="Catatan Email" wide><input value={f.email_note} onChange={set("email_note")} maxLength={1000} className={inputCls} /></Field>
        <Field label="Keterangan" wide><textarea value={f.keterangan} onChange={set("keterangan")} rows={2} maxLength={1000} className={inputCls} /></Field>
      </div>
      {v.id ? <p className="mt-3 text-xs text-fg-2">{props.members} Business Partner di grup ini. Menghapus grup juga mengarsipkan BP anggotanya.</p> : null}
    </Modal>
  );
}
