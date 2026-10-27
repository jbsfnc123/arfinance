// Filter & centang per filter untuk daftar Upload Faktur (Fase 70b). Fungsi murni: dipakai UI, diuji vitest.
import type { FakturItem } from "./split";

export type StatusGroup = "ready" | "not_found" | "dry" | "failed" | "uploaded" | "filled";
export const STATUS_GROUPS: { id: StatusGroup; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "not_found", label: "Not Found" },
  { id: "dry", label: "Uji coba" },
  { id: "failed", label: "Gagal / perlu cek" },
  { id: "uploaded", label: "Uploaded" },
  { id: "filled", label: "No Invoice Terisi" },
];

export function statusGroup(s: string): StatusGroup {
  if (s.startsWith("Uploaded")) return "uploaded";
  if (s.startsWith("No Invoice Terisi")) return "filled";
  if (s.startsWith("Not Found in Draft")) return "not_found";
  if (s.includes("(uji coba)")) return "dry";
  if (s === "Ready") return "ready";
  return "failed";
}

export type FakturFilter = { q: string; status: StatusGroup | ""; po: "" | "yes" | "no"; excel: "" | "yes" | "no" };
export const EMPTY_FILTER: FakturFilter = { q: "", status: "", po: "", excel: "" };
export const isFiltered = (f: FakturFilter) => !!(f.q.trim() || f.status || f.po || f.excel);

// Sheet Invoice+FP (FakturItem) dan sheet Invoice (InvoiceRow, tanpa No Faktur / tanda Excel PO).
type Row = Pick<FakturItem, "invoice" | "status" | "checked" | "no_po" | "no_sj"> & { faktur?: string; in_po?: boolean };

export function filterItems<T extends Row>(items: T[], f: FakturFilter): T[] {
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    if (f.status && statusGroup(i.status) !== f.status) return false;
    const hasPo = !!i.no_po?.trim();
    if (f.po === "yes" && !hasPo) return false;
    if (f.po === "no" && hasPo) return false;
    if (f.excel === "yes" && !i.in_po) return false;
    if (f.excel === "no" && i.in_po) return false;
    if (!words.length) return true;
    const hay = [i.invoice, i.faktur, i.no_po, i.no_sj, i.status].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Daftar invoice tercentang sesudah operasi pada baris yang tampil. add/remove menjaga centang di luar filter; only = hanya yang tampil. */
export function checkedAfter(items: Row[], visible: Row[], op: "add" | "remove" | "only"): string[] {
  const vis = new Set(visible.map((i) => i.invoice));
  return items.filter((i) => (op === "only" ? vis.has(i.invoice) : op === "add" ? i.checked || vis.has(i.invoice) : i.checked && !vis.has(i.invoice)))
    .map((i) => i.invoice);
}

/** Jumlah per kategori status (untuk label pilihan filter). */
export const statusCounts = (items: Row[]) =>
  items.reduce((m, i) => ({ ...m, [statusGroup(i.status)]: (m[statusGroup(i.status)] ?? 0) + 1 }), {} as Partial<Record<StatusGroup, number>>);

/** Nama berkas unduhan = No Faktur Pajak (karakter ilegal Windows dibuang). */
export function downloadName(faktur: string | undefined, fallback: string) {
  const base = (faktur ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").trim() || fallback.replace(/\.pdf$/i, "");
  return `${base}.pdf`;
}

/** Header Content-Disposition (ASCII + filename* UTF-8). */
export const contentDisposition = (name: string, attachment = false) =>
  `${attachment ? "attachment" : "inline"}; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
