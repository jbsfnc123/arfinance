import { getSession } from "@/lib/session";
import { canAccess, findMenuById } from "@/lib/menu";

// Dipakai tiap halaman modul: sesi + apakah role boleh membuka submenu ini.
// RLS tetap penjaga utama data; ini untuk tampilan "Tidak ada akses".
export async function menuGuard(menuId: string) {
  const session = await getSession();
  const found = findMenuById(menuId);
  const allowed = found ? canAccess(found.item, session.access) : false;
  return { session, allowed, label: found?.item.label ?? menuId };
}
