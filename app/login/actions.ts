"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { derivePassword, isValidPin } from "@/lib/auth/pin";
import { canEnterWorkspace, homeWorkspace, isDivision } from "@/lib/menu";
import { isSharedHost, parseNext, workspaceFromHost, workspaceUrl } from "@/lib/workspace";

export type LoginState = { error: string; at: number } | null;

type PinLoginResult =
  | { status: "ok"; user_id: string; email: string }
  | { status: "invalid" | "locked" };

const fail = (error: string): LoginState => ({ error, at: Date.now() });

async function clientIp() {
  const h = await headers();
  return { h, ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown" };
}

// Saran nama untuk langkah 1 (≥ 2 huruf, maks. 5 nama akun aktif, dibatasi per IP di database).
export async function searchNames(q: string): Promise<string[]> {
  const query = String(q ?? "").trim().slice(0, 60);
  if (query.length < 2) return [];
  const { ip } = await clientIp();
  const { data } = await createAdminClient().rpc("login_names", { p_q: query, p_ip: ip });
  return (data as string[] | null) ?? [];
}

// Satu pintu login (tangki.space): Nama + PIN, lalu diarahkan ke workspace sesuai divisi akun
// (atau kembali ke alamat asal ?next bila akun boleh membukanya).
export async function loginWithPin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "");
  if (!name) return fail("Pilih nama terlebih dahulu.");
  if (!isValidPin(pin)) return fail("PIN harus 6 digit angka.");

  const { h, ip } = await clientIp();

  // pin_login_named juga mencatat percobaan & menerapkan batas brute-force.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("pin_login_named", { p_name: name, p_pin: pin, p_ip: ip });
  if (error) return fail("Login gagal. Coba lagi.");

  const result = data as PinLoginResult;
  if (result.status === "locked") return fail("Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
  if (result.status !== "ok") return fail("Nama atau PIN salah.");

  const { data: prof } = await admin
    .from("profiles").select("active, division, role:roles(kind)").eq("id", result.user_id).single();
  const role = prof?.role as { kind: string } | null | undefined;
  if (!prof?.active || !role) return fail("Akun Anda dinonaktifkan. Hubungi Super Admin.");
  const access = { kind: role.kind, allowed: new Set<string>(), division: isDivision(prof.division) ? prof.division : "ar" as const };

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: result.email,
    password: derivePassword(result.user_id),
  });
  if (signInError) return fail("Akun bermasalah. Hubungi Super Admin.");

  const host = h.get("host");
  const next = parseNext(String(formData.get("next") ?? ""), host);
  if (next && canEnterWorkspace(next.ws, access)) redirect(next.url);
  // Dev (*.localhost): cookie tidak dibagi antar host → tetap di host ini bila boleh.
  if (!isSharedHost(host) && canEnterWorkspace(workspaceFromHost(host), access)) redirect("/");
  redirect(workspaceUrl(homeWorkspace(access), host));
}
