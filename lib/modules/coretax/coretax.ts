// Port XML CoreTax/index.html (Tax Invoice Manager): baca XML bulk faktur pajak
// CoreTax (DJP), saring/hapus faktur, lalu ekspor XML bersih atau simpan.
// Perbedaan dari versi lama: nilai angka disimpan sebagai TEKS ASLI sehingga XML hasil
// ekspor identik dengan file sumber (versi lama mengubah "22570625.00" → "22570625").

export const NO_PREFIX = "(TANPA PREFIX)";

const HEADER_FIELDS = [
  "TaxInvoiceDate", "TaxInvoiceOpt", "TrxCode", "AddInfo", "CustomDoc", "RefDesc", "FacilityStamp",
  "SellerIDTKU", "BuyerTin", "BuyerDocument", "BuyerCountry", "BuyerDocumentNumber", "BuyerName",
  "BuyerAdress", "BuyerEmail", "BuyerIDTKU",
] as const;
const GOOD_TEXT = ["Opt", "Code", "Name", "Unit"] as const;
const GOOD_NUM = ["Price", "Qty", "TotalDiscount", "TaxBase", "OtherTaxBase", "VATRate", "VAT", "STLGRate", "STLG"] as const;

type HeaderField = (typeof HEADER_FIELDS)[number];
type GoodNum = (typeof GOOD_NUM)[number];

export type Good = Record<(typeof GOOD_TEXT)[number], string> & Record<GoodNum, string>;
export type TaxInvoice = Record<HeaderField, string> & {
  id: number;
  goods: Good[];
  deleted: boolean;
  codes: string[];   // kode barang unik (urut kemunculan)
  search: string;    // indeks pencarian huruf kecil
  type: string;      // segmen pertama RefDesc, mis. "SI"
};

export const n = (s: string) => Number(s) || 0;

export function uniqCodes(goods: Good[]) {
  const out: string[] = [];
  for (const g of goods) {
    const c = g.Code.trim();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// '&' lepas yang bukan entity (ada di file CoreTax asli) dibuat valid dulu, seperti versi lama.
export const escapeStrayAmpersands = (text: string) =>
  text.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");

export function parseCoretaxXml(text: string) {
  const s = escapeStrayAmpersands(text);
  const doc = new DOMParser().parseFromString(s, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Format XML tidak valid atau rusak");
  const tin = doc.querySelector("TIN")?.textContent?.trim() ?? "";
  const blocks = Array.from(doc.querySelectorAll("TaxInvoice"));
  if (!blocks.length) throw new Error("Tidak ada blok <TaxInvoice> di dalam file");

  const invoices: TaxInvoice[] = blocks.map((inv, i) => {
    // Nilai disimpan apa adanya (termasuk spasi di tepi) agar ekspor identik dengan sumber;
    // pemotongan spasi hanya dipakai saat mencocokkan/mencari.
    const g = (el: Element, t: string) => el.querySelector(t)?.textContent ?? "";
    const head = Object.fromEntries(HEADER_FIELDS.map((f) => [f, g(inv, f)])) as Record<HeaderField, string>;
    const goods = Array.from(inv.querySelectorAll("GoodService")).map((gs) => {
      const o = {} as Good;
      for (const f of GOOD_TEXT) o[f] = g(gs, f);
      for (const f of GOOD_NUM) o[f] = g(gs, f).trim() || "0";
      return o;
    });
    const codes = uniqCodes(goods);
    return {
      ...head,
      id: i,
      goods,
      deleted: false,
      codes,
      search: `${head.RefDesc} ${head.BuyerName} ${head.BuyerTin} ${head.BuyerDocumentNumber} ${codes.join(" ")}`.trim().toLowerCase(),
      type: (head.RefDesc.split("/")[0] ?? "").trim().toUpperCase() || NO_PREFIX,
    };
  });
  return { tin, invoices };
}

const xe = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Tag kosong ditulis self-closing seperti file CoreTax (<AddInfo/>).
const tag = (pad: string, name: string, value: string, selfCloseEmpty = false) =>
  selfCloseEmpty && !value ? `${pad}<${name}/>\n` : `${pad}<${name}>${xe(value)}</${name}>\n`;

export function generateCoretaxXml(tin: string, invoices: TaxInvoice[]) {
  const P1 = " ".repeat(16);
  const P2 = " ".repeat(28);
  let x = '<?xml version="1.0" encoding="UTF-8"?>\n\n<TaxInvoiceBulk\n    xmlns:xsd="http://www.w3.org/2001/XMLSchema"\n    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n\n';
  x += `    <TIN>${xe(tin)}</TIN>\n\n    <ListOfTaxInvoice>\n`;
  for (const v of invoices) {
    x += "            <TaxInvoice>\n";
    for (const f of HEADER_FIELDS) x += tag(P1, f, v[f], f === "AddInfo" || f === "CustomDoc" || f === "FacilityStamp");
    x += `${P1}<ListOfGoodService>\n`;
    for (const g of v.goods) {
      x += "                        <GoodService>\n";
      for (const f of GOOD_TEXT) x += tag(P2, f, g[f]);
      for (const f of GOOD_NUM) x += tag(P2, f, g[f]);
      x += "                        </GoodService>\n";
    }
    x += `${P1}</ListOfGoodService>\n            </TaxInvoice>\n`;
  }
  return x + "    </ListOfTaxInvoice>\n</TaxInvoiceBulk>";
}

export function invTotals(inv: TaxInvoice) {
  let dpp = 0, dppOther = 0, ppn = 0;
  for (const g of inv.goods) {
    dpp += n(g.TaxBase);
    dppOther += n(g.OtherTaxBase);
    ppn += n(g.VAT);
  }
  return { dpp, dppOther, ppn };
}

// Daftar jenis dokumen (prefix RefDesc) urut abjad, "(TANPA PREFIX)" terakhir.
export function documentTypes(invoices: TaxInvoice[]) {
  const set = [...new Set(invoices.map((i) => i.type))];
  return set.sort((a, b) => (a === NO_PREFIX ? 1 : b === NO_PREFIX ? -1 : a.localeCompare(b)));
}

// Cocokkan daftar No Referensi (sheet "Hapus" lama) dengan faktur aktif, tanpa beda huruf besar/kecil.
export function matchDeleteList(invoices: TaxInvoice[], refs: string[]) {
  const found: TaxInvoice[] = [];
  const notFound: string[] = [];
  for (const ref of refs) {
    let match: TaxInvoice | null = null;
    for (const inv of invoices) if (!inv.deleted && inv.RefDesc.trim().toLowerCase() === ref.trim().toLowerCase()) match = inv;
    if (match) found.push(match);
    else notFound.push(ref);
  }
  return { found, notFound };
}

// Baris Excel "TaxInvoices" (satu baris per barang) dan "Tax per Invoice" (satu baris per faktur).
export const DETAIL_HEADERS = [
  "No", "Tanggal Faktur", "Jenis Faktur", "Kode Transaksi", "Referensi Dokumen", "ID TKU Penjual", "NPWP Pembeli",
  "Jenis Dokumen Pembeli", "Negara Pembeli", "No. Dokumen Pembeli", "Nama Pembeli", "Alamat Pembeli", "Email Pembeli",
  "ID TKU Pembeli", "Kode Barang", "Nama Barang/Jasa", "Satuan", "Harga Satuan", "Qty", "Total Diskon", "DPP",
  "DPP Nilai Lain", "Tarif PPN (%)", "PPN", "Tarif PPnBM (%)", "PPnBM",
];

export const PIVOT_HEADERS = ["No", "Tanggal", "Referensi Dokumen", "Nama Pembeli", "NPWP Pembeli", "Jumlah Jenis", "DPP", "DPP Lain-lain", "PPN"];

export function detailRows(invoices: TaxInvoice[]) {
  const rows: (string | number)[][] = [];
  let no = 1;
  for (const inv of invoices) {
    for (const g of inv.goods) {
      rows.push([
        no++, inv.TaxInvoiceDate, inv.TaxInvoiceOpt, inv.TrxCode, inv.RefDesc, inv.SellerIDTKU, inv.BuyerTin,
        inv.BuyerDocument, inv.BuyerCountry, inv.BuyerDocumentNumber, inv.BuyerName, inv.BuyerAdress, inv.BuyerEmail,
        inv.BuyerIDTKU, g.Code, g.Name, g.Unit, n(g.Price), n(g.Qty), n(g.TotalDiscount), n(g.TaxBase),
        n(g.OtherTaxBase), n(g.VATRate), n(g.VAT), n(g.STLGRate), n(g.STLG),
      ]);
    }
  }
  return rows;
}

export function pivotRows(invoices: TaxInvoice[]) {
  return invoices.map((inv, i) => {
    const t = invTotals(inv);
    return [i + 1, inv.TaxInvoiceDate, inv.RefDesc, inv.BuyerName, inv.BuyerTin, inv.codes.length, t.dpp, t.dppOther, t.ppn];
  });
}
