"use client";

import { useEffect, useState } from "react";
import { Popover } from "@/components/popover";
import { useDensity, useTheme, type Density, type ThemeMode } from "@/lib/ui/prefs";
import { useLoadedDataset } from "@/lib/local/store";
import { fmtTimestamp } from "@/lib/format";

// Control Center (kanan atas): tema, kepadatan, layar penuh, refresh data, waktu data terakhir. Hanya isi yang
// relevan untuk AR Workspace — tidak ada tombol Wi-Fi/Bluetooth tiruan.
const THEMES: { v: ThemeMode; l: string; i: string }[] = [{ v: "dark", l: "Gelap", i: "dark_mode" }, { v: "light", l: "Terang", i: "light_mode" }, { v: "system", l: "Sistem", i: "contrast" }];
const DENSITIES: { v: Density; l: string }[] = [{ v: "comfortable", l: "Nyaman" }, { v: "compact", l: "Padat" }];

export function ControlCenter({ open, onClose, onRefresh, refreshing }: { open: boolean; onClose: () => void; onRefresh: () => void; refreshing: boolean }) {
  const [theme, setTheme] = useTheme();
  const [density, setDensity] = useDensity();
  const aging = useLoadedDataset("aging");
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); };
  const seg = "flex-1 rounded-lg px-2 py-1.5 text-xs transition-colors";
  return (
    <Popover open={open} onClose={onClose} label="Pusat kontrol" className="right-0 top-full mt-2 w-80 p-3">
      <div className="space-y-3">
        <section>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-2">Tema</div>
          <div className="flex gap-1 rounded-xl bg-surface-2/70 p-1">
            {THEMES.map((t) => (
              <button key={t.v} type="button" aria-pressed={theme === t.v} onClick={() => setTheme(t.v)}
                className={`${seg} flex items-center justify-center gap-1 ${theme === t.v ? "bg-surface shadow-sm text-fg" : "text-fg-2 hover:text-fg"}`}>
                <span className="material-symbols-outlined !text-base">{t.i}</span>{t.l}
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-2">Kepadatan tabel</div>
          <div className="flex gap-1 rounded-xl bg-surface-2/70 p-1">
            {DENSITIES.map((d) => (
              <button key={d.v} type="button" aria-pressed={density === d.v} onClick={() => setDensity(d.v)}
                className={`${seg} ${density === d.v ? "bg-surface shadow-sm text-fg" : "text-fg-2 hover:text-fg"}`}>{d.l}</button>
            ))}
          </div>
        </section>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={toggleFull} aria-pressed={full} className={`flex items-center gap-2 rounded-xl p-2.5 text-left text-sm ${full ? "bg-accent/15 text-accent" : "bg-surface-2/70 hover:bg-surface-2"}`}>
            <span className="material-symbols-outlined">{full ? "fullscreen_exit" : "fullscreen"}</span>{full ? "Keluar layar penuh" : "Layar penuh"}
          </button>
          <button type="button" onClick={onRefresh} disabled={refreshing} className="flex items-center gap-2 rounded-xl bg-surface-2/70 p-2.5 text-left text-sm hover:bg-surface-2 disabled:opacity-60">
            <span className={`material-symbols-outlined ${refreshing ? "animate-spin" : ""}`}>refresh</span>Refresh data
          </button>
        </div>
        <div className="rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-fg-2">
          Data aging per <span className="text-fg">{aging.data ? fmtTimestamp(aging.data.uploadedAt) : "— (belum dimuat di tab ini)"}</span>
        </div>
      </div>
    </Popover>
  );
}
