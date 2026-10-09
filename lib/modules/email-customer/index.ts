// Modul Billing › Email Customer (Fase 60): daftar email Business Partner untuk pengiriman tagihan.
// Empat tab seperti file "Email Customer.xlsx": BP CBD, Group CBD, BP TOP, Group TOP. Tab Group: PIC & email milik
// Payment Group (berlaku untuk semua BP anggotanya). Payment Group / Collection / Marketing yang kosong diisi dari
// database (Aging terkini, cadangan invoice ERP) lewat key BP hasil pencocokan Value.

export type Term = "CBD" | "TOP";
export type Level = "BP" | "Group";
export type EmailGroup = { id: number; term: Term; payment_group: string; pic_ar: string | null; keterangan: string | null; email_note: string | null; updated_at: string };
export type EmailCustomer = {
  id: number; term: Term; level: Level; group_id: number | null; business_partner: string; bp_value: string | null; bp_key: string | null;
  payment_group: string | null; pic_ar: string | null; keterangan: string | null; email_note: string | null; updated_at: string;
};
export type EmailAddress = { customer_id: number | null; group_id: number | null; email: string };
export type BpLookup = { bp_key: string; payment_group: string | null; collection_name: string | null; marketing: string | null; sales_name: string | null; branch: string | null; bp_name: string | null; in_aging: boolean };
export type EmailData = { groups: EmailGroup[]; customers: EmailCustomer[]; emails: EmailAddress[]; lookup: BpLookup[] };

export const TABS = [
  { key: "bp-cbd", label: "BP CBD", term: "CBD", level: "BP" },
  { key: "group-cbd", label: "Group CBD", term: "CBD", level: "Group" },
  { key: "bp-top", label: "BP TOP", term: "TOP", level: "BP" },
  { key: "group-top", label: "Group TOP", term: "TOP", level: "Group" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

// ── Minggu penjualan: dipotong setiap Sabtu (Okt 2026: 1–3, 4–10, 11–17, 18–24, 25–31) ──────────────
export type Week = { key: `w${number}`; start: string; end: string; label: string };
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function monthWeeks(month: string): Week[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const iso = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const out: Week[] = [];
  for (let d = 1; d <= last;) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 6 = Sabtu
    const end = Math.min(last, d + ((6 - dow + 7) % 7));
    out.push({ key: `w${out.length + 1}`, start: iso(d), end: iso(end), label: `${d}${end > d ? `–${end}` : ""} ${MON[m - 1]}` });
    d = end + 1;
  }
  return out;
}

/** Penjualan per minggu untuk satu BP. Sumber data belum ditentukan (tahap berikutnya) → semua "tidak ada". */
export function weeklySales(_bpKey: string | null, weeks: Week[]): boolean[] {
  return weeks.map(() => false);
}

// ── Baris tabel ────────────────────────────────────────────────────────────────────────────────────
export type EmailRow = {
  id: number; group_id: number | null; term: Term; level: Level;
  payment_group: string; pg_from_db: boolean; business_partner: string; bp_value: string; bp_key: string;
  collection: string; marketing: string; sales: string; branch: string;
  pic_ar: string; emails: string; email_note: string; keterangan: string; match: "Cocok" | "Tidak cocok";
  [week: `w${number}`]: string;
};

export function buildRows(data: EmailData, term: Term, level: Level, weeks: Week[]): EmailRow[] {
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  const look = new Map(data.lookup.map((l) => [l.bp_key, l]));
  const byCustomer = new Map<number, string[]>(); const byGroup = new Map<number, string[]>();
  for (const e of data.emails) {
    if (e.customer_id != null) (byCustomer.get(e.customer_id) ?? byCustomer.set(e.customer_id, []).get(e.customer_id)!).push(e.email);
    else if (e.group_id != null) (byGroup.get(e.group_id) ?? byGroup.set(e.group_id, []).get(e.group_id)!).push(e.email);
  }
  const join = (...xs: (string | null | undefined)[]) => xs.filter((x) => x && x.trim()).join(" · ");
  return data.customers.filter((c) => c.term === term && c.level === level).map((c) => {
    const g = c.group_id != null ? groups.get(c.group_id) : undefined;
    const l = c.bp_key ? look.get(c.bp_key) : undefined;
    const manualPg = (g?.payment_group ?? c.payment_group ?? "").trim();
    const sales = weeklySales(c.bp_key, weeks);
    const row: EmailRow = {
      id: c.id, group_id: c.group_id, term: c.term, level: c.level,
      payment_group: manualPg || l?.payment_group || "", pg_from_db: !manualPg && !!l?.payment_group,
      business_partner: c.business_partner, bp_value: c.bp_value ?? "", bp_key: c.bp_key ?? "",
      collection: l?.collection_name ?? "", marketing: l?.marketing ?? "", sales: l?.sales_name ?? "", branch: l?.branch ?? "",
      pic_ar: (g ? g.pic_ar : c.pic_ar) ?? "",
      emails: [...(g ? byGroup.get(g.id) ?? [] : []), ...(byCustomer.get(c.id) ?? [])].join(", "),
      email_note: join(g?.email_note, c.email_note), keterangan: join(g?.keterangan, c.keterangan),
      match: c.bp_key ? "Cocok" : "Tidak cocok",
    };
    weeks.forEach((w, i) => { row[w.key] = sales[i] ? "✓" : "✗"; });
    return row;
  });
}

/** Pecah teks isian email: alamat valid (huruf kecil, unik) + sisa teks sebagai catatan. */
const EMAIL = /[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"'.]+/g;
export function splitEmails(text: string): { emails: string[]; rest: string } {
  const emails = [...new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
  const rest = text.replace(EMAIL, " ").replace(/[,;/]+/g, " ").replace(/\s+/g, " ").trim();
  return { emails, rest };
}
