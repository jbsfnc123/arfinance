"use client";

import { useTheme, type ThemeMode } from "@/lib/ui/prefs";
import { Icon } from "@/components/icons";

// Tombol tema ringkas (Gelap → Terang → Sistem) untuk header tanpa Control Center (Finance & Kolektor).
const NEXT: Record<ThemeMode, ThemeMode> = { dark: "light", light: "system", system: "dark" };
const ICON: Record<ThemeMode, string> = { dark: "dark_mode", light: "light_mode", system: "contrast" };
const LABEL: Record<ThemeMode, string> = { dark: "Tema gelap", light: "Tema terang", system: "Tema sistem" };

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useTheme();
  return (
    <button type="button" onClick={() => setMode(NEXT[mode])} title={`${LABEL[mode]} · klik untuk mengganti`} aria-label={`${LABEL[mode]}, ganti tema`}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg ${className}`}>
      <Icon name={ICON[mode]} size={20} />
    </button>
  );
}
