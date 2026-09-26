"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";
import { cachedQuery } from "@/lib/cache/cached-query";
import { assembleState, persistable, recomputeDirty, savedPart, type LegacyParser } from "@/lib/uploads/deck";
import { diffSaved, isEmptyDiff, type Saved, type Series } from "@/lib/modules/deck/assemble";
import { deckCollection } from "@/lib/modules/deck/collection";
import { ensure, getEntry } from "@/lib/local/store";
import { detectKind } from "@/lib/uploads/parse";
import { runUpload } from "@/lib/uploads/run";
import { readAllSheets } from "@/lib/xlsx-client";
import { monthLabel } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";

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

type Info = { months: string[]; closed: string[]; current: string; week: number };

// Collection otomatis (Target & ERP). Tanpa `months`: semua bulan yang punya target.
async function autoCollection(week: number, months?: string[]): Promise<Series> {
  await Promise.all([ensure("targets"), ensure("erp")]);
  const targets = getEntry("targets").data?.targets ?? [];
  const payments = getEntry("erp").data?.payments ?? [];
  const out: Series = {};
  for (const m of months ?? [...new Set(targets.map((t) => t.month))]) {
    for (const [k, v] of Object.entries(deckCollection({ month: m, week, targets, payments }))) (out[k] ??= {})[m] = v;
  }
  return out;
}

// AR Management Deck (Presentasi/) dijalankan apa adanya dari public/presentasi-app. Data per bulan disimpan di
// tabel (deck_metrics, deck_manual_rows, deck_texts); bulan yang ditutup menjadi snapshot statis (deck_periods,
// deck_bp_snapshot). Data mentah bulan terbuka tetap dihitung dari tabel inti oleh parser lama (deck_derived).
export function DeckFrame({ kind }: { kind: string }) {
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [info, setInfo] = useState<Info | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const baseline = useRef<{ saved: Saved; closed: Set<string> } | null>(null);

  useEffect(() => {
    window.ARDeckBridge = {
      async load(win) {
        // Bulan terbuka yang ditandai dirty oleh upload dihitung ulang dulu (bulan tertutup dilewati).
        const { count } = await supabase.from("deck_dirty").select("kind", { count: "exact", head: true });
        if (count) await recomputeDirty(supabase, win);
        const { data } = await cachedQuery(supabase, {
          key: "deck-state-v2", deps: ["deck", "aging", "erp", "targets"],
          load: async () => {
            const { data: row, error } = await supabase.from("deck_state").select("state").eq("id", 1).maybeSingle();
            if (error) throw error;
            const base = (row?.state ?? null) as Record<string, unknown> | null;
            const week = Number((base?.config as { week?: number } | undefined)?.week) || 2;
            return assembleState(supabase, base, () => win.newState_(), await autoCollection(week));
          },
        });
        const st = data as Record<string, unknown>;
        const closed = new Set((st.closedMonths as string[]) ?? []);
        baseline.current = { saved: savedPart(st), closed };
        const layers = st.layers as Record<string, Series>;
        const months = new Set<string>();
        for (const L of ["manual", "raw", "excel"]) for (const s of Object.values(layers[L] ?? {})) for (const m of Object.keys(s)) months.add(m);
        const cfg = (st.config ?? {}) as { month?: string; week?: number };
        setInfo({ months: [...months].sort(), closed: [...closed], current: cfg.month ?? "", week: Number(cfg.week) || 2 });
        return st;
      },
      async save(state) {
        const base = baseline.current;
        const next = savedPart(state);
        if (base) {
          const d = diffSaved(base.saved, next, base.closed, (state.labels as Record<string, string>) ?? {});
          if (!isEmptyDiff(d)) {
            const { error } = await supabase.rpc("deck_save", {
              p_metrics: d.metrics as unknown as Json, p_metric_deletes: d.deletes as unknown as Json,
              p_rows: d.rows as unknown as Json, p_texts: d.texts as unknown as Json,
            });
            if (error) { toast(`Gagal menyimpan: ${error.message}`, "danger", 8000); return false; }
          }
          if (d.skipped.length) {
            toast(`Perubahan untuk bulan tertutup (${d.skipped.map(monthLabel).join(", ")}) tidak disimpan — bulan itu snapshot statis.`, "warning", 9000);
          }
          baseline.current = { ...base, saved: next };
        }
        const { error } = await supabase.from("deck_state")
          .upsert({ id: 1, state: persistable(state) as unknown as Json, saved_at: new Date().toISOString() });
        return !error;
      },
      async clear() {
        // Data per bulan (riwayat & snapshot) tidak ikut terhapus; hanya konfigurasi deck.
        await supabase.from("deck_state").delete().eq("id", 1);
        toast("Konfigurasi deck direset. Data per bulan tetap tersimpan di database.", "info", 7000);
      },
      // File Invoice/Payment/Aging/Master BP dari Data Center → jalur Pusat Upload (disimpan sekali, dipakai semua menu).
      async shareFile(file) {
        const sheets = await readAllSheets(file);
        const k = detectKind(sheets);
        if (k !== "aging" && k !== "erp" && k !== "bpmaster") throw new Error("bukan laporan Invoice/Payment, Aging, atau Master BP");
        return (await runUpload(supabase, k, file, sheets)).message;
      },
    };
    return () => { delete window.ARDeckBridge; };
  }, [supabase, toast]);

  return (
    <div className="-m-6 flex h-[calc(100vh-60px)] flex-col">
      <DeckToolbar info={info} kind={kind} onChanged={() => setFrameKey((k) => k + 1)} />
      <iframe key={frameKey} src="/presentasi-app/index.html" title="AR Management Deck" allow="fullscreen" className="w-full flex-1 border-0" />
    </div>
  );
}

// Periode presentasi: status bulan + Tutup Bulan (Controller/SA) / Buka Kembali (SA).
function DeckToolbar({ info, kind, onChanged }: { info: Info | null; kind: string; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const month = sel || info?.current || info?.months[info.months.length - 1] || "";
  const isClosed = !!info?.closed.includes(month);
  const canClose = kind === "sa" || kind === "ctrl";
  const openBefore = (info?.months ?? []).filter((m) => m <= month && !info?.closed.includes(m));

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(true);
    try { toast(await fn(), "success", 7000); onChanged(); }
    catch (e) { toast(`Gagal ${label}: ${(e as Error).message}`, "danger", 9000); }
    finally { setBusy(false); }
  }

  // Tutup satu per satu: agregat mentah + master BP dibekukan di server, Collection otomatis dikirim dari browser.
  async function closeMonths(months: string[]) {
    for (const m of months) {
      const auto = await autoCollection(info?.week ?? 2, [m]);
      const p = Object.entries(auto).map(([key, byM]) => ({ key, value: byM[m] }));
      const { error } = await supabase.rpc("deck_close_month", { p_month: m, p_auto: p as unknown as Json });
      if (error) throw new Error(`${monthLabel(m)}: ${error.message}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 text-sm">
      <span className="material-symbols-outlined text-accent">calendar_month</span>
      <select value={month} onChange={(e) => setSel(e.target.value)} className={`${inputCls} !w-auto !py-1`} aria-label="Periode presentasi">
        {(info?.months ?? []).slice().reverse().map((m) => (
          <option key={m} value={m}>{monthLabel(m)}{info?.closed.includes(m) ? " · tertutup" : ""}</option>
        ))}
      </select>
      {month && (
        <span className={`rounded-full px-2 py-0.5 text-xs ${isClosed ? "bg-surface-2 text-fg-2" : "bg-success/15 text-success"}`}>
          {isClosed ? "Tertutup — snapshot statis" : "Terbuka — mengikuti upload terbaru"}
        </span>
      )}
      {canClose && month && !isClosed && (
        <button type="button" className={btnPrimary} disabled={busy}
          onClick={() => {
            if (!confirm(`Tutup bulan ${monthLabel(month)}? Angka bulan ini dibekukan — upload ulang tidak akan mengubahnya.`)) return;
            void run("menutup bulan", async () => { await closeMonths([month]); return `${monthLabel(month)} ditutup dan disimpan sebagai snapshot.`; });
          }}>
          <span className="material-symbols-outlined !text-base">lock</span>Tutup Bulan
        </button>
      )}
      {canClose && openBefore.length > 1 && (
        <button type="button" className={btnGhost} disabled={busy}
          onClick={() => {
            if (!confirm(`Tutup ${openBefore.length} bulan terbuka s/d ${monthLabel(month)} sekaligus?`)) return;
            void run("menutup bulan", async () => {
              // Bulan yang hanya berisi riwayat Excel ditutup sekaligus; bulan dengan data mentah dibekukan satu per satu.
              const { error } = await supabase.rpc("deck_close_until", { p_until: month });
              if (error) throw error;
              const { data: closed } = await supabase.from("deck_periods").select("month").eq("status", "closed");
              const done = new Set((closed ?? []).map((x) => x.month));
              await closeMonths(openBefore.filter((m) => !done.has(m)));
              return `${openBefore.length} bulan s/d ${monthLabel(month)} ditutup sebagai snapshot.`;
            });
          }}>
          <span className="material-symbols-outlined !text-base">lock_clock</span>Tutup semua s/d bulan ini
        </button>
      )}
      {kind === "sa" && month && isClosed && (
        <button type="button" className={btnGhost} disabled={busy}
          onClick={() => {
            if (!confirm(`Buka kembali ${monthLabel(month)}? Angka dihitung ulang dari data mentah terbaru.`)) return;
            void run("membuka bulan", async () => {
              const { error } = await supabase.rpc("deck_reopen_month", { p_month: month });
              if (error) throw error;
              return `${monthLabel(month)} dibuka kembali.`;
            });
          }}>
          <span className="material-symbols-outlined !text-base">lock_open</span>Buka Kembali
        </button>
      )}
      <span className="ml-auto hidden text-xs text-fg-2 xl:inline">Collection otomatis dari Target & ERP · input manual tetap menimpa</span>
    </div>
  );
}
