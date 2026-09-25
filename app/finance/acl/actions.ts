"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/session";
import { MENU_REGISTRY } from "@/lib/menu";
import { err, ok, type ActionResult } from "../ui";

const PATH = "/finance/acl";
const KINDS = ["sa", "ctrl", "coll", "kurir"];
const MENU_IDS = new Set(MENU_REGISTRY.flatMap((g) => g.children.map((c) => c.id)));
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function createRole(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const name = str(fd, "name");
  const kind = str(fd, "kind");
  if (!name) return err("Nama role wajib diisi.");
  if (!KINDS.includes(kind)) return err("Jenis role tidak valid.");

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({ name, kind });
  if (error) return err(error.code === "23505" ? "Nama role sudah ada." : error.message);

  revalidatePath(PATH);
  return ok(`Role "${name}" dibuat.`);
}

export async function updateRole(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { role: myRole } = await requireSuperAdmin();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const kind = str(fd, "kind");
  if (!name) return err("Nama role wajib diisi.");
  if (!KINDS.includes(kind)) return err("Jenis role tidak valid.");
  if (id === myRole.id && kind !== "sa") {
    return err("Role yang sedang Anda pakai harus tetap Super Admin.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("roles").update({ name, kind }).eq("id", id);
  if (error) return err(error.code === "23505" ? "Nama role sudah ada." : error.message);

  revalidatePath(PATH);
  return ok("Role disimpan.");
}

export async function deleteRole(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { role: myRole } = await requireSuperAdmin();
  const id = str(fd, "id");
  if (id === myRole.id) return err("Role yang sedang Anda pakai tidak bisa dihapus.");

  const supabase = await createClient();
  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) {
    return err(error.code === "23503" ? "Role masih dipakai akun. Pindahkan akunnya dulu." : error.message);
  }

  revalidatePath(PATH);
  return ok("Role dihapus.");
}

export async function saveRoleMenus(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const roleId = str(fd, "role_id");
  const menus = fd.getAll("menu").map(String).filter((m) => MENU_IDS.has(m));

  const supabase = await createClient();
  const { error: delError } = await supabase.from("role_menus").delete().eq("role_id", roleId);
  if (delError) return err(delError.message);
  if (menus.length > 0) {
    const { error } = await supabase
      .from("role_menus")
      .insert(menus.map((submenu_id) => ({ role_id: roleId, submenu_id })));
    if (error) return err(error.message);
  }

  revalidatePath(PATH);
  return ok(`${menus.length} menu disimpan.`);
}
