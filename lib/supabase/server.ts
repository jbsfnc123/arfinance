import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/database.types";
import { authCookieOptions } from "@/lib/workspace";

export async function createClient() {
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(h.get("host")),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Dipanggil dari Server Component: cookie tidak bisa ditulis di sini,
            // sesi sudah di-refresh oleh proxy.ts.
          }
        },
      },
    },
  );
}
