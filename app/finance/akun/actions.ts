"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/session";
import { derivePassword, isValidPin, syntheticEmail } from "@/lib/auth/pin";
import { err, ok, type ActionResult } from "../ui";
import { ACL_MENU_IDS, isDivision } from "@/lib/menu";

const PATH = "/finance/akun";
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

// Ganti seluruh menu akun (hapus lalu isi ulang). Super Admin tidak perlu entri (semua menu).
async function replaceAccountMenus(userId: string, menus: string[]) {
  const supabase = await createClient();
  const { error: delError } = await supabase.from("profile_menus").delete().eq("user_id", userId);
  if (delError) return delError.message;
  if (menus.length === 0) return null;
  const { error } = await supabase.from("profile_menus").insert(menus.map((submenu_id) => ({ user_id: userId, submenu_id })));
  return error?.message ?? null;
}

async function roleDefaultMenus(roleId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("role_menus").select("submenu_id").eq("role_id", roleId);
  return (data ?? []).map((m) => m.submenu_id).filter((m) => ACL_MENU_IDS.has(m));
}

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
  const pinOptional = fd.get("pin_optional") === "on";
  if (!isDivision(division)) return err("Pilih divisi AR, AP, atau AR + AP.");

  if (!name) return err("Nama wajib diisi.");
  // PIN boleh kosong hanya untuk akun "Login tanpa PIN".
  if (pin ? !isValidPin(pin) : !pinOptional) return err("PIN harus 6 digit angka.");
  const kind = await roleKind(roleId);
  if (!kind) return err("Role tidak ditemukan.");
  if (kind === "sa" && pinOptional) return err("Akun Super Admin wajib memakai PIN.");

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
    pin_optional: pinOptional,
  });
  const { error: pinError } = profileError || !pin
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
  const pinOptional = fd.get("pin_optional") === "on";
  if (!isDivision(division)) return err("Pilih divisi AR, AP, atau AR + AP.");

  if (!name) return err("Nama wajib diisi.");
  const kind = await roleKind(roleId);
  if (!kind) return err("Role tidak ditemukan.");
  if (kind === "sa" && pinOptional) return err("Akun Super Admin wajib memakai PIN.");
  // Cegah Super Admin mengunci dirinya sendiri.
  if (id === me.id && (!active || kind !== "sa")) {
    return err("Anda tidak bisa menonaktifkan atau menurunkan role akun Anda sendiri.");
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("role_id").eq("id", id).single();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name, role_id: roleId, collection_name: collection, division, active, pin_optional: pinOptional })
    .eq("id", id);
  if (error) return err(error.message);

  // Role diganti + dicentang "Ganti akses menu dengan default role baru" → menu akun = default role baru.
  const roleChanged = !!before && before.role_id !== roleId;
  if (roleChanged && fd.get("reset_menus") === "on") {
    const menuError = await replaceAccountMenus(id, await roleDefaultMenus(roleId));
    if (menuError) return err(`Akun disimpan, tetapi akses menu gagal diganti: ${menuError}`);
    revalidatePath(PATH);
    return ok("Akun disimpan; akses menu diganti dengan default role baru.");
  }

  revalidatePath(PATH);
  return ok("Akun disimpan.");
}

// Akses menu per akun (Super Admin). "Samakan dengan default role" = isi dengan menu default role akun.
export async function saveAccountMenus(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = str(fd, "id");
  const supabase = await createClient();
  const { data: prof } = await supabase.from("profiles").select("role_id, role:roles(kind)").eq("id", id).single();
  if (!prof) return err("Akun tidak ditemukan.");
  if ((prof.role as { kind: string } | null)?.kind === "sa") return err("Super Admin otomatis melihat semua menu.");

  const menus = fd.get("use_default") === "1"
    ? await roleDefaultMenus(prof.role_id)
    : [...new Set(fd.getAll("menu").map(String))].filter((m) => ACL_MENU_IDS.has(m));
  const menuError = await replaceAccountMenus(id, menus);
  if (menuError) return err(menuError);

  revalidatePath(PATH);
  return ok(fd.get("use_default") === "1" ? `Disamakan dengan default role (${menus.length} menu).` : `${menus.length} menu disimpan.`);
}
