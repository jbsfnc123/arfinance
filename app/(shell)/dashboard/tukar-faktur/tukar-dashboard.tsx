"use client";

import { MethodDashboard } from "./method-view";

// Dashboard Tukar Faktur (Fase 81c): satu tampilan angka per metode (Kolektor · Ekspedisi · EDI Mitra10) —
// kesimpulan, ringkasan bulan terpilih, ringkasan per bulan, rincian Kolektor/Ekspedisi, dan daftar invoice.
export function TukarDashboard() {
  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <h1 className="text-[22px] font-semibold tracking-tight">Dashboard Tukar Faktur</h1>
      <MethodDashboard />
    </div>
  );
}
