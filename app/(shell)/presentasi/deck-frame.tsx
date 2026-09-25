"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";

type Bridge = {
  load: () => Promise<unknown>;
  save: (state: unknown) => Promise<boolean>;
  clear: () => Promise<void>;
};

declare global {
  interface Window { ARDeckBridge?: Bridge }
}

// AR Management Deck (Presentasi/) dijalankan apa adanya dari public/presentasi-app supaya
// engine metrik & slide identik dengan versi lama. Penyimpanan IndexedDB diganti bridge ini:
// state deck disimpan sebagai satu dokumen bersama di tabel deck_state.
export function DeckFrame() {
  useEffect(() => {
    const supabase = createClient();
    window.ARDeckBridge = {
      async load() {
        const { data, error } = await supabase.from("deck_state").select("state").eq("id", 1).maybeSingle();
        if (error) throw error;
        return data?.state ?? null;
      },
      async save(state) {
        const { error } = await supabase.from("deck_state")
          .upsert({ id: 1, state: state as Json, saved_at: new Date().toISOString() });
        return !error;
      },
      async clear() {
        await supabase.from("deck_state").delete().eq("id", 1);
      },
    };
    return () => { delete window.ARDeckBridge; };
  }, []);

  return (
    <div className="-m-6 h-[calc(100vh-60px)]">
      <iframe src="/presentasi-app/index.html" title="AR Management Deck" allow="fullscreen" className="h-full w-full border-0" />
    </div>
  );
}
