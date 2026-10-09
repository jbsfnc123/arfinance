// Impor sekali data awal modul Email Customer (Fase 60) dari "Email Customer.xlsx" (4 sheet: BP CBD, Group CBD,
// BP TOP, Group TOP; kolom Payment Group, Business Partner, Value, PIC AR, Email, Keterangan).
//
//   node --env-file=.env.local scripts/import-email-customer.mjs "<path>/Email Customer.xlsx" [--dry-run]
//
// Baris tanpa Business Partner & duplikat (BP + Value sama dalam satu sheet) dibuang. Sheet Group → satu grup per
// Payment Group (PIC/email/keterangan grup = gabungan isian baris-barisnya) + BP anggotanya. Teks Email dipecah menjadi
// alamat; sisa teks yang bukan alamat (mis. "Kirim ke Adm Sales Surabaya") disimpan sebagai catatan email.
// Key BP (bp_key) diisi sesudahnya di database: private.email_match_key(bp_value). Data file tidak di-commit.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { "dry-run": { type: "boolean" } } });
const file = positionals[0];
if (!file) { console.error("Pemakaian: node --env-file=.env.local scripts/import-email-customer.mjs <file.xlsx> [--dry-run]"); process.exit(1); }
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;

const EMAIL = /[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"'.]+/g;
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export function splitEmail(text) {
  const raw = String(text ?? "");
  const emails = [...new Set((raw.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
  const note = clean(raw.replace(EMAIL, " ").replace(/[,;/]+/g, " "));
  return { emails, note: note || null };
}

const wb = XLSX.read(readFileSync(file), { type: "buffer" });
const sheets = wb.SheetNames.map((name) => {
  const m = /^(BP|Group)\s+(CBD|TOP)$/i.exec(name.trim());
  if (!m) return null;
  const level = m[1].toLowerCase() === "bp" ? "BP" : "Group";
  const term = m[2].toUpperCase();
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true }).slice(1)
    .map((r) => ({ pg: clean(r[0]), bp: clean(r[1]), value: clean(r[2]), pic: clean(r[3]), email: String(r[4] ?? ""), ket: clean(r[5]) }))
    .filter((r) => r.bp);
  return { name, level, term, rows };
}).filter(Boolean);

const groups = []; const customers = []; const report = [];
for (const s of sheets) {
  const seen = new Set(); let dup = 0; let lastPg = "";
  for (const r of s.rows) {
    if (s.level === "Group") lastPg = r.pg || lastPg; // Payment Group kosong = sama dengan baris di atasnya
    const k = `${s.level === "Group" ? lastPg.toLowerCase() : ""}|${r.bp.toLowerCase()}|${r.value.toLowerCase()}`;
    if (seen.has(k)) { dup++; continue; }
    seen.add(k);
    const mail = splitEmail(r.email);
    if (s.level === "Group") {
      if (!lastPg) continue;
      let g = groups.find((x) => x.term === s.term && x.payment_group.toLowerCase() === lastPg.toLowerCase());
      if (!g) groups.push(g = { term: s.term, payment_group: lastPg, pic: new Set(), emails: new Set(), notes: new Set(), ket: new Set() });
      if (r.pic) g.pic.add(r.pic); mail.emails.forEach((e) => g.emails.add(e));
      if (mail.note) g.notes.add(mail.note); if (r.ket) g.ket.add(r.ket);
      customers.push({ term: s.term, level: "Group", group: g, business_partner: r.bp, bp_value: r.value || null, emails: [] });
    } else {
      customers.push({ term: s.term, level: "BP", group: null, business_partner: r.bp, bp_value: r.value || null,
        payment_group: r.pg || null, pic_ar: r.pic || null, keterangan: r.ket || null, email_note: mail.note, emails: mail.emails });
    }
  }
  report.push(`${s.name}: ${s.rows.length} baris berisi · ${dup} duplikat dibuang`);
}
const join = (set) => (set.size ? [...set].join(" · ") : null);
console.log(report.join("\n"));
console.log(`Grup: ${groups.length} · BP: ${customers.length} (BP ${customers.filter((c) => c.level === "BP").length}, anggota grup ${customers.filter((c) => c.level === "Group").length}) · alamat email: ${customers.reduce((a, c) => a + c.emails.length, 0) + groups.reduce((a, g) => a + g.emails.size, 0)}`);
if (args["dry-run"]) { console.log("DRY RUN — tidak ada yang disimpan."); process.exit(0); }

if (!url || !key) { console.error("Butuh NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY di .env.local"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const { count } = await db.from("email_customers").select("id", { count: "exact", head: true });
if (count) { console.error(`Tabel email_customers sudah berisi ${count} baris — impor dibatalkan (hanya untuk data awal).`); process.exit(1); }
const must = (res, what) => { if (res.error) { console.error(`Gagal ${what}: ${res.error.message}`); process.exit(1); } return res.data; };

for (const g of groups) {
  const row = must(await db.from("email_groups").insert({ term: g.term, payment_group: g.payment_group, pic_ar: join(g.pic),
    keterangan: join(g.ket), email_note: join(g.notes) }).select("id").single(), `grup ${g.payment_group}`);
  g.id = row.id;
  if (g.emails.size) must(await db.from("email_addresses").insert([...g.emails].map((email, i) => ({ group_id: g.id, email, sort: i + 1 }))), `email grup ${g.payment_group}`);
}
for (const c of customers) {
  const row = must(await db.from("email_customers").insert({ term: c.term, level: c.level, group_id: c.group?.id ?? null,
    business_partner: c.business_partner, bp_value: c.bp_value, payment_group: c.payment_group ?? null, pic_ar: c.pic_ar ?? null,
    keterangan: c.keterangan ?? null, email_note: c.email_note ?? null }).select("id").single(), `BP ${c.business_partner}`);
  if (c.emails.length) must(await db.from("email_addresses").insert(c.emails.map((email, i) => ({ customer_id: row.id, email, sort: i + 1 }))), `email BP ${c.business_partner}`);
}
console.log("Impor selesai. Jalankan pencocokan key BP: update public.email_customers set bp_key = private.email_match_key(bp_value) where bp_key is null;");
