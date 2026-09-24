// Kelas Tailwind bersama untuk form di halaman Pengaturan.
export const inputCls =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent";
export const btnPrimary =
  "rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60";
export const btnGhost =
  "rounded-full border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60";

export type ActionResult = { ok: boolean; message: string; at: number } | null;

export const ok = (message: string): ActionResult => ({ ok: true, message, at: Date.now() });
export const err = (message: string): ActionResult => ({ ok: false, message, at: Date.now() });

export const KIND_LABEL: Record<string, string> = {
  sa: "Super Admin (semua menu)",
  ctrl: "Controller",
  coll: "Collection (data dibatasi Collection Name)",
  kurir: "Kurir",
};
