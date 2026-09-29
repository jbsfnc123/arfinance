"use client";

import { useEffect } from "react";
import { canOpenGlobalOverlay } from "@/components/use-dialog";

// Ctrl/Cmd+K → toggle Spotlight. Selama dialog form/data halaman (lapisan "modal") masih aktif, pintasan diabaikan:
// Spotlight tidak terbuka di belakang/atas form dan isi form tidak tersentuh. Popover & Spotlight sendiri tidak memblokir.
export function useCommandK(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      e.preventDefault(); // jangan biarkan browser memakai Ctrl+K (kolom cari browser)
      if (e.repeat || !canOpenGlobalOverlay()) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}
