import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { layersFrom, type ManualTables, type MetricRow, type Saved, type Series, type Texts } from "@/lib/modules/deck/assemble";

// Presentasi (AR Management Deck) tidak menyimpan salinan data mentah lagi. Agregat per bulan
// (seri + detail BP) dihitung ulang dari tabel inti dengan PARSER LAMA (public/presentasi-app/
// js/data/parse.js) supaya angkanya identik dengan import file langsung. Tabel sumber disusun
// kembali menjadi baris ber-header seperti laporan ERP aslinya.

type Parsed = { months: string[]; series?: Record<string, Record<string, number | null>>; bp?: Record<string, unknown[][]>; master?: Record<string, unknown[]>; stats?: Record<string, unknown> };
export type LegacyParser = {
  parseInvoice_: (v: unknown[][]) => Parsed;
  parsePayment_: (v: unknown[][]) => Parsed;
  parseAging_: (v: unknown[][]) => Parsed;
  parseBpMaster_: (v: unknown[][]) => Parsed;
};
type Row = Record<string, unknown>;

export const INVOICE_HEAD = ["BP Key", "BP Name", "BP Group", "Marketing Group", "Branch", "Payment Term",
  "Invoice No.", "Invoice Amount", "Invoice Date", "Due Date", "Payment Date"];
export const PAYMENT_HEAD = ["BP Key", "BP Name", "BP Group", "Marketing Group", "Payment Term", "Invoice No.",
  "Invoice Date", "Due Date", "Payment Document", "Payment Amount", "Payment Date"];
export const AGING_HEAD = ["Payment Group", "Marketing", "Collection Name", "Sales Name", "Value", "Business Partner",
  "Invoice Date", "Due Date", "Open Amt", "Branch", "Follow Up"];
export const BP_HEAD = ["Search Key", "Name", "Payment Group", "PIC AR", "Sales / Agent", "Payment Term", "Marketing Groups",
  "TypeOfCustomer", "Credit Limit", "Credit Status", "Sales Region", "Branch", "Description", "First Sale", "LastSale", "Customer"];

const s = (v: unknown) => (v === null || v === undefined ? "" : v);
const n = (v: unknown) => (v === null || v === undefined || v === "" ? "" : Number(v));

export const invoiceAoa = (rows: Row[]) => [INVOICE_HEAD, ...rows.map((r) => [s(r.bp_key), s(r.bp_name), s(r.bp_group),
  s(r.marketing_group), s(r.branch), s(r.payment_term), r.invoice_no, n(r.amount), s(r.invoice_date), s(r.due_date), s(r.last_payment_date)])];
export const paymentAoa = (rows: Row[]) => [PAYMENT_HEAD, ...rows.map((r) => [s(r.bp_key), s(r.bp_name), s(r.bp_group),
  s(r.marketing_group), s(r.payment_term), r.invoice_no, s(r.invoice_date), s(r.due_date), s(r.payment_doc), n(r.payment_amount), s(r.payment_date)])];
export const agingAoa = (rows: Row[]) => [AGING_HEAD, ...rows.map((r) => [s(r.payment_group), s(r.marketing), s(r.collection_name),
  s(r.sales_name), s(r.bp_key), s(r.business_partner), s(r.invoice_date), s(r.due_date), n(r.open_amt), s(r.branch), s(r.follow_up)])];
export const bpAoa = (rows: Row[]) => [BP_HEAD, ...rows.map((r) => [r.search_key, s(r.name), s(r.payment_group), s(r.pic_ar),
  s(r.sales_agent), s(r.payment_term), s(r.marketing_group), s(r.customer_type), n(r.credit_limit), s(r.credit_status),
  s(r.sales_region), s(r.branch), s(r.description), s(r.first_sale), s(r.last_sale), s(r.customer)])];

const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

async function fetchAll(q: () => { range: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: unknown }> }) {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Hitung ulang satu (jenis, bulan) dari tabel inti → baris deck_derived.
export async function recompute(supabase: SupabaseClient<Database>, P: LegacyParser, kind: string, month: string) {
  const start = `${month}-01`, end = month === "-" ? "" : monthEnd(month);
  let res: Parsed | null = null;
  if (kind === "invoice") {
    const rows = await fetchAll(() => supabase.from("v_deck_invoices").select("*").gte("invoice_date", start).lte("invoice_date", end).order("invoice_no") as never);
    if (rows.length) res = P.parseInvoice_(invoiceAoa(rows));
  } else if (kind === "payment") {
    const rows = await fetchAll(() => supabase.from("v_deck_payments").select("*").gte("payment_date", start).lte("payment_date", end).order("invoice_no").order("payment_doc") as never);
    if (rows.length) res = P.parsePayment_(paymentAoa(rows));
  } else if (kind === "aging") {
    const { data: snap } = await supabase.from("ar_aging_snapshots").select("id").eq("month", month).maybeSingle();
    const rows = snap ? await fetchAll(() => supabase.from("ar_aging_lines").select("*").eq("snapshot_id", snap.id).order("line_no") as never) : [];
    if (rows.length) res = P.parseAging_(agingAoa(rows));
  } else if (kind === "bpmaster") {
    const rows = await fetchAll(() => supabase.from("business_partners").select("*").order("search_key") as never);
    if (rows.length) res = P.parseBpMaster_(bpAoa(rows));
  }
  if (!res) {
    await supabase.from("deck_derived").delete().eq("kind", kind).eq("month", month);
    return;
  }
  const bp = kind === "bpmaster" ? res.master ?? {} : (res.bp ?? {})[month] ?? [];
  const { error } = await supabase.from("deck_derived").upsert({
    kind, month, series: (res.series ?? {}) as Json, bp: bp as Json, stats: (res.stats ?? {}) as Json, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// Proses semua bulan yang ditandai dirty oleh commit upload.
// Bulan yang sudah DITUTUP (snapshot statis) tidak dihitung ulang — upload ulang tidak mengubahnya.
export async function recomputeDirty(supabase: SupabaseClient<Database>, P: LegacyParser) {
  const [{ data, error }, { data: periods }] = await Promise.all([
    supabase.from("deck_dirty").select("kind, month, at"),
    supabase.from("deck_periods").select("month").eq("status", "closed"),
  ]);
  if (error) throw error;
  const closed = new Set((periods ?? []).map((x) => x.month));
  for (const d of data ?? []) {
    if (!closed.has(d.month)) await recompute(supabase, P, d.kind, d.month);
    await supabase.from("deck_dirty").delete().eq("kind", d.kind).eq("month", d.month).lte("at", d.at);
  }
  return (data ?? []).length;
}

type DeckState = Record<string, unknown> & { layers?: Record<string, unknown>; config?: { month?: string; week?: number } };

async function selectAll<T>(q: () => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }> }) {
  return fetchAll(q as never) as unknown as Promise<T[]>;
}

// Susun state deck dari tabel per bulan (Fase 23):
//   bulan TERBUKA  → agregat mentah terkini (deck_derived) + Collection otomatis (autoFor)
//   bulan TERTUTUP → snapshot beku (deck_metrics raw/auto + deck_bp_snapshot)
//   manual / excel / tabel manual / teks → tabel masing-masing; config & label → deck_state
export async function assembleState(
  supabase: SupabaseClient<Database>, base: DeckState | null, emptyState: () => DeckState,
  auto: Series, // Collection otomatis per bulan (dari Target & ERP); hanya dipakai untuk bulan terbuka
) {
  const st: DeckState = { ...emptyState(), ...(base ?? {}) };
  const [periods, metrics, rows, texts, snaps, derived] = await Promise.all([
    selectAll<{ month: string; status: string }>(() => supabase.from("deck_periods").select("month, status") as never),
    selectAll<MetricRow>(() => supabase.from("deck_metrics").select("month, key, source, value").order("month") as never),
    selectAll<{ month: string; table_name: string; row: Record<string, unknown> }>(() => supabase.from("deck_manual_rows").select("month, table_name, row").order("month").order("table_name").order("sort") as never),
    selectAll<{ month: string; slide_key: string; text: string }>(() => supabase.from("deck_texts").select("month, slide_key, text") as never),
    selectAll<{ month: string; kind: string; bp: unknown }>(() => supabase.from("deck_bp_snapshot").select("month, kind, bp") as never),
    selectAll<{ kind: string; month: string; series: unknown; bp: unknown }>(() => supabase.from("deck_derived").select("kind, month, series, bp").order("month") as never),
  ]);
  const closed = new Set(periods.filter((x) => x.status === "closed").map((x) => x.month));

  const derivedOpen: Series = {};
  const bags: Record<string, Record<string, unknown>> = { invoice: {}, payment: {}, aging: {} };
  let master: Record<string, unknown> = {};
  for (const d of derived) {
    if (d.kind === "bpmaster") { master = (d.bp ?? {}) as Record<string, unknown>; continue; }
    if (closed.has(d.month)) continue;
    for (const [k, byMonth] of Object.entries((d.series ?? {}) as Series)) {
      for (const [m, v] of Object.entries(byMonth)) if (!closed.has(m)) (derivedOpen[k] ??= {})[m] = v;
    }
    bags[d.kind][d.month] = d.bp;
  }
  for (const sn of snaps) if (sn.kind !== "bpmaster") bags[sn.kind][sn.month] = sn.bp;

  const autoOpen: Series = {};
  for (const [k, byM] of Object.entries(auto)) for (const [m, v] of Object.entries(byM)) if (!closed.has(m)) (autoOpen[k] ??= {})[m] = v;
  const layers = layersFrom(metrics.filter((m) => m.source !== "auto" || closed.has(m.month)), derivedOpen, autoOpen);
  st.layers = { ...(st.layers ?? {}), ...layers };
  st.bpSales = bags.invoice;
  st.payments = bags.payment;
  st.bpAging = bags.aging;
  st.bpMaster = master;
  st.bpMasterInfo = Object.keys(master).length ? { file: "Database", at: null, count: Object.keys(master).length } : null;

  const manual: ManualTables = {};
  for (const r of rows) (manual[r.table_name] ??= []).push({ ...r.row, Bulan: r.month });
  st.manual = manual;
  const tx: Texts = {};
  for (const t of texts) (tx[t.month] ??= {})[t.slide_key] = t.text;
  st.texts = tx;
  st.closedMonths = [...closed].sort();
  return st;
}

// Bagian yang dibandingkan saat menyimpan (lihat diffSaved).
export function savedPart(st: DeckState): Saved {
  const layers = (st.layers ?? {}) as Record<string, Series>;
  return {
    manual: structuredClone(layers.manual ?? {}), excel: structuredClone(layers.excel ?? {}),
    tables: structuredClone((st.manual ?? {}) as ManualTables), texts: structuredClone((st.texts ?? {}) as Texts),
  };
}

// deck_state kini hanya konfigurasi, label seri, dan riwayat impor.
export function persistable(st: DeckState) {
  return { version: st.version ?? 2, config: st.config ?? {}, labels: st.labels ?? {}, imports: st.imports ?? [] };
}
