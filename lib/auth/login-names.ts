import type { Workspace } from "@/lib/workspace";

export type LoginAccount = { display_name: string; active: boolean; kind: string | null; pin_optional?: boolean | null };
export type LoginName = { name: string; noPin: boolean };

/** Akun kolektor = role jenis Kurir (pengguna Aplikasi Kolektor). */
export const isKolektorKind = (kind: string | null | undefined) => kind === "kurir";

// Daftar nama di dropdown login: kolektor.tangki.space → hanya akun kolektor; halaman login lain → semua akun
// aktif kecuali kolektor. Super Admin tidak pernah tampil (masuk lewat /login?admin). Diurutkan A–Z tanpa duplikat. `noPin` = akun "Login tanpa PIN" (bukan Super Admin):
// langsung tombol Masuk; akun lain langsung ke keypad PIN.
export function loginNamesFor(accounts: LoginAccount[], ws: Workspace): LoginName[] {
  const seen = new Set<string>();
  return accounts
    .filter((a) => a.active && a.display_name.trim() && a.kind !== "sa" && (ws === "kolektor") === isKolektorKind(a.kind))
    .map((a) => ({ name: a.display_name.trim(), noPin: !!a.pin_optional && a.kind !== "sa" }))
    .filter((a) => (seen.has(a.name.toLowerCase()) ? false : (seen.add(a.name.toLowerCase()), true)))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/** Boleh masuk dari halaman login ini? Kolektor hanya lewat kolektor.tangki.space, akun lain lewat login utama. */
export const loginAllowedHere = (kind: string, ws: Workspace) => (ws === "kolektor") === isKolektorKind(kind);
