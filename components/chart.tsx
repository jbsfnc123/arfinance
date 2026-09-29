"use client";

import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { chartTheme } from "@/lib/ui/palette";
import { useResolvedTheme } from "@/lib/ui/prefs";

// ECharts hanya di browser; dimuat saat dibutuhkan.
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-surface-2" />,
});

// Nilai gelap untuk halaman yang masih memakai konstanta; halaman baru memakai chartTheme() agar ikut tema terang.
export const CHART_TEXT = "#9aa0a6";
export const CHART_GRID = "rgba(255,255,255,.08)";

// onClick menerima indeks data yang diklik (untuk drill-down). Warna teks mengikuti tema aktif.
export function Chart({ option, height = 260, onClick }: { option: EChartsOption; height?: number; onClick?: (dataIndex: number) => void }) {
  const theme = useResolvedTheme();
  const t = chartTheme();
  return (
    <div style={{ height, cursor: onClick ? "pointer" : undefined }}>
      <ReactECharts
        key={theme}
        option={{ backgroundColor: "transparent", textStyle: { color: t.text, fontFamily: "inherit" }, ...option }}
        style={{ height: "100%", width: "100%" }}
        notMerge
        onEvents={onClick ? { click: (p: { dataIndex: number }) => onClick(p.dataIndex) } : undefined}
      />
    </div>
  );
}
