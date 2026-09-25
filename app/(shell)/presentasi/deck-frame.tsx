"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";
import { assembleState, persistable, recomputeDirty, type LegacyParser } from "@/lib/uploads/deck";
import { detectKind } from "@/lib/uploads/parse";
import { runUpload } from "@/lib/uploads/run";
import { readAllSheets } from "@/lib/xlsx-client";

type DeckWindow = Window & LegacyParser & { newState_: () => Record<string, unknown> };
type Bridge = {
  load: (win: DeckWindow) => Promise<unknown>;
  save: (state: Record<string, unknown>) => Promise<boolean>;
  clear: () => Promise<void>;
  shareFile: (file: File) => Promise<string>;
};

declare global {
  interface Window { ARDeckBridge?: Bridge }
}

// AR Management Deck (Presentasi/) dijalankan apa adanya dari public/presentasi-app. Data mentah
// (Invoice, Payment, Aging, Master BP) TIDAK disimpan di deck: dibaca dari tabel inti bersama dan
// diagregasi per bulan oleh parser lama (deck_derived). deck_state hanya menyimpan input manual,
// Excel historis, teks slide, dan konfigurasi.
export function DeckFrame() {
  useEffect(() => {
    const supabase = createClient();
    window.ARDeckBridge = {
      async load(win) {
        await recomputeDirty(supabase, win);
        const { data, error } = await supabase.from("deck_state").select("state").eq("id", 1).maybeSingle();
        if (error) throw error;
        return assembleState(supabase, (data?.state ?? null) as Record<string, unknown> | null, () => win.newState_());
      },
      async save(state) {
        const { error } = await supabase.from("deck_state")
          .upsert({ id: 1, state: persistable(state) as Json, saved_at: new Date().toISOString() });
        return !error;
      },
      async clear() {
        await supabase.from("deck_state").delete().eq("id", 1);
      },
      // File Invoice/Payment/Aging/Master BP dari Data Center → jalur Pusat Upload (disimpan sekali, dipakai semua menu).
      async shareFile(file) {
        const sheets = await readAllSheets(file);
        const kind = detectKind(sheets);
        if (kind !== "aging" && kind !== "erp" && kind !== "bpmaster") throw new Error("bukan laporan Invoice/Payment, Aging, atau Master BP");
        return (await runUpload(supabase, kind, file, sheets)).message;
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
