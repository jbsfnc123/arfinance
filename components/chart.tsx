"use client";

import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

// ECharts hanya di browser; dimuat saat dibutuhkan.
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-surface-2" />,
});

// Warna mengikuti token tema (AppShellStyle.html / Chart.js defaults lama).
export const CHART_TEXT = "#9aa0a6";
export const CHART_GRID = "rgba(255,255,255,.08)";

export function Chart({ option, height = 260 }: { option: EChartsOption; height?: number }) {
  return (
    <div style={{ height }}>
      <ReactECharts
        option={{ backgroundColor: "transparent", textStyle: { color: CHART_TEXT, fontFamily: "inherit" }, ...option }}
        style={{ height: "100%", width: "100%" }}
        notMerge
      />
    </div>
  );
}
