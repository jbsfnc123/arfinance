"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/session";
import { derivePassword, isValidPin, syntheticEmail } from "@/lib/auth/pin";
import { err, ok, type ActionResult } from "../ui";
import { isDivision } from "@/lib/menu";

const PATH = "/finance/akun";
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

async function roleKind(roleId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("kind").eq("id", roleId).single();
  return data?.kind ?? null;
}

export async function createAccount(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const name = str(fd, "display_name");
  const roleId = str(fd, "role_id");
  const collection = str(fd, "collection_name") || null;
  const division = str(fd, "division");
  const pin = str(fd, "pin");
  if (!isDivision(division)) return err("Pilih divisi AR, AP, atau AR + AP.");

  if (!name) return err("Nama wajib diisi.");
  if (!isValidPin(pin)) return err("PIN harus 6 digit angka.");
  const kind = await roleKind(roleId);
  if (!kind) return err("Role tidak ditemukan.");
  if (kind === "coll" && !collection) return err("Akun Collection wajib punya Collection Name.");

  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const { error: authError } = await admin.auth.admin.createUser({
    id,
    email: syntheticEmail(id),
    password: derivePassword(id),
    email_confirm: true,
    app_metadata: { provisioned: true },
  });
  if (authError) return err(`Gagal membuat akun: ${authError.message}`);

  const { error: profileError } = await admin.from("profiles").insert({
    id,
    email: syntheticEmail(id),
    display_name: name,
    role_id: roleId,
    collection_name: collection,
    division,
  });
  const { error: pinError } = profileError
    ? { error: profileError }
    : await admin.rpc("admin_set_pin", { p_user: id, p_pin: pin });

  if (profileError || pinError) {
    // Batalkan: profil ikut terhapus lewat ON DELETE CASCADE.
    await admin.auth.admin.deleteUser(id);
    return err((pinError ?? profileError)!.message);
  }

  revalidatePath(PATH);
  return ok(`Akun "${name}" dibuat.`);
}

export async function resetPin(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = str(fd, "id");
  const pin = str(fd, "pin");
  if (!isValidPin(pin)) return err("PIN harus 6 digit angka.");

  const { error } = await createAdminClient().rpc("admin_set_pin", { p_user: id, p_pin: pin });
  if (error) return err(error.message);
  return ok("PIN diperbarui.");
}

export async function updateAccount(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { profile: me } = await requireSuperAdmin();
  const id = str(fd, "id");
  const name = str(fd, "display_name");
  const roleId = str(fd, "role_id");
  const collection = str(fd, "collection_name") || null;
  const division = str(fd, "division");
  const active = fd.get("active") === "on";
  if (!isDivision(division)) return err("Pilih divisi AR, AP, atau AR + AP.");

  if (!name) return err("Nama wajib diisi.");
  const kind = await roleKind(roleId);
  if (!kind) return err("Role tidak ditemukan.");
  if (kind === "coll" && !collection) return err("Akun Collection wajib punya Collection Name.");
  // Cegah Super Admin mengunci dirinya sendiri.
  if (id === me.id && (!active || kind !== "sa")) {
    return err("Anda tidak bisa menonaktifkan atau menurunkan role akun Anda sendiri.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name, role_id: roleId, collection_name: collection, division, active })
    .eq("id", id);
  if (error) return err(error.message);

  revalidatePath(PATH);
  return ok("Akun disimpan.");
}
