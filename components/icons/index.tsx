"use client";

import { useId } from "react";
import { FILLED, GLYPHS } from "./glyphs";
import type { AppIconSpec } from "@/lib/ui/app-icons";

// Sistem ikon lokal (pengganti font Material Symbols).
// <Icon>: simbol monokrom mengikuti currentColor; dekoratif = aria-hidden, beri `label` bila berdiri sendiri.
// <AppIcon>: ikon aplikasi squircle berlapis (gradien modul, highlight atas, tepi halus, glyph putih) untuk Dock,
// Launcher, Spotlight, TopBar, portal & login.

export function Icon({ name, size = 20, className = "", label, filled, strokeWidth = 1.75, style }: {
  name: string; size?: number; className?: string; label?: string; filled?: boolean; strokeWidth?: number; style?: React.CSSProperties;
}) {
  const body = GLYPHS[name] ?? GLYPHS.dot;
  if (process.env.NODE_ENV !== "production" && !GLYPHS[name]) console.warn(`Icon: glyph "${name}" belum ada di registry`);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={filled && FILLED.has(name) ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`} style={style}
      aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}
      dangerouslySetInnerHTML={{ __html: body }} />
  );
}

/** Squircle kontinu (superelips) 64×64 — bentuk ikon aplikasi. */
const SQUIRCLE = "M32 0C54 0 64 10 64 32S54 64 32 64 0 54 0 32 10 0 32 0Z";

export function AppIcon({ spec, size = 44, className = "", label }: { spec: AppIconSpec; size?: number; className?: string; label?: string }) {
  const id = useId().replace(/[:]/g, "");
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`app-icon inline-block shrink-0 ${className}`}
      aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={spec.from} />
          <stop offset="1" stopColor={spec.to} />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".42" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}><path d={SQUIRCLE} /></clipPath>
      </defs>
      <path d={SQUIRCLE} fill={`url(#g${id})`} />
      <g clipPath={`url(#c${id})`}>
        <ellipse cx="32" cy="4" rx="44" ry="26" fill={`url(#h${id})`} />
        <path d="M0 50C14 58 50 58 64 50V64H0Z" fill="#000" opacity=".08" />
      </g>
      <path d={SQUIRCLE} fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1" />
      {/* bayangan glyph lalu glyph putih */}
      <g transform="translate(15 16.2) scale(1.4167)" fill="none" stroke="#000" strokeOpacity=".18" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: GLYPHS[spec.glyph] ?? GLYPHS.dot }} />
      <g transform="translate(15 15) scale(1.4167)" fill="none" stroke="#fff" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: GLYPHS[spec.glyph] ?? GLYPHS.dot }} />
    </svg>
  );
}
