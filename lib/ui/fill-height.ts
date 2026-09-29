"use client";

import { useLayoutEffect, type RefObject } from "react";

// Tinggi kotak tabel = sisa ruang layar di bawah posisinya (bukan persentase tetap seperti 65vh), sehingga
// halaman hanya punya satu scrollbar: header sticky dan footer/total tabel selalu terlihat di layar 768px
// maupun ultrawide. Dipasang sebagai max-height → tabel pendek tetap ringkas.

const MAIN_PAD = 24; // padding bawah <main> bawaan (p-6); dengan Dock dibaca dari computed style

/** Tinggi maksimum untuk elemen yang dimulai `offsetTop` px dari atas area scroll setinggi `viewport`. */
export function fillHeight(viewport: number, offsetTop: number, opts: { min?: number; reserve?: number; pad?: number } = {}) {
  const { min = 320, reserve = 0, pad = MAIN_PAD } = opts;
  return Math.max(min, Math.floor(viewport - offsetTop - reserve - pad));
}

export function useFillHeight(ref: RefObject<HTMLElement | null>, opts: { min?: number; reserve?: number; enabled?: boolean } = {}) {
  const { min = 320, reserve = 0, enabled = true } = opts;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const scroller = el.closest("main") as HTMLElement | null;
    const apply = () => {
      const box = scroller?.getBoundingClientRect();
      const top = el.getBoundingClientRect().top - (box?.top ?? 0) + (scroller?.scrollTop ?? window.scrollY);
      const viewport = scroller?.clientHeight ?? window.innerHeight;
      const pad = scroller ? parseFloat(getComputedStyle(scroller).paddingBottom) || MAIN_PAD : MAIN_PAD;
      const h = fillHeight(viewport, top, { min, reserve, pad });
      if (el.style.maxHeight !== `${h}px`) el.style.maxHeight = `${h}px`;
    };
    apply();
    // Hitung ulang saat layar diubah atau isi di atas tabel berubah tinggi (KPI dilipat, toolbar membungkus).
    const ro = new ResizeObserver(apply);
    if (scroller) { ro.observe(scroller); if (scroller.firstElementChild) ro.observe(scroller.firstElementChild); }
    window.addEventListener("resize", apply);
    return () => { ro.disconnect(); window.removeEventListener("resize", apply); el.style.maxHeight = ""; };
  }, [ref, min, reserve, enabled]);
}
