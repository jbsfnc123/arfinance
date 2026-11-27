"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensure } from "@/lib/local/store";
import { isActive, type BotParams, type BotJobId, type BotRun } from "@/lib/modules/m10/bot";

// Mitra10 › BOT (Fase 93): antrean run bot cloud. Minta run (rpc bot_run_request: cek menu + satu run aktif), unggah PDF
// transit bila Upload Faktur, lalu picu GitHub lewat /api/bot/dispatch. Riwayat di-poll tiap 4 dtk saat ada run aktif,
// 30 dtk saat diam (3 dtk saat aktif, Fase 94) (hanya saat tab browser terlihat). Run Receiving/Kwitansi selesai → dataset m10 dimuat ulang.
export type BotRequest = { jobs: { id: BotJobId; params?: BotParams }[]; dryRun: boolean; files?: { name: string; blob: Blob }[] };
export type Bot = ReturnType<typeof useBot>;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export function useBot() {
  const supabase = useMemo(() => createClient(), []);
  const [runs, setRuns] = useState<BotRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prev = useRef(new Map<number, string>());

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("bot_runs_recent" as never, { p_limit: 20 } as never);
    if (e) { setError(e.message); return; }
    const list = (data ?? []) as unknown as BotRun[];
    // Run data (Receiving/Kwitansi) baru selesai → muat ulang data Mitra10 bila versinya berubah.
    let refresh = false;
    for (const r of list) {
      const was = prev.current.get(r.id);
      if (was && isActive(was as BotRun["status"]) && !isActive(r.status) && !r.dry_run &&
        r.jobs.some((j) => j.id === "edi.gr" || j.id === "edi.kwitansi")) refresh = true;
      prev.current.set(r.id, r.status);
    }
    if (refresh) void ensure("m10");
    setError(null);
    setRuns(list);
    setLoaded(true);
  }, [supabase]);

  const active = runs.find((r) => isActive(r.status)) ?? null;
  // Interval hanya diganti saat ada/tidaknya run aktif berubah (boolean) — bukan tiap objek run baru hasil polling.
  const hasActive = !!active;
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- muat riwayat run dari server saat dibuka
  useEffect(() => {
    const ms = hasActive ? 3000 : 30000;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, ms);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load, hasActive]);

  const request = useCallback(async (req: BotRequest) => {
    setBusy(true);
    try {
      const transit = !!req.files?.length;
      const { data, error: e } = await supabase.rpc("bot_run_request" as never,
        { p_jobs: req.jobs, p_dry_run: req.dryRun, p_transit: transit } as never);
      if (e) throw new Error(e.message);
      const id = Number(data);
      // Tampilkan run (KPI "Menunggu bot…") segera, tanpa menunggu pemicu GitHub selesai (Fase 94).
      void load();
      if (transit) {
        for (const f of req.files!) {
          const { error: ue } = await supabase.storage.from("bot-transit").upload(`${id}/${f.name}`, f.blob, { contentType: "application/pdf", upsert: false });
          if (ue) {
            await supabase.rpc("bot_run_dispatch_failed" as never, { p_id: id, p_error: `Unggah PDF ${f.name} gagal: ${ue.message}` } as never);
            throw new Error(`Unggah PDF ${f.name} gagal: ${ue.message}`);
          }
        }
      }
      await postJson("/api/bot/dispatch", { id });
      await load();
      return id;
    } catch (err) {
      await load();
      throw err;
    } finally {
      setBusy(false);
    }
  }, [supabase, load]);

  const cancel = useCallback(async (id: number) => {
    try { return await postJson("/api/bot/cancel", { id }); } finally { await load(); }
  }, [load]);

  return { runs, active, loaded, error, busy, request, cancel, reload: load };
}
