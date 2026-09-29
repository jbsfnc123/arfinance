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

// onClick menerima indeks data yang diklik (untuk drill-down). Warna teks mengikuti tema aktif; pemanggil membangun
// warna seri dari seriesColors()/categoryColors()/chartTheme() dengan useResolvedTheme() agar ikut berganti tema.
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
