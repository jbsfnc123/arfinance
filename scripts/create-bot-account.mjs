// Membuat (sekali) akun sistem "Bot ERP" untuk automation/erp-bot (Fase 55).
//
//   node --env-file=.env.local scripts/create-bot-account.mjs [--name "Bot ERP"]
//
// Akun sistem: tidak tampil di daftar login & tidak bisa masuk lewat halaman login (system_account), PIN acak,
// akses menu HANYA set.update (Pusat Upload: Aging) + tukar.upload (Upload Jadwal Tukar Faktur, Fase 56)
// + tukar.monitor_sj (Upload Laporan Serah Terima Surat Jalan, Fase 57).
// Mencetak BOT_EMAIL & BOT_PASSWORD untuk automation/erp-bot/.env. Kunci service role tidak perlu ada di PC bot.
// Bila akun sudah ada: hanya mencetak ulang kredensialnya (dan merapikan akses menu).
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({ options: { name: { type: "string", default: "Bot ERP" } } });
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, PIN_AUTH_SECRET: secret } = process.env;
if (!url || !key || !secret) {
  console.error("Butuh NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, dan PIN_AUTH_SECRET di .env.local");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
// Harus sama dengan lib/auth/pin.ts
const passwordFor = (id) => createHmac("sha256", secret).update(id).digest("base64url");

let { data: bot } = await admin.from("profiles").select("id, email").eq("system_account", true).eq("display_name", args.name).maybeSingle();
if (!bot) {
  const { data: role, error: roleError } = await admin.from("roles").select("id").eq("kind", "coll").order("name").limit(1).single();
  if (roleError) throw roleError;
  const id = randomUUID();
  const email = `${id}@pin.arfinance.local`;
  const { error: authError } = await admin.auth.admin.createUser({ id, email, password: passwordFor(id), email_confirm: true, app_metadata: { provisioned: true } });
  if (authError) { console.error("Gagal membuat user auth:", authError.message); process.exit(1); }
  const { error: profileError } = await admin.from("profiles").insert({
    id, email, display_name: args.name, role_id: role.id, division: "ar", system_account: true, chatbot_enabled: false,
  });
  const { error: pinError } = profileError ? { error: profileError }
    : await admin.rpc("admin_set_pin", { p_user: id, p_pin: String(randomInt(100000, 1000000)) });
  if (profileError || pinError) {
    await admin.auth.admin.deleteUser(id);
    console.error("Gagal:", (pinError ?? profileError).message);
    process.exit(1);
  }
  bot = { id, email };
  console.log(`Akun sistem "${args.name}" dibuat (${id}).`);
}

// Akses menu: hanya yang dipakai bot (trigger default role menambahkan menu Collection saat akun dibuat).
const BOT_MENUS = ["set.update", "tukar.upload", "tukar.monitor_sj"];
await admin.from("profile_menus").delete().eq("user_id", bot.id).not("submenu_id", "in", `(${BOT_MENUS.join(",")})`);
await admin.from("profile_menus").upsert(BOT_MENUS.map((submenu_id) => ({ user_id: bot.id, submenu_id })), { onConflict: "user_id,submenu_id" });

console.log("\nIsi automation/erp-bot/.env dengan:");
console.log(`BOT_EMAIL=${bot.email}`);
console.log(`BOT_PASSWORD=${passwordFor(bot.id)}`);
