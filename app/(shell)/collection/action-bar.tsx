"use client";

import { setRemarks } from "@/lib/modules/remarks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rupiah } from "@/lib/format";
import { applyExchange, withSearch, type CollectionRow, type ColumnKey } from "@/lib/modules/collection/view-model";
import { buildWaMessage, effectiveTemplate, normalizePhone, waLink, type WaTemplate } from "@/lib/modules/collection/wa-message";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import type { Patch } from "./collection-view";
import type { PayHistTarget } from "@/components/payment-history-modal";
import { exportExcel, printRows } from "./export";
import {
  ContactsModal, FotoModal, NoteModal, readDeviceTemplate, ResiModal, TukarModal, WaEditModal, type Contact, type TukarVia,
} from "./modals";
import { Icon } from "@/components/icons";

type ModalName = "note" | "tukar" | "contacts" | "wa" | "foto" | "resi" | null;

export function ActionBar(props: {
  collection: string;
  selected: CollectionRow[];
  columns: ColumnKey[];
  clear: () => void;
  patch: Patch;
  serverTemplate: Partial<WaTemplate> | null;
  // undefined = tanpa akses; "multi" = centang > 1 BP; "none" = BP tidak dikenal di aging
  history?: { bpKey: string; bp: string; group: string | null; marketplace: boolean } | "multi" | "none";
  onHistory?: (t: PayHistTarget) => void;
}) {
  const { selected, collection, patch } = props;
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [modal, setModal] = useState<ModalName>(null);
  const [histMenu, setHistMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [manualPhone, setManualPhone] = useState<string | null>(null);
  const [deviceTpl, setDeviceTpl] = useState<Partial<WaTemplate> | null>(null);

  const loadContacts = useCallback(async () => {
    const out: Contact[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("contacts").select("id, business_partner, nama, no_wa, kode_bp").order("business_partner").order("id").range(from, from + 999);
      if (error || !data) break;
      out.push(...data);
      if (data.length < 1000) break;
    }
    setContacts(out);
  }, [supabase]);

  useEffect(() => {
    loadContacts(); // eslint-disable-line react-hooks/set-state-in-effect -- muat kontak sekali saat halaman dibuka
    setDeviceTpl(readDeviceTemplate());
  }, [loadContacts]);

  // Beberapa kontak per BP (Fase 47): nomor otomatis = kontak pertama BP tersebut.
  const byBp = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contacts) if (!m.has(c.business_partner)) m.set(c.business_partner, c.no_wa);
    return m;
  }, [contacts]);
  const firstBp = selected[0]?.business_partner ?? "";
  // Nomor WA otomatis dari kontak BP pertama, kecuali pengguna mengetik/memilih sendiri.
  const phone = manualPhone ?? byBp.get(firstBp) ?? "";
  const template = effectiveTemplate(deviceTpl, props.serverTemplate);
  const total = selected.reduce((s, r) => s + r.open_amt, 0);
  const invoices = selected.map((r) => r.invoice_no);

  function clear() {
    setManualPhone(null);
    props.clear();
  }

  // Simpan lewat RPC contacts_save: baris ber-id diubah; tanpa id ditambah (nomor yang sama untuk BP yang sama = ubah).
  async function upsertContacts(list: Contact[]) {
    const { error } = await supabase.rpc("contacts_save" as never, { p_rows: list } as never);
    if (error) {
      toast(`Gagal menyimpan kontak: ${error.message}`, "danger");
      return false;
    }
    await loadContacts();
    return true;
  }

  async function saveNote(kategori: string, isi: string, date: string) {
    const before = new Map(selected.map((r) => [r.invoice_no, r]));
    const restore = () => patch(invoices, (r) => before.get(r.invoice_no) ?? r);

    if (kategori === "Jadwal Bayar") {
      patch(invoices, (r) => withSearch({ ...r, janji_bayar: date }));
      const { error } = await supabase.from("payment_promises").insert(
        selected.map((r) => ({
          invoice_no: r.invoice_no, business_partner: r.business_partner, collection_name: collection,
          promise_date: date, isi: isi || null,
        })),
      );
      if (error) { restore(); toast(`Gagal menyimpan: ${error.message}`, "danger"); return false; }
    } else {
      const catatan = `[${kategori}]${isi ? " - " + isi : ""}`;
      // Catatan juga menjadi Keterangan invoice bersama (trigger database), tampilkan langsung.
      const keterangan = `[${kategori}]${isi.trim() ? " " + isi.trim() : ""}`;
      patch(invoices, (r) => withSearch({ ...r, catatan, keterangan }));
      const { error } = await supabase.from("notes").insert(
        selected.map((r) => ({
          invoice_no: r.invoice_no, kategori, isi, business_partner: r.business_partner, collection_name: collection,
          invoice_date: r.invoice_date, no_po: r.no_po || null, no_sj: r.no_sj || null,
        })),
      );
      if (error) { restore(); toast(`Gagal menyimpan: ${error.message}`, "danger"); return false; }
    }
    toast(`Catatan disimpan untuk ${selected.length} invoice.`, "success");
    clear();
    return true;
  }

  // Keterangan invoice bersama untuk semua invoice terpilih (kosong = hapus).
  function editKeterangan() {
    const current = selected.length === 1 ? selected[0].keterangan : "";
    const text = window.prompt(`Keterangan untuk ${selected.length} invoice (kosongkan untuk menghapus):`, current);
    if (text === null) return;
    const before = new Map(selected.map((r) => [r.invoice_no, r]));
    patch(invoices, (r) => withSearch({ ...r, keterangan: text.trim() }));
    setRemarks(selected.map((r) => ({ no_sj: r.no_sj, invoice_no: r.invoice_no })), text, "collection")
      .then(() => { toast(`Keterangan disimpan untuk ${selected.length} invoice.`, "success"); clear(); })
      .catch((e: Error) => { patch(invoices, (r) => before.get(r.invoice_no) ?? r); toast(`Gagal menyimpan: ${e.message}`, "danger"); });
  }

  async function saveTukar(via: TukarVia, date: string, kurir: string | null) {
    if (via === "Kolektor") return saveTukarKolektor(date, kurir ?? "");
    const before = new Map(selected.map((r) => [r.invoice_no, r]));
    patch(invoices, (r) => applyExchange(r, { metode: via, tanggal: date, keterangan: null, resi: null, foto_path: null }));
    const { error } = await supabase.from("invoice_exchanges").insert(
      selected.map((r) => ({ invoice_no: r.invoice_no, metode: via, tanggal: date, collection_name: collection })),
    );
    if (error) {
      patch(invoices, (r) => before.get(r.invoice_no) ?? r);
      toast(`Gagal menyimpan: ${error.message}`, "danger");
      return false;
    }
    toast(`Tukar faktur via ${via} dicatat.`, "success");
    clear();
    return true;
  }

  // Via Kolektor (input manual, tanpa foto): RPC menulis update kolektor + tukar faktur sekaligus.
  async function saveTukarKolektor(date: string, kurir: string) {
    const { data, error } = await supabase.rpc("tukar_manual_kolektor" as never,
      { p_invoices: invoices, p_tanggal: date, p_kurir: kurir } as never);
    if (error) { toast(`Gagal menyimpan: ${error.message}`, "danger"); return false; }
    const r = data as { count: number; skipped: number; kode: string | null; kurir: string };
    if (r.count) patch(invoices, (row) => applyExchange(row, { metode: "Kolektor", tanggal: date, keterangan: r.kode, resi: null, foto_path: null }));
    toast(r.count
      ? `Tukar faktur via Kolektor (${r.kurir}) dicatat untuk ${r.count} invoice${r.skipped ? ` · ${r.skipped} dilewati (sudah diupdate kolektor)` : ""}.`
      : "Tidak ada yang dicatat: invoice terpilih sudah diupdate kolektor.", r.count ? "success" : "warning", 7000);
    clear();
    return true;
  }

  function sendWa() {
    const num = normalizePhone(phone);
    if (!num) {
      toast("Isi nomor WA terlebih dahulu.", "warning");
      return;
    }
    const msg = buildWaMessage(selected, collection, template);
    // Simpan nomor untuk setiap BP yang dipilih (di latar belakang).
    const bps = [...new Set(selected.map((r) => r.business_partner).filter(Boolean))];
    upsertContacts(bps.map((bp) => ({ business_partner: bp, nama: null, no_wa: phone })));
    const w = window.open(waLink(num, msg), "_blank");
    if (!w) window.location.href = waLink(num, msg);
    clear();
  }

  const ekspedisi = selected.some((r) => r.metode_tukar === "Ekspedisi");
  const foto = selected.some((r) => r.foto_path);

  return (
    <>
      {selected.length > 0 && (
        <div className="glass fixed inset-x-3 z-30 rounded-2xl px-4 py-3 md:inset-x-6" style={{ bottom: "calc(var(--dock-reserve) - 12px)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 text-sm">
              <b>{selected.length}</b> dipilih · <b>{rupiah(total)}</b>
            </div>
            <button type="button" className={btnGhost} disabled={!foto} onClick={() => setModal("foto")}>
              <Icon name="photo" size={20} />Foto
            </button>
            <button type="button" className={btnGhost} disabled={!ekspedisi} onClick={() => setModal("resi")}>
              <Icon name="local_shipping" size={20} />Resi
            </button>
            <button type="button" className={btnGhost} onClick={() => setModal("note")}>
              <Icon name="edit_note" size={20} />Catatan
            </button>
            <button type="button" className={btnGhost} onClick={editKeterangan}>
              <Icon name="sticky_note_2" size={20} />Keterangan
            </button>
            <button type="button" className={btnGhost} onClick={() => setModal("tukar")}>
              <Icon name="swap_horiz" size={20} />Tukar Faktur
            </button>
            {props.history !== undefined && (() => {
              const h = props.history;
              const ok = typeof h === "object";
              return (
                <div className="relative">
                  <button type="button" className={btnGhost} disabled={!ok}
                    title={h === "multi" ? "Pilih invoice dari satu BP" : h === "none" ? "BP tidak ditemukan di aging terbaru" : "Ringkasan pembayaran 3 bulan terakhir"}
                    onClick={() => {
                      if (!ok) return;
                      if (h.group) setHistMenu(!histMenu);
                      else props.onHistory?.({ kind: "bp", key: h.bpKey, name: h.bp });
                    }}>
                    <Icon name="history" size={20} />Lihat History Pembayaran
                  </button>
                  {ok && h.group && histMenu && (
                    <div className="absolute bottom-full mb-1 w-72 rounded-xl border border-line bg-surface p-1 shadow-lg" onMouseLeave={() => setHistMenu(false)}>
                      <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
                        onClick={() => { setHistMenu(false); props.onHistory?.({ kind: "bp", key: h.bpKey, name: h.bp }); }}>
                        BP ini <span className="block truncate text-xs text-fg-2">{h.bp}</span>
                      </button>
                      <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
                        onClick={() => { setHistMenu(false); props.onHistory?.({ kind: "group", name: h.group! }); }}>
                        Group <span className="block truncate text-xs text-fg-2">{h.group}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="relative">
              <button type="button" className={btnGhost} onClick={() => setExportMenu(!exportMenu)}>
                <Icon name="download" size={20} />Export
              </button>
              {exportMenu && (
                <div className="absolute bottom-full mb-1 w-44 rounded-xl border border-line bg-surface p-1 shadow-lg" onMouseLeave={() => setExportMenu(false)}>
                  <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
                    onClick={() => { setExportMenu(false); if (!printRows(collection, selected, props.columns)) toast("Popup diblokir browser.", "warning"); }}>
                    Print / PDF
                  </button>
                  <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
                    onClick={() => { setExportMenu(false); exportExcel(collection, selected, props.columns).catch((e: Error) => toast(`Gagal mengunduh Excel: ${e.message}`, "danger")); }}>
                    Excel
                  </button>
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-line bg-surface-2">
                <span className="pl-3 text-sm text-fg-2">+</span>
                <input value={phone} onChange={(e) => setManualPhone(e.target.value)} placeholder="62…" className={`${inputCls} !w-40 border-0 bg-transparent`} aria-label="Nomor WA" />
                <button type="button" className="px-2 text-fg-2 hover:text-fg" onClick={() => setModal("contacts")} title="Pilih kontak">
                  <Icon name="contacts" size={20} />
                </button>
              </div>
              <button type="button" className={btnPrimary} onClick={sendWa}>
                <Icon name="send" size={20} />Kirim WA
              </button>
              <button type="button" className={btnGhost} onClick={() => setModal("wa")} title="Edit Pesan WA">
                <Icon name="tune" size={20} />
              </button>
              <button type="button" className="text-fg-2 hover:text-danger" onClick={clear} aria-label="Batal pilih">
                <Icon name="close" size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      <NoteModal open={modal === "note"} onClose={() => setModal(null)} count={selected.length} onSave={saveNote} />
      <TukarModal open={modal === "tukar"} onClose={() => setModal(null)} count={selected.length} total={total} onSave={saveTukar} />
      <ContactsModal
        open={modal === "contacts"}
        onClose={() => setModal(null)}
        contacts={contacts}
        firstBp={firstBp}
        onPick={(p) => setManualPhone(p)}
        onSave={upsertContacts}
      />
      <WaEditModal open={modal === "wa"} onClose={() => setModal(null)} current={template} server={props.serverTemplate} onChange={setDeviceTpl} />
      <FotoModal open={modal === "foto"} onClose={() => setModal(null)} rows={selected} />
      <ResiModal open={modal === "resi"} onClose={() => setModal(null)} rows={selected} />
    </>
  );
}
