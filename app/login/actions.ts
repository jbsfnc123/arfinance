"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { derivePassword, isValidPin } from "@/lib/auth/pin";
import { canEnterWorkspace, homeWorkspace, isDivision } from "@/lib/menu";
import { isSharedHost, parseNext, staysOnKolektor, workspaceFromHost, workspaceUrl } from "@/lib/workspace";
import { loginAllowedHere } from "@/lib/auth/login-names";

export type LoginState = { error: string; at: number; needPin?: boolean; needSetup?: boolean; go?: string } | null;

type PinLoginResult =
  | { status: "ok"; user_id: string; email: string }
  | { status: "invalid" | "locked" };

const fail = (error: string) => ({ error, at: Date.now() });

async function clientIp() {
  const h = await headers();
  return { h, ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown" };
}

// Login: Nama + PIN (wajib; akun yang belum punya PIN membuatnya dulu lewat `setup`), lalu diarahkan ke workspace sesuai
// akses akun (atau kembali ke ?next bila boleh). Pengecualian: akun kolektor "tanpa PIN" di Aplikasi Kolektor
// (kolektor.tangki.space) cukup nama. PIN kosong → name_login menentukan: ok (kolektor) / need_pin / need_setup.
export async function loginWithPin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "");
  const setup = formData.get("setup") === "1";
  if (!name) return fail("Pilih nama terlebih dahulu.");
  const { h, ip } = await clientIp();
  const admin = createAdminClient();

  let result: PinLoginResult | { status: "need_pin" | "need_setup" };
  if (setup) {
    // Buat PIN pertama kali (hanya berhasil bila akun ini memang belum punya PIN), lalu langsung masuk.
    if (!isValidPin(pin)) return { ...fail("PIN harus 6 digit angka."), needSetup: true };
    const { data, error } = await admin.rpc("pin_setup_named" as never, { p_name: name, p_pin: pin, p_ip: ip } as never);
    if (error) return { ...fail("Gagal membuat PIN. Coba lagi."), needSetup: true };
    result = data as unknown as PinLoginResult;
    if (result.status === "invalid") return { ...fail("PIN akun ini sudah dibuat. Masuk dengan PIN Anda."), needPin: true };
  } else if (!pin) {
    // Hanya akun kolektor "tanpa PIN" yang langsung masuk; lainnya diminta PIN atau membuat PIN.
    const { data, error } = await admin.rpc("name_login", { p_name: name, p_ip: ip });
    if (error) return fail("Login gagal. Coba lagi.");
    result = data as PinLoginResult | { status: "need_pin" | "need_setup" };
    if (result.status === "need_pin") return { error: "", at: Date.now(), needPin: true };
    if (result.status === "need_setup") return { error: "", at: Date.now(), needSetup: true };
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
  // Menu akun dibutuhkan untuk menentukan workspace (Aplikasi Kolektor = menu tukar.detail).
  const { data: menus } = await admin.from("profile_menus").select("submenu_id").eq("user_id", result.user_id);
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
