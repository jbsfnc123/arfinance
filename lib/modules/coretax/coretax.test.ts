// @vitest-environment happy-dom
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  detailRows, documentTypes, escapeStrayAmpersands, generateCoretaxXml, matchDeleteList, NO_PREFIX, parseCoretaxXml, pivotRows,
} from "./coretax";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<TaxInvoiceBulk><TIN>0025897075038000</TIN><ListOfTaxInvoice>
<TaxInvoice><TaxInvoiceDate>2026-08-21</TaxInvoiceDate><TrxCode>04</TrxCode><RefDesc>SOP/1/VIII/XXVI/TRA</RefDesc>
<BuyerTin>0924015878411000</BuyerTin><BuyerName>PT A & B</BuyerName><BuyerIDTKU>0924015878411000000000</BuyerIDTKU>
<ListOfGoodService>
<GoodService><Code>392200</Code><Name>Tangki</Name><Price>100</Price><Qty>2</Qty><TaxBase>200</TaxBase><OtherTaxBase>183.33</OtherTaxBase><VAT>22</VAT></GoodService>
<GoodService><Code>392200</Code><Name>Tutup</Name><TaxBase>50</TaxBase><VAT>6</VAT></GoodService>
</ListOfGoodService></TaxInvoice>
<TaxInvoice><RefDesc>SI/2/VIII/XXVI/TRA</RefDesc><ListOfGoodService><GoodService><Code>1</Code></GoodService></ListOfGoodService></TaxInvoice>
<TaxInvoice><RefDesc></RefDesc><ListOfGoodService/></TaxInvoice>
</ListOfTaxInvoice></TaxInvoiceBulk>`;

describe("CoreTax", () => {
  const { tin, invoices } = parseCoretaxXml(SAMPLE);

  it("membaca header, barang, jenis dokumen; ID & NPWP tetap teks", () => {
    expect(tin).toBe("0025897075038000");
    expect(invoices).toHaveLength(3);
    expect(invoices[0]).toMatchObject({ TrxCode: "04", BuyerName: "PT A & B", BuyerIDTKU: "0924015878411000000000", type: "SOP", codes: ["392200"] });
    expect(invoices[0].goods[1].Price).toBe("0");
    expect(documentTypes(invoices)).toEqual(["SI", "SOP", NO_PREFIX]);
  });

  it("pivot per faktur & rincian per barang", () => {
    expect(pivotRows(invoices)[0]).toEqual([1, "2026-08-21", "SOP/1/VIII/XXVI/TRA", "PT A & B", "0924015878411000", 1, 250, 183.33, 28]);
    expect(detailRows(invoices)).toHaveLength(3);
  });

  it("auto delete cocok tanpa beda huruf besar/kecil", () => {
    const r = matchDeleteList(invoices, ["sop/1/viii/xxvi/tra", "TIDAK/ADA"]);
    expect(r.found.map((i) => i.id)).toEqual([0]);
    expect(r.notFound).toEqual(["TIDAK/ADA"]);
  });

  it("ekspor XML bisa dibaca ulang & karakter khusus di-escape", () => {
    const xml = generateCoretaxXml(tin, invoices);
    expect(xml).toContain("<BuyerName>PT A &amp; B</BuyerName>");
    expect(xml).toContain("<AddInfo/>");
    const again = parseCoretaxXml(xml);
    expect(again.invoices.map((i) => i.RefDesc)).toEqual(invoices.map((i) => i.RefDesc));
    expect(again.invoices[0].goods[0].OtherTaxBase).toBe("183.33");
  });

  const dir = "C:/Users/dearmando.manalu_pen/OneDrive/Documents/Web Project/XML CoreTax/";
  const files = [
    ["Faktur_10 Agustus 2026_30 Agustus 2026 (80 xml).xml", 80],
    ["Faktur_19 Agustus 2026_31 Agustus 2026 (79 xml).xml", 79],
  ] as const;

  it.each(files)("file asli %s: jumlah faktur benar dan ekspor identik", (file, count) => {
    if (!existsSync(dir + file)) return; // file contoh hanya ada di mesin pengembang
    const text = readFileSync(dir + file, "utf8");
    const parsed = parseCoretaxXml(text);
    expect(parsed.invoices).toHaveLength(count);
    // Satu-satunya perbedaan yang diizinkan: '&' tidak valid di sumber ditulis sebagai '&amp;'.
    expect(generateCoretaxXml(parsed.tin, parsed.invoices).trimEnd())
      .toBe(escapeStrayAmpersands(text.replace(/\r\n/g, "\n")).trimEnd());
  });
});
