"use client";

import { useRef } from "react";
import { useFillHeight } from "@/lib/ui/fill-height";
import { card } from "@/components/ui";

// Pembungkus tabel sederhana (non-virtual): scroll di dalam kotak, header sticky, lebar mengikuti isi.
// fill (default) = tinggi mengikuti sisa layar → satu scrollbar per halaman. Untuk tabel di tengah dashboard
// pakai fill={false} + maxHeight agar tetap ringkas tetapi header tidak hilang saat digulir.
export function TableBox(props: {
  children: React.ReactNode;
  fill?: boolean;
  maxHeight?: string;
  reserve?: number;
  min?: number;
  className?: string;
  bare?: boolean; // tanpa kartu (sudah di dalam kartu)
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fill = props.fill ?? true;
  useFillHeight(ref, { enabled: fill, reserve: props.reserve, min: props.min ?? 240 });
  return (
    <div ref={ref}
      className={`${props.bare ? "" : card} overflow-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:bg-surface [&_thead_th]:shadow-[inset_0_-1px_0_var(--color-line)] [&_tfoot]:sticky [&_tfoot]:bottom-0 [&_tfoot]:bg-surface ${fill ? "" : props.maxHeight ?? "max-h-[70vh]"} ${props.className ?? ""}`}>
      {props.children}
    </div>
  );
}
