"use client";

import { useEffect, useState } from "react";
import { Popover } from "@/components/popover";
import { useDensity, useTheme, useTransparency, type Density, type ThemeMode } from "@/lib/ui/prefs";
import { useLoadedDataset } from "@/lib/local/store";
import { fmtTimestamp } from "@/lib/format";
import { Icon } from "@/components/icons";

// Control Center (kanan atas): modul-modul kecil — tampilan, kepadatan, transparansi, layar penuh, refresh, data terakhir.
// Hanya kontrol yang relevan untuk AR Workspace; tidak ada Wi-Fi/Bluetooth tiruan.
const THEMES: { v: ThemeMode; l: string; i: string }[] = [{ v: "dark", l: "Gelap", i: "dark_mode" }, { v: "light", l: "Terang", i: "light_mode" }, { v: "system", l: "Sistem", i: "contrast" }];
const DENSITIES: { v: Density; l: string; i: string }[] = [{ v: "comfortable", l: "Nyaman", i: "density_medium" }, { v: "compact", l: "Padat", i: "density_small" }];

const mod = "rounded-[14px] border border-hairline bg-fg/[0.045] p-2.5";
const label = "mb-2 px-0.5 text-[11px] font-semibold text-fg-2";

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string; i: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-[10px] bg-fg/6 p-[3px]">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[8px] py-1.5 text-[11px] transition-colors pointer-coarse:min-h-11 ${value === o.v ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>
          <Icon name={o.i} size={18} />{o.l}
        </button>
      ))}
    </div>
  );
}

function Tile({ icon, title, sub, on, onClick, disabled, spin, wide }: { icon: string; title: string; sub?: string; on?: boolean; onClick: () => void; disabled?: boolean; spin?: boolean; wide?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`${mod} flex items-center gap-2.5 text-left transition-colors hover:bg-fg/8 disabled:opacity-60 ${wide ? "col-span-2" : ""}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${on ? "bg-accent-fill text-on-accent" : "bg-fg/10 text-fg"}`}>
        <Icon name={icon} size={18} className={spin ? "animate-spin" : ""} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold leading-tight">{title}</span>
        {sub && <span className="block truncate text-[11px] text-fg-2">{sub}</span>}
      </span>
    </button>
  );
}

export function ControlCenter({ open, onClose, onRefresh, refreshing }: { open: boolean; onClose: () => void; onRefresh: () => void; refreshing: boolean }) {
  const [theme, setTheme] = useTheme();
  const [density, setDensity] = useDensity();
  const [transparency, setTransparency] = useTransparency();
  const aging = useLoadedDataset("aging");
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); };
  return (
    <Popover open={open} onClose={onClose} label="Pusat kontrol" className="right-0 top-full mt-1.5 w-[320px] p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Tile icon={full ? "fullscreen_exit" : "fullscreen"} title="Layar penuh" sub={full ? "Aktif" : "Nonaktif"} on={full} onClick={toggleFull} />
        <Tile icon="refresh" title="Refresh data" sub={refreshing ? "Memuat…" : "Semua data di tab ini"} onClick={onRefresh} disabled={refreshing} spin={refreshing} />
        <section className={`${mod} col-span-2`}>
          <div className={label}>Tampilan</div>
          <Segmented value={theme} options={THEMES} onChange={setTheme} />
        </section>
        <section className={`${mod} col-span-2`}>
          <div className={label}>Kepadatan tabel</div>
          <Segmented value={density} options={DENSITIES} onChange={setDensity} />
        </section>
        <Tile icon="transparency" title="Kurangi transparansi" sub={transparency === "reduced" ? "Aktif — panel solid" : "Nonaktif"}
          on={transparency === "reduced"} onClick={() => setTransparency(transparency === "reduced" ? "normal" : "reduced")} wide />
        <div className={`${mod} col-span-2 flex items-center gap-2.5`}>
          <Icon name="cloud_sync" size={18} className="text-fg-2" />
          <span className="min-w-0 text-[12px]">
            <span className="block font-semibold">Data aging terakhir</span>
            <span className="block truncate text-[11px] text-fg-2">{aging.data ? fmtTimestamp(aging.data.uploadedAt) : "Belum dimuat di tab ini"}</span>
          </span>
        </div>
      </div>
    </Popover>
  );
}
