import { rupiah } from "@/lib/format";
import { downloadXlsx } from "@/lib/xlsx-client";
import { cellText, COLUMN_DEFS, groupByBp, type CollectionRow, type ColumnKey } from "@/lib/modules/collection/view-model";

// Port print & export Excel dari Aplikasi Utama/Script.html.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function labelRow(cols: { key: ColumnKey; money?: boolean }[], label: string, amount: number, cls: string) {
  const idx = cols.findIndex((c) => c.money);
  const money = `<td class="num">${esc(rupiah(amount))}</td>`;
  if (idx < 0) return `<tr class="${cls}"><td colspan="${cols.length}">${esc(label)} ${esc(rupiah(amount))}</td></tr>`;
  if (idx === 0) {
    const rest = cols.length - 1;
    return `<tr class="${cls}">${money}${rest ? `<td colspan="${rest}">&lt;- ${esc(label)}</td>` : ""}</tr>`;
  }
  const after = cols.length - idx - 1;
  return `<tr class="${cls}"><td colspan="${idx}" class="lbl">${esc(label)}</td>${money}${after ? `<td colspan="${after}"></td>` : ""}</tr>`;
}

export function printRows(collection: string, rows: CollectionRow[], columns: ColumnKey[]) {
  const cols = COLUMN_DEFS.filter((c) => columns.includes(c.key));
  const groups = groupByBp(rows);
  const multi = groups.length > 1;
  const total = rows.reduce((s, r) => s + r.open_amt, 0);

  const body = groups.map((g) => {
    const head = multi ? `<tr class="bp"><td colspan="${cols.length}">${esc(g.bp || "(Tanpa BP)")}</td></tr>` : "";
    const lines = g.items.map((r) =>
      `<tr>${cols.map((c) => `<td class="${c.money ? "num" : ""}">${esc(c.money ? rupiah(r.open_amt) : cellText(r, c.key))}</td>`).join("")}</tr>`,
    ).join("");
    return head + lines + (multi ? labelRow(cols, `Subtotal ${g.bp}:`, g.subtotal, "sub") : "");
  }).join("");

  const title = `Tagihan_${collection}_${stamp()}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4 landscape; margin: 15mm; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
h1 { font-size: 16px; margin: 0 0 4px; } p { margin: 0 0 12px; color: #444; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
th { background: #f1f3f4; } .num { text-align: right; white-space: nowrap; }
.bp td { background: #e6f2ff; font-weight: bold; } .sub td, .total td { font-weight: bold; }
.lbl { text-align: right; } .total td { background: #f1f3f4; }
</style></head><body>
<h1>DAFTAR TAGIHAN - ${esc(collection.toUpperCase())}</h1>
<p>Tanggal Cetak: ${esc(new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }))} | Jumlah Invoice: ${rows.length}</p>
<table><thead><tr>${cols.map((c) => `<th class="${c.money ? "num" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
<tbody>${body}${labelRow(cols, "TOTAL KESELURUHAN:", total, "total")}</tbody></table>
<script>window.onload = () => { window.print(); };</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export async function exportExcel(collection: string, rows: CollectionRow[], columns: ColumnKey[]) {
  const cols = COLUMN_DEFS.filter((c) => columns.includes(c.key));
  const idx = cols.findIndex((c) => c.money);
  const groups = groupByBp(rows);
  const multi = groups.length > 1;

  const labelLine = (label: string, amount: number) => {
    const line: unknown[] = new Array(Math.max(cols.length, 2)).fill("");
    if (idx > 0) { line[idx - 1] = label; line[idx] = amount; }
    else if (idx === 0) { line[0] = amount; line[1] = label; }
    else { line[0] = label; line[1] = amount; }
    return line;
  };

  const aoa: unknown[][] = [
    ["DAFTAR TAGIHAN", collection],
    ["Tanggal Export", new Date().toLocaleDateString("id-ID")],
    [],
  ];
  for (const g of groups) {
    if (multi) aoa.push(["Business Partner:", g.bp]);
    aoa.push(cols.map((c) => c.label));
    for (const r of g.items) aoa.push(cols.map((c) => (c.money ? r.open_amt : cellText(r, c.key))));
    aoa.push(labelLine("Subtotal:", g.subtotal));
    aoa.push([]);
  }
  aoa.push(labelLine("GRAND TOTAL:", rows.reduce((s, r) => s + r.open_amt, 0)));

  await downloadXlsx(`Tagihan_${collection}_${stamp()}.xlsx`, "Tagihan", aoa);
}
