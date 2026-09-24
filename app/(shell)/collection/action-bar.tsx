"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rupiah } from "@/lib/format";
import { applyExchange, withSearch, type CollectionRow, type ColumnKey } from "@/lib/modules/collection/view-model";
import { buildWaMessage, effectiveTemplate, normalizePhone, waLink, type WaTemplate } from "@/lib/modules/collection/wa-message";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import type { Patch } from "./collection-view";
import { exportExcel, printRows } from "./export";
import {
  ContactsModal, FotoModal, NoteModal, readDeviceTemplate, ResiModal, TukarModal, WaEditModal, type Contact,
} from "./modals";

type ModalName = "note" | "tukar" | "contacts" | "wa" | "foto" | "resi" | null;

export function ActionBar(props: {
  collection: string;
  selected: CollectionRow[];
  columns: ColumnKey[];
  clear: () => void;
  patch: Patch;
  serverTemplate: Partial<WaTemplate> | null;
}) {
  const { selected, collection, patch } = props;
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [modal, setModal] = useState<ModalName>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [manualPhone, setManualPhone] = useState<string | null>(null);
  const [deviceTpl, setDeviceTpl] = useState<Partial<WaTemplate> | null>(null);

  const loadContacts = useCallback(async () => {
    const out: Contact[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("contacts").select("business_partner, nama, no_wa").order("business_partner").range(from, from + 999);
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

  const byBp = useMemo(() => new Map(contacts.map((c) => [c.business_partner, c.no_wa])), [contacts]);
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

  async function upsertContacts(list: Contact[]) {
    const withName = list.filter((c) => c.nama?.trim());
    const noName = list.filter((c) => !c.nama?.trim()).map(({ business_partner, no_wa }) => ({ business_partner, no_wa }));
    const now = new Date().toISOString();
    for (const part of [withName, noName]) {
      if (!part.length) continue;
      const { error } = await supabase.from("contacts").upsert(part.map((c) => ({ ...c, updated_at: now })), { onConflict: "business_partner" });
      if (error) {
        toast(`Gagal menyimpan kontak: ${error.message}`, "danger");
        return false;
      }
    }
    await loadContacts();
    return true;
  }

  async function saveNote(kategori: string, isi: string, date: string) {
    const before = new Map(selected.map((r) => [r.invoice_no, r]));
    const restore = () => patch(invoices, (r) => before.get(r.invoice_no) ?? r);

    if (kategori === "Janji Bayar") {
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
      patch(invoices, (r) => withSearch({ ...r, catatan }));
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

  async function saveTukar(via: "WA" | "Email", date: string) {
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:left-[var(--sidebar-w)]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 text-sm">
              <b>{selected.length}</b> dipilih · <b>{rupiah(total)}</b>
            </div>
            <button type="button" className={btnGhost} disabled={!foto} onClick={() => setModal("foto")}>
              <span className="material-symbols-outlined">photo</span>Foto
            </button>
            <button type="button" className={btnGhost} disabled={!ekspedisi} onClick={() => setModal("resi")}>
              <span className="material-symbols-outlined">local_shipping</span>Resi
            </button>
            <button type="button" className={btnGhost} onClick={() => setModal("note")}>
              <span className="material-symbols-outlined">edit_note</span>Catatan
            </button>
            <button type="button" className={btnGhost} onClick={() => setModal("tukar")}>
              <span className="material-symbols-outlined">swap_horiz</span>Tukar Faktur
            </button>
            <div className="relative">
              <button type="button" className={btnGhost} onClick={() => setExportMenu(!exportMenu)}>
                <span className="material-symbols-outlined">download</span>Export
              </button>
              {exportMenu && (
                <div className="absolute bottom-full mb-1 w-44 rounded-xl border border-line bg-surface p-1 shadow-lg" onMouseLeave={() => setExportMenu(false)}>
                  <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
                    onClick={() => { setExportMenu(false); if (!printRows(collection, selected, props.columns)) toast("Popup diblokir browser.", "warning"); }}>
                    Print / PDF
                  </button>
                  <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
                    onClick={() => { setExportMenu(false); exportExcel(collection, selected, props.columns); }}>
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
                  <span className="material-symbols-outlined">contacts</span>
                </button>
              </div>
              <button type="button" className={btnPrimary} onClick={sendWa}>
                <span className="material-symbols-outlined">send</span>Kirim WA
              </button>
              <button type="button" className={btnGhost} onClick={() => setModal("wa")} title="Edit Pesan WA">
                <span className="material-symbols-outlined">tune</span>
              </button>
              <button type="button" className="text-fg-2 hover:text-danger" onClick={clear} aria-label="Batal pilih">
                <span className="material-symbols-outlined">close</span>
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
