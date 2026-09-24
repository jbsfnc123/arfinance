// Membuat akun PIN langsung lewat Admin API. Dipakai untuk akun Super Admin pertama
// (sebelum ada yang bisa login ke halaman Akun & PIN).
//
//   node --env-file=.env.local scripts/create-account.mjs --name "Super Admin" --role "Super Admin" --pin 123456
//
// PIN hanya lewat argumen, tidak pernah ditulis ke file.
import { createHmac, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    role: { type: "string" },
    pin: { type: "string" },
    collection: { type: "string" },
  },
});

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, PIN_AUTH_SECRET: secret } = process.env;
if (!url || !key || !secret) {
  console.error("Butuh NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, dan PIN_AUTH_SECRET di .env.local");
  process.exit(1);
}
if (!args.name || !args.role || !/^\d{6}$/.test(args.pin ?? "")) {
  console.error('Pemakaian: --name "Nama" --role "Nama Role" --pin 6digit [--collection "Collection Name"]');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: role, error: roleError } = await admin.from("roles").select("id").eq("name", args.role).single();
if (roleError) {
  console.error(`Role "${args.role}" tidak ditemukan.`);
  process.exit(1);
}

// Harus sama dengan lib/auth/pin.ts
const id = randomUUID();
const email = `${id}@pin.arfinance.local`;
const password = createHmac("sha256", secret).update(id).digest("base64url");

const { error: authError } = await admin.auth.admin.createUser({
  id,
  email,
  password,
  email_confirm: true,
  app_metadata: { provisioned: true },
});
if (authError) {
  console.error("Gagal membuat user auth:", authError.message);
  process.exit(1);
}

const { error: profileError } = await admin.from("profiles").insert({
  id,
  email,
  display_name: args.name,
  role_id: role.id,
  collection_name: args.collection ?? null,
});
const { error: pinError } = profileError
  ? { error: profileError }
  : await admin.rpc("admin_set_pin", { p_user: id, p_pin: args.pin });

if (profileError || pinError) {
  await admin.auth.admin.deleteUser(id);
  console.error("Gagal:", (pinError ?? profileError).message);
  process.exit(1);
}

console.log(`Akun "${args.name}" (${args.role}) dibuat. ID: ${id}`);
