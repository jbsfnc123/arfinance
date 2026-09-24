"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { derivePassword, isValidPin } from "@/lib/auth/pin";

export type LoginState = { error: string; at: number } | null;

type PinLoginResult =
  | { status: "ok"; user_id: string; email: string }
  | { status: "invalid" | "locked" };

const fail = (error: string): LoginState => ({ error, at: Date.now() });

export async function loginWithPin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const pin = String(formData.get("pin") ?? "");
  if (!isValidPin(pin)) return fail("PIN harus 6 digit angka.");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  // pin_login juga mencatat percobaan & menerapkan batas brute-force.
  const { data, error } = await createAdminClient().rpc("pin_login", { p_pin: pin, p_ip: ip });
  if (error) return fail("Login gagal. Coba lagi.");

  const result = data as PinLoginResult;
  if (result.status === "locked") return fail("Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
  if (result.status !== "ok") return fail("PIN salah.");

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: result.email,
    password: derivePassword(result.user_id),
  });
  if (signInError) return fail("Akun bermasalah. Hubungi Super Admin.");

  redirect("/");
}
