import { fmtDate, rupiah } from "@/lib/format";

// Port buildMessage / normalizePhone dari Aplikasi Utama/Script.html.

export type WaTemplate = { header: string; footer: string };

export const DEFAULT_WA_TEMPLATE: WaTemplate = {
  header: "Halo, saya dari *PENGUIN Trading* ingin memberitahukan rincian tagihan Anda :",
  footer:
    "Mohon konfirmasi pembayaran anda dengan membalas pesan ini atau melalui email ar@penguin.id\nTerimakasih,\n\n*{{collection}}*",
};

// Urutan prioritas lama: override perangkat (localStorage) → template server → bawaan.
// Nilai kosong dari server berarti "pakai bawaan" (tombol Reset Default menyimpan string kosong).
export function effectiveTemplate(device: Partial<WaTemplate> | null, server: Partial<WaTemplate> | null): WaTemplate {
  return {
    header: device?.header ?? (server?.header || DEFAULT_WA_TEMPLATE.header),
    footer: device?.footer ?? (server?.footer || DEFAULT_WA_TEMPLATE.footer),
  };
}

export type WaLine = { invoice_no: string; due_date: string | null; open_amt: number };

export function buildWaMessage(lines: WaLine[], collection: string, template: WaTemplate) {
  const total = lines.reduce((sum, l) => sum + (Number(l.open_amt) || 0), 0);
  const resolve = (s: string) =>
    s.replace(/\{\{collection\}\}/g, collection).replace(/\{\{total\}\}/g, rupiah(total));
  const body = lines.map((l) => `${l.invoice_no} | Jatuh Tempo ${fmtDate(l.due_date)} | ${rupiah(l.open_amt)}`);
  return [resolve(template.header), "", body.join("\n"), "", `*Total Tagihan ${rupiah(total)}*`, "", resolve(template.footer)].join("\n");
}

// 0812… → 62812…, 812… → 62812…, 62812… tetap.
export function normalizePhone(raw: string) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

export function waLink(phone: string, message: string) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
