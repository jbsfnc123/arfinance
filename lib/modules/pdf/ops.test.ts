import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  applyOverlays, compressLossless, imagePageSize, imagesToPdf, lastToFirstOrder, mergePages, moveLastPageToFirst,
  overlayToPdfRect, uniqueNames, withSuffix, type ImageAsset,
} from "./ops";

// PNG 1×1 (dimensi "asli" diatur lewat metadata asset agar hitungan rasio bisa dites).
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const img = (width: number, height: number): ImageAsset => ({ name: "f.png", bytes: PNG, mime: "image/png", width, height });

// PDF uji: halaman ke-i berlebar 100+i agar urutan bisa dikenali.
async function makePdf(n: number) {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([100 + i, 200]);
  return d.save();
}
const widths = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => p.getWidth());

describe("PDF Editor — operasi", () => {
  it("halaman terakhir pindah ke depan; 1 halaman tidak berubah", async () => {
    const r = await moveLastPageToFirst(await makePdf(4));
    expect(r.order).toEqual([3, 0, 1, 2]);
    expect(await widths(r.bytes)).toEqual([103, 100, 101, 102]);
    expect((await moveLastPageToFirst(await makePdf(1))).changed).toBe(false);
    expect(lastToFirstOrder(3)).toEqual([2, 0, 1]);
  });

  it("posisi tempel gambar → koordinat PDF (titik asal kiri-bawah)", () => {
    expect(overlayToPdfRect({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 }, 200, 400)).toEqual({ x: 20, y: 220, width: 100, height: 100 });
  });

  it("tempel gambar hanya menambah gambar, jumlah halaman tetap", async () => {
    const out = await applyOverlays(await makePdf(2), { 1: [{ id: "a", asset: img(10, 10), x: 0, y: 0, w: 0.5, h: 0.5 }] });
    expect(await widths(out)).toEqual([100, 101]);
  });

  it("gabung: urutan, rotasi halaman PDF, foto di halaman A4", async () => {
    const a = await makePdf(2);
    const out = await mergePages([
      { kind: "doc", docId: "A", page: 1, rotation: 90 },
      { kind: "image", asset: img(300, 200) },
      { kind: "doc", docId: "A", page: 0, rotation: 0 },
    ], new Map([["A", a]]), "a4");
    const pages = (await PDFDocument.load(out)).getPages();
    expect(pages.map((p) => Math.round(p.getWidth()))).toEqual([101, 842, 100]); // foto landscape → A4 mendatar
    expect(pages[0].getRotation().angle).toBe(90);
  });

  it("ukuran halaman foto: ikut foto / A4 / orientasi / margin", () => {
    expect(imagePageSize({ width: 400, height: 200 }, "auto", "auto", 0)).toEqual([842, 421]);
    expect(imagePageSize({ width: 400, height: 200 }, "auto", "auto", 18)).toEqual([878, 457]);
    expect(imagePageSize({ width: 400, height: 200 }, "a4", "auto")).toEqual([841.89, 595.28]);
    expect(imagePageSize({ width: 400, height: 200 }, "letter", "portrait")).toEqual([612, 792]);
  });

  it("gambar ke PDF: satu foto satu halaman", async () => {
    const out = await imagesToPdf([img(100, 200), img(200, 100)], { paper: "a4", orient: "auto", margin: "small" });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("kompres aman menghasilkan PDF valid dengan halaman sama", async () => {
    expect(await widths(await compressLossless(await makePdf(3)))).toEqual([100, 101, 102]);
  });

  it("nama file", () => {
    expect(withSuffix("laporan.pdf", "-kompres")).toBe("laporan-kompres.pdf");
    expect(uniqueNames(["a.pdf", "b.pdf", "A.pdf"])).toEqual(["a.pdf", "b.pdf", "A-2.pdf"]);
  });
});
