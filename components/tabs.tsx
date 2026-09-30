"use client";

import { useRef } from "react";
import { Icon } from "@/components/icons";

// Tab halaman ala macOS. variant "segmented" (bawaan untuk ≤3 opsi) = kontrol segmen; "strip" (bawaan untuk grup
// panjang) = baris pil yang bisa digulir horizontal tanpa membungkus. role="tablist", panah kiri/kanan/Home/End
// memindah pilihan (roving tabindex); label, urutan & perilaku onChange sama dengan sebelumnya.
export function Tabs<K extends string>(props: {
  tabs: readonly { key: K; label: string; icon?: string }[];
  value: K;
  onChange: (k: K) => void;
  variant?: "segmented" | "strip";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const variant = props.variant ?? (props.tabs.length <= 3 ? "segmented" : "strip");
  const onKey = (e: React.KeyboardEvent) => {
    const i = props.tabs.findIndex((t) => t.key === props.value);
    const n = props.tabs.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    props.onChange(props.tabs[next].key);
    ref.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  const seg = variant === "segmented";
  const base = "flex h-[var(--control-h)] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 text-[13px] transition-colors duration-150";
  return (
    <div className={`mt-4 ${seg ? "" : "-mx-1 overflow-x-auto px-1 pb-0.5"} ${props.className ?? ""}`}>
      <div ref={ref} role="tablist" onKeyDown={onKey}
        className={seg ? "inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-fill-3 p-[3px]" : "flex w-max min-w-full gap-1 border-b border-separator pb-1.5"}>
        {props.tabs.map((t) => {
          const on = props.value === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => props.onChange(t.key)}
              className={`${base} ${seg
                ? on ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-2 hover:text-fg"
                : on ? "bg-selection font-medium text-accent" : "text-fg-2 hover:bg-fg/6 hover:text-fg"}`}>
              {t.icon && <Icon name={t.icon} size={16} />}{t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
