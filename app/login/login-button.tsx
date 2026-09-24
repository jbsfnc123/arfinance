"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // hd hanya memfilter pilihan akun di layar Google; penolakan sebenarnya di trigger database.
        queryParams: { hd: "penguin.id", prompt: "select_account" },
      },
    });
    if (error) setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={loading}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 font-medium text-on-accent transition hover:bg-accent-strong disabled:opacity-60"
    >
      <span className="material-symbols-outlined">login</span>
      {loading ? "Mengalihkan…" : "Masuk dengan Google"}
    </button>
  );
}
