"use client";

import { usePrefsSync } from "@/lib/ui/prefs";

// Dipasang sekali di root layout: menerapkan ulang preferensi tampilan saat tema OS berubah (mode Sistem) atau saat
// preferensi diubah di tab lain — di semua workspace, termasuk halaman tanpa kontrol tema (login, Presentasi).
export function PrefsSync() {
  usePrefsSync();
  return null;
}
