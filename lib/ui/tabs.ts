// Logika tab shell (Fase 68): daftar halaman yang terbuka seperti tab browser. Fungsi murni; state disimpan shell di
// view-state (sessionStorage) sehingga bertahan saat reload & dibersihkan saat logout / ganti akun.

export type ShellTab = { path: string; used: number };
export const MAX_TABS = 10;

/**
 * Aktifkan `path`: tab yang sudah ada cukup diperbarui waktu pakainya; path baru disisipkan di kanan tab `from`
 * (tab yang sedang aktif sebelum pindah). Lebih dari `max` → tab paling lama tidak dipakai (selain `path`) ditutup.
 */
export function openTab(tabs: ShellTab[], path: string, from: string | null, now: number, max = MAX_TABS): { tabs: ShellTab[]; evicted: string | null } {
  const i = tabs.findIndex((t) => t.path === path);
  if (i >= 0) {
    if (tabs[i].used === now) return { tabs, evicted: null };
    const next = tabs.slice();
    next[i] = { path, used: now };
    return { tabs: next, evicted: null };
  }
  const at = from ? tabs.findIndex((t) => t.path === from) : -1;
  const next = tabs.slice();
  next.splice(at >= 0 ? at + 1 : next.length, 0, { path, used: now });
  if (next.length <= max) return { tabs: next, evicted: null };
  const victim = next.filter((t) => t.path !== path).reduce((a, b) => (b.used < a.used ? b : a));
  return { tabs: next.filter((t) => t !== victim), evicted: victim.path };
}

/** Tutup `path`. Bila yang ditutup tab aktif → `go` = tetangga kanan (atau kiri). Tab terakhir tidak bisa ditutup. */
export function closeTab(tabs: ShellTab[], path: string, active: string): { tabs: ShellTab[]; go: string | null } {
  const i = tabs.findIndex((t) => t.path === path);
  if (i < 0 || tabs.length <= 1) return { tabs, go: null };
  const next = tabs.filter((t) => t.path !== path);
  return { tabs: next, go: path === active ? next[Math.min(i, next.length - 1)].path : null };
}

/** Sisakan hanya `keep` (Tutup tab lain). */
export const closeOthers = (tabs: ShellTab[], keep: string) => tabs.filter((t) => t.path === keep);

/** Data tersimpan → daftar tab yang valid (tahan terhadap isi sessionStorage yang rusak). */
export function sanitizeTabs(v: unknown): ShellTab[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.filter((t): t is ShellTab => !!t && typeof t.path === "string" && t.path.startsWith("/") && typeof t.used === "number" && !seen.has(t.path) && !!seen.add(t.path))
    .slice(0, MAX_TABS);
}
