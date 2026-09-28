"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { derivePassword, isValidPin } from "@/lib/auth/pin";
import { canEnterWorkspace, homeWorkspace, isDivision } from "@/lib/menu";
import { isSharedHost, parseNext, staysOnKolektor, workspaceFromHost, workspaceUrl } from "@/lib/workspace";
import { loginAllowedHere } from "@/lib/auth/login-names";

export type LoginState = { error: string; at: number; needPin?: boolean; go?: string } | null;

type PinLoginResult =
  | { status: "ok"; user_id: string; email: string }
  | { status: "invalid" | "locked" };

const fail = (error: string) => ({ error, at: Date.now() });

async function clientIp() {
  const h = await headers();
  return { h, ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown" };
}

// Login: Nama (+ PIN bila akun tidak diizinkan tanpa PIN), lalu diarahkan ke workspace sesuai akses akun
// (atau kembali ke alamat asal ?next bila akun boleh membukanya). Satu pintu di tangki.space; Aplikasi Kolektor
// (kolektor.tangki.space) punya halaman login sendiri. PIN kosong → coba login cukup nama (name_login).
export async function loginWithPin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "");
  if (!name) return fail("Pilih nama terlebih dahulu.");
  const { h, ip } = await clientIp();
  const admin = createAdminClient();

  let result: PinLoginResult | { status: "need_pin" };
  if (!pin) {
    // Akun yang dicentang "Login tanpa PIN" (bukan Super Admin) langsung masuk; lainnya diminta PIN.
    const { data, error } = await admin.rpc("name_login", { p_name: name, p_ip: ip });
    if (error) return fail("Login gagal. Coba lagi.");
    result = data as PinLoginResult | { status: "need_pin" };
    if (result.status === "need_pin") return { error: "", at: Date.now(), needPin: true };
  } else {
    if (!isValidPin(pin)) return { ...fail("PIN harus 6 digit angka."), needPin: true };
    // pin_login_named juga mencatat percobaan & menerapkan batas brute-force.
    const { data, error } = await admin.rpc("pin_login_named", { p_name: name, p_pin: pin, p_ip: ip });
    if (error) return { ...fail("Login gagal. Coba lagi."), needPin: true };
    result = data as PinLoginResult;
  }
  if (result.status === "locked") return { ...fail("Terlalu banyak percobaan. Coba lagi dalam 15 menit."), needPin: !!pin };
  if (result.status !== "ok") return pin ? { ...fail("Nama atau PIN salah."), needPin: true } : fail("Nama tidak ditemukan.");

  const { data: prof } = await admin
    .from("profiles").select("active, division, role_id, role:roles(kind)").eq("id", result.user_id).single();
  const role = prof?.role as { kind: string } | null | undefined;
  if (!prof?.active || !role) return fail("Akun Anda dinonaktifkan. Hubungi Super Admin.");
  // Akun kolektor hanya lewat kolektor.tangki.space; akun lain lewat login utama (sama dengan daftar dropdown).
  const hereWs = workspaceFromHost(h.get("host"));
  if (!loginAllowedHere(role.kind, hereWs)) {
    return fail(hereWs === "kolektor" ? "Halaman ini khusus akun kolektor." : "Akun kolektor masuk lewat kolektor.tangki.space.");
  }
  // Menu role dibutuhkan untuk menentukan workspace (Aplikasi Kolektor = menu tukar.detail).
  const { data: menus } = await admin.from("role_menus").select("submenu_id").eq("role_id", prof.role_id);
  const access = {
    kind: role.kind, allowed: new Set<string>((menus ?? []).map((m) => m.submenu_id)),
    division: isDivision(prof.division) ? prof.division : "ar" as const,
  };

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: result.email,
    password: derivePassword(result.user_id),
  });
  if (signInError) return fail("Akun bermasalah. Hubungi Super Admin.");

  const host = h.get("host");
  const here = workspaceFromHost(host);
  const next = parseNext(String(formData.get("next") ?? ""), host);
  let target: string;
  if (next && canEnterWorkspace(next.ws, access)) target = next.url;
  // Dev (*.localhost) & Aplikasi Kolektor: tetap di host ini bila boleh.
  else if ((!isSharedHost(host) || here === "kolektor") && canEnterWorkspace(here, access)) target = workspaceUrl(here, host);
  else target = workspaceUrl(homeWorkspace(access), host);
  target = staysOnKolektor(host, target);
  // Tujuan di host yang sama harus dimuat penuh oleh browser: redirect() server action merender rute secara internal
  // tanpa rewrite workspace di proxy (kolektor "/" akan tampil sebagai halaman AR).
  if (host && new URL(target).host === host) return { error: "", at: Date.now(), go: target };
  redirect(target);
}
