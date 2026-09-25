"use client";

import { Fragment, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DETAIL_HEADERS, detailRows, documentTypes, generateCoretaxXml, invTotals, matchDeleteList, n,
  parseCoretaxXml, PIVOT_HEADERS, pivotRows, type TaxInvoice,
} from "@/lib/modules/coretax/coretax";
import { downloadXlsxSheets } from "@/lib/xlsx-client";
import { fmtDate, rupiah } from "@/lib/format";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls, td, th } from "@/components/ui";
import { DeleteListModal } from "./delete-list-modal";
import { HistoryView } from "./history-view";

function download(content: string, name: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Port XML CoreTax / Tax Invoice Manager.
export function CoretaxView() {
  const toast = useToast();
  const [file, setFile] = useState("");
  const [tin, setTin] = useState("");
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<string> | null>(null); // null = semua jenis
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState<"data" | "xml" | "riwayat">("data");
  const [pendingDel, setPendingDel] = useState<TaxInvoice | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const types = useMemo(() => documentTypes(invoices), [invoices]);
  const typeOn = (t: string) => !activeTypes || activeTypes.has(t);
  const allOn = !activeTypes || activeTypes.size === types.length;
  const filterTag = types.length < 2 || allOn ? "" : [...(activeTypes ?? [])].join("+");
  // Yang diekspor/disimpan: aktif DAN jenisnya menyala (pencarian hanya membantu menelusuri layar).
  const exportable = invoices.filter((i) => !i.deleted && typeOn(i.type));
  const visible = invoices.filter((i) => typeOn(i.type) && (!search || i.search.includes(search.toLowerCase())));

  const stats = useMemo(() => {
    let dpp = 0, dppOther = 0, ppn = 0;
    for (const i of exportable) {
      const t = invTotals(i);
      dpp += t.dpp; dppOther += t.dppOther; ppn += t.ppn;
    }
    return { total: invoices.length, active: exportable.length, deleted: invoices.filter((i) => i.deleted).length, dpp, dppOther, ppn };
  }, [exportable, invoices]);

  async function onFile(f: File | null) {
    if (!f) return;
    try {
      const res = parseCoretaxXml(await f.text());
      setFile(f.name);
      setTin(res.tin);
      setInvoices(res.invoices);
      setActiveTypes(null);
      setSearch("");
      setTab("data");
      toast(`File berhasil dimuat — ${res.invoices.length} faktur ditemukan`, "success");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  function toggleType(t: string) {
    const next = new Set(activeTypes ?? types);
    if (next.has(t)) {
      if (next.size === 1) return toast("Minimal satu jenis dokumen harus aktif.", "warning");
      next.delete(t);
    } else next.add(t);
    setActiveTypes(next.size === types.length ? null : next);
  }

  const markDeleted = (ids: number[]) => setInvoices((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, deleted: true } : i)));

  const base = file.replace(/\.xml$/i, "") || "TaxInvoice";
  const suffix = filterTag ? "_" + filterTag.replace(/[^\w+-]/g, "") : "";
  const today = new Date().toISOString().slice(0, 10);
  const note = filterTag ? ` (filter: ${filterTag})` : "";
  const emptyMsg = (verb: string) =>
    invoices.some((i) => !i.deleted) ? "Tidak ada faktur yang cocok dengan filter aktif" : `Tidak ada data aktif untuk ${verb}`;

  function exportXml() {
    if (!exportable.length) return toast(emptyMsg("diekspor"), "warning");
    download(generateCoretaxXml(tin, exportable), `${base}${suffix}_edited_${today}.xml`, "text/xml;charset=utf-8");
    toast(`File XML diekspor — ${exportable.length} faktur${note}`, "success");
  }

  function exportExcel() {
    if (!exportable.length) return toast(emptyMsg("diekspor"), "warning");
    downloadXlsxSheets(`${base}${suffix}_${today}.xlsx`, [
      { name: "TaxInvoices", rows: [DETAIL_HEADERS, ...detailRows(exportable)] },
      { name: "Tax per Invoice", rows: [PIVOT_HEADERS, ...pivotRows(exportable)] },
    ]);
  }

  async function saveToDb() {
    if (!exportable.length) return toast(emptyMsg("disimpan"), "warning");
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: batch, error } = await supabase.from("coretax_batches").insert({
        file_name: file, seller_tin: tin, types: filterTag, invoice_count: exportable.length,
        line_count: exportable.reduce((a, i) => a + i.goods.length, 0), dpp: stats.dpp, dpp_lain: stats.dppOther, ppn: stats.ppn,
      }).select("id").single();
      if (error) throw error;
      const lines = detailRows(exportable).map((r) => ({
        batch_id: batch.id, no: r[0] as number, tax_invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(String(r[1]).trim()) ? String(r[1]).trim() : null,
        tax_invoice_opt: String(r[2]), trx_code: String(r[3]), ref_desc: String(r[4]), seller_idtku: String(r[5]),
        buyer_tin: String(r[6]), buyer_document: String(r[7]), buyer_country: String(r[8]), buyer_document_number: String(r[9]),
        buyer_name: String(r[10]), buyer_address: String(r[11]), buyer_email: String(r[12]), buyer_idtku: String(r[13]),
        code: String(r[14]), name: String(r[15]), unit: String(r[16]), price: r[17] as number, qty: r[18] as number,
        total_discount: r[19] as number, tax_base: r[20] as number, other_tax_base: r[21] as number, vat_rate: r[22] as number,
        vat: r[23] as number, stlg_rate: r[24] as number, stlg: r[25] as number,
      }));
      for (let i = 0; i < lines.length; i += 1000) {
        const { error: e2 } = await supabase.from("coretax_lines").insert(lines.slice(i, i + 1000));
        if (e2) throw e2;
      }
      toast(`Tersimpan: ${lines.length} baris rincian dari ${exportable.length} faktur${note}.`, "success", 6000);
      setHistoryKey((k) => k + 1);
    } catch (e) {
      toast(`Gagal menyimpan: ${(e as Error).message}`, "danger");
    } finally {
      setSaving(false);
    }
  }

  const loaded = invoices.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-medium">XML CoreTax</h1>
          <p className="text-sm text-fg-2">{loaded ? `${file} · NPWP penjual ${tin || "—"}` : "Muat file XML bulk faktur pajak dari CoreTax."}</p>
        </div>
        <label className={`${btnPrimary} cursor-pointer`}>
          <span className="material-symbols-outlined">upload_file</span>Pilih XML
          <input type="file" accept=".xml" className="hidden" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
        <button type="button" className={btnGhost} disabled={!loaded} onClick={() => setAutoOpen(true)}>
          <span className="material-symbols-outlined">auto_delete</span>Hapus Otomatis
        </button>
        <button type="button" className={btnGhost} disabled={!loaded} onClick={exportXml}>
          <span className="material-symbols-outlined">code</span>Export XML
        </button>
        <button type="button" className={btnGhost} disabled={!loaded} onClick={exportExcel}>
          <span className="material-symbols-outlined">table_view</span>Export Excel
        </button>
        <button type="button" className={btnGhost} disabled={!loaded || saving} onClick={saveToDb}>
          <span className="material-symbols-outlined">save</span>{saving ? "Menyimpan…" : "Simpan ke Database"}
        </button>
      </div>

      {loaded && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Total Faktur", stats.total.toLocaleString("id-ID")],
            [filterTag ? "Faktur Aktif (Terfilter)" : "Faktur Aktif", stats.active.toLocaleString("id-ID")],
            ["Dihapus", stats.deleted.toLocaleString("id-ID")],
            ["DPP", rupiah(Math.round(stats.dpp))],
            ["DPP Nilai Lain", rupiah(Math.round(stats.dppOther))],
            ["PPN", rupiah(Math.round(stats.ppn))],
          ].map(([l, v]) => (
            <div key={l} className={`${card} p-3`}>
              <div className="text-xs text-fg-2">{l}</div>
              <div className="mt-1 font-medium">{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line">
        {([["data", "Data Faktur"], ["xml", "XML Viewer"], ["riwayat", "Riwayat Simpan"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === k ? "border-accent text-accent" : "border-transparent text-fg-2 hover:text-fg"}`}>{l}</button>
        ))}
      </div>

      {tab === "data" && loaded && (
        <section className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            {types.length > 1 && types.map((t) => (
              <button key={t} type="button" onClick={() => toggleType(t)}
                className={`rounded-full px-3 py-1 text-xs ${typeOn(t) ? "bg-pill text-pill-fg" : "border border-line text-fg-2"}`}>
                {t} ({invoices.filter((i) => i.type === t && !i.deleted).length})
              </button>
            ))}
            {!allOn && <button type="button" className="text-xs text-accent hover:underline" onClick={() => setActiveTypes(null)}>Semua jenis</button>}
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari referensi, pembeli, NPWP, kode barang…" className={`${inputCls} ml-auto !w-80`} />
            <span className="text-xs text-fg-2">{visible.length} tampil</span>
          </div>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {["#", "Tanggal", "Referensi", "Pembeli", "NPWP Pembeli", "Kode Barang"].map((h) => <th key={h} className={th}>{h}</th>)}
                  {["Item", "DPP", "PPN"].map((h) => <th key={h} className={`${th} text-right`}>{h}</th>)}
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => {
                  const t = invTotals(inv);
                  return (
                    <Fragment key={inv.id}>
                      <tr onClick={() => setOpen(open === inv.id ? null : inv.id)}
                        className={`cursor-pointer border-t border-line hover:bg-surface-2 ${inv.deleted ? "text-fg-disabled line-through" : ""}`}>
                        <td className={td}>{inv.id + 1}</td>
                        <td className={td}>{fmtDate(inv.TaxInvoiceDate.trim())}</td>
                        <td className={`${td} font-mono text-xs`}>{inv.RefDesc}</td>
                        <td className={`${td} max-w-64 truncate`} title={inv.BuyerName}>{inv.BuyerName}</td>
                        <td className={`${td} font-mono text-xs`}>{inv.BuyerTin}</td>
                        <td className={`${td} max-w-40 truncate`} title={inv.codes.join(", ")}>{inv.codes.join(", ")}</td>
                        <td className={`${td} text-right`}>{inv.goods.length}</td>
                        <td className={`${td} text-right`}>{Math.round(t.dpp).toLocaleString("id-ID")}</td>
                        <td className={`${td} text-right`}>{Math.round(t.ppn).toLocaleString("id-ID")}</td>
                        <td className={td} onClick={(e) => e.stopPropagation()}>
                          {!inv.deleted && (
                            <button type="button" className="text-fg-2 hover:text-danger" title="Hapus faktur" onClick={() => setPendingDel(inv)}>
                              <span className="material-symbols-outlined">delete</span>
                            </button>
                          )}
                        </td>
                      </tr>
                      {open === inv.id && (
                        <tr className="bg-surface-2/50 text-xs">
                          <td />
                          <td colSpan={9} className="px-3 py-2">
                            <div className="mb-2 text-fg-2">
                              {inv.BuyerAdress} · ID TKU pembeli {inv.BuyerIDTKU} · Kode transaksi {inv.TrxCode} · {inv.TaxInvoiceOpt}
                            </div>
                            <table className="w-full">
                              <thead><tr>{["Kode", "Nama", "Satuan", "Harga", "Qty", "Diskon", "DPP", "DPP Lain", "PPN"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium text-fg-2">{h}</th>)}</tr></thead>
                              <tbody>
                                {inv.goods.map((g, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1 font-mono">{g.Code}</td><td className="px-2 py-1">{g.Name}</td><td className="px-2 py-1">{g.Unit}</td>
                                    {[g.Price, g.Qty, g.TotalDiscount, g.TaxBase, g.OtherTaxBase, g.VAT].map((v, j) => (
                                      <td key={j} className="px-2 py-1 text-right">{n(v).toLocaleString("id-ID")}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "xml" && loaded && (
        <section className={`${card} overflow-hidden`}>
          <p className="border-b border-line px-4 py-2 text-xs text-fg-2">
            Pratinjau XML yang akan diekspor ({exportable.length} faktur aktif{note}).
          </p>
          <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-xs leading-5">
            {generateCoretaxXml(tin, exportable.filter((i) => !search || i.search.includes(search.toLowerCase())).slice(0, 300))}
          </pre>
        </section>
      )}

      {(tab === "data" || tab === "xml") && !loaded && (
        <p className={`${card} p-8 text-center text-sm text-fg-2`}>Belum ada file. Klik &quot;Pilih XML&quot; untuk memuat file CoreTax.</p>
      )}

      {tab === "riwayat" && <HistoryView key={historyKey} />}

      <Modal
        open={!!pendingDel}
        onClose={() => setPendingDel(null)}
        title="Hapus Faktur"
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setPendingDel(null)}>Batal</button>
            <button type="button" className={btnPrimary} onClick={() => {
              if (!pendingDel) return;
              markDeleted([pendingDel.id]);
              toast(`Faktur #${pendingDel.id + 1} · ${pendingDel.RefDesc} dihapus`, "success");
              setPendingDel(null);
            }}>Hapus</button>
          </>
        }
      >
        {pendingDel && (
          <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
            <dt className="text-fg-2">Nomor urut</dt><dd>#{pendingDel.id + 1}</dd>
            <dt className="text-fg-2">Referensi</dt><dd>{pendingDel.RefDesc}</dd>
            <dt className="text-fg-2">Tanggal</dt><dd>{fmtDate(pendingDel.TaxInvoiceDate.trim())}</dd>
            <dt className="text-fg-2">Pembeli</dt><dd>{pendingDel.BuyerName}</dd>
            <dt className="text-fg-2">NPWP</dt><dd>{pendingDel.BuyerTin}</dd>
            <dt className="text-fg-2">Item</dt><dd>{pendingDel.goods.length} barang/jasa</dd>
          </dl>
        )}
        <p className="mt-3 text-xs text-fg-2">Faktur yang dihapus tidak ikut diekspor atau disimpan.</p>
      </Modal>

      <DeleteListModal
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        match={(refs) => matchDeleteList(invoices, refs)}
        onExecute={(ids) => {
          markDeleted(ids);
          toast(`${ids.length} faktur berhasil dihapus otomatis`, "success");
        }}
      />
    </div>
  );
}
