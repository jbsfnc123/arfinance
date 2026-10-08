import type { Workspace } from "@/lib/workspace";

export type LoginAccount = { display_name: string; active: boolean; kind: string | null; pin_optional?: boolean | null; system_account?: boolean | null };
export type LoginName = { name: string; noPin: boolean };

/** Akun kolektor = role jenis Kurir (pengguna Aplikasi Kolektor). */
export const isKolektorKind = (kind: string | null | undefined) => kind === "kurir";

// Daftar nama di dropdown login: kolektor.tangki.space → hanya akun kolektor; halaman login lain → semua akun
// aktif kecuali kolektor. Super Admin tidak pernah tampil (masuk lewat /login?admin). Diurutkan A–Z tanpa duplikat.
// Akun sistem (mis. Bot ERP, Fase 55) tidak pernah tampil.
// `noPin` = hanya akun KOLEKTOR yang dicentang "Login tanpa PIN" (tombol Masuk); akun lain selalu PIN (Fase 54).
export function loginNamesFor(accounts: LoginAccount[], ws: Workspace): LoginName[] {
  const seen = new Set<string>();
  return accounts
    .filter((a) => a.active && !a.system_account && a.display_name.trim() && a.kind !== "sa" && (ws === "kolektor") === isKolektorKind(a.kind))
    .map((a) => ({ name: a.display_name.trim(), noPin: !!a.pin_optional && isKolektorKind(a.kind) }))
    .filter((a) => (seen.has(a.name.toLowerCase()) ? false : (seen.add(a.name.toLowerCase()), true)))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/** Boleh masuk dari halaman login ini? Kolektor hanya lewat kolektor.tangki.space, akun lain lewat login utama. */
export const loginAllowedHere = (kind: string, ws: Workspace) => (ws === "kolektor") === isKolektorKind(kind);
