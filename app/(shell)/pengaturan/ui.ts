// Kelas bersama ada di components/ui.ts; file ini menambah tipe hasil server action.
export { inputCls, btnPrimary, btnGhost } from "@/components/ui";

export type ActionResult = { ok: boolean; message: string; at: number } | null;

export const ok = (message: string): ActionResult => ({ ok: true, message, at: Date.now() });
export const err = (message: string): ActionResult => ({ ok: false, message, at: Date.now() });

export const KIND_LABEL: Record<string, string> = {
  sa: "Super Admin (semua menu)",
  ctrl: "Controller",
  coll: "Collection (data dibatasi Collection Name)",
  kurir: "Kurir",
};
