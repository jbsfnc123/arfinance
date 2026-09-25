// Pilihan dari Pembatalan dan Revisi Faktur/Code.gs (juga dijaga CHECK di database).
export const REQUEST_OPTIONS = ["Revisi Faktur", "Pembatalan Faktur"] as const;

export const REASON_OPTIONS = [
  "HUMAN EROR (DELIVERY)", "HUMAN EROR (INVOICING)", "HUMAN EROR (MARKETING)",
  "HUMAN EROR (FULFILLMENT)", "HUMAN EROR (IT)", "HUMAN EROR (WAREHOUSE)",
  "MISS INFORMATION", "FACTOR EXTERNAL", "REQUEST CUSTOMER",
  "HUMAN EROR (OR)", "HUMAN EROR (MKT ANALIS)",
] as const;

export type InvoiceFields = { invoice_no: string; bp_value: string; invoice_date: string; no_sj: string };

export const EMPTY_INVOICE: InvoiceFields = { invoice_no: "", bp_value: "", invoice_date: "", no_sj: "" };
