"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";
import { cachedQuery } from "@/lib/cache/cached-query";
import { completeness, type MonthData } from "@/lib/modules/deck/template";
import { compressJson, decodeMonth, deckState } from "@/lib/modules/deck/store";
import { useToast } from "@/components/toast";
import { DataCenter } from "./data-center";

type Bridge = {
  load: (win: Window) => Promise<unknown>;
  save: (state: Record<string, unknown>) => Promise<boolean>;
  clear: () => Promise<void>;
  openDataCenter: () => void;
};

declare global {
  interface Window { ARDeckBridge?: Bridge }
}

type Months = Map<string, MonthData>;

// AR Management Deck (public/presentasi-app) BERDIRI SENDIRI: tidak membaca menu/upload lain. Data per bulan
// datang dari template Excel (Data Center) dan disimpan sebagai 1 JSON terkompresi per bulan (deck_months).
// Dari app, yang disimpan kembali hanya teks slide per bulan dan konfigurasi tampilan.
export function DeckFrame({ kind }: { kind: string }) {
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [frameKey, setFrameKey] = useState(0);
  const [dcOpen, setDcOpen] = useState(false);
  const months = useRef<Months>(new Map());

  useEffect(() => {
    window.ARDeckBridge = {
      async load() {
        const { data } = await cachedQuery(supabase, {
          key: "deck-months-v1", deps: ["deck"],
          load: async () => {
            const [{ data: rows, error }, { data: st }] = await Promise.all([
              supabase.from("deck_months").select("month, data"),
              supabase.from("deck_state").select("state").eq("id", 1).maybeSingle(),
            ]);
            if (error) throw error;
            return { rows: rows ?? [], config: ((st?.state as { config?: { month?: string; week?: number } } | null)?.config) ?? {} };
          },
        });
        const decoded = await Promise.all(data.rows.map(async (r) => ({ month: r.month, data: await decodeMonth(r.data) })));
        months.current = new Map(decoded.map((x) => [x.month, x.data]));
        return deckState(decoded, data.config);
      },
      async save(state) {
        // Teks slide per bulan → JSON bulan itu (tanpa mengubah status upload). Bulan tanpa data diabaikan.
        const texts = (state.texts ?? {}) as Record<string, Record<string, string>>;
        for (const [month, d] of months.current) {
          const next = texts[month] ?? {};
          if (JSON.stringify(next) === JSON.stringify(d.texts)) continue;
          const updated = { ...d, texts: next };
          const c = completeness(updated);
          const { error } = await supabase.rpc("deck_month_save", {
            p_month: month, p_data: await compressJson(updated), p_filled: c.filled, p_total: c.total, p_upload: false,
          });
          if (error) { toast(`Gagal menyimpan teks ${month}: ${error.message}`, "danger", 8000); return false; }
          months.current.set(month, updated);
        }
        const cfg = (state.config ?? {}) as Record<string, unknown>;
        const { error } = await supabase.from("deck_state")
          .upsert({ id: 1, state: { version: 3, config: { month: cfg.month ?? "", week: cfg.week ?? 2 } } as unknown as Json, saved_at: new Date().toISOString() });
        return !error;
      },
      async clear() {
        toast("Data presentasi dikelola per bulan di Data Center (unduh/upload template, hapus bulan).", "info", 7000);
      },
      openDataCenter() { setDcOpen(true); },
    };
    return () => { delete window.ARDeckBridge; };
  }, [supabase, toast]);

  return (
    <div className="-m-6 h-[calc(100vh-60px)]">
      <iframe key={frameKey} src="/presentasi-app/index.html" title="AR Management Deck" allow="fullscreen" className="h-full w-full border-0" />
      <DataCenter open={dcOpen} onClose={() => setDcOpen(false)} onSaved={() => setFrameKey((k) => k + 1)} canDelete={kind === "sa" || kind === "ctrl"} />
    </div>
  );
}
