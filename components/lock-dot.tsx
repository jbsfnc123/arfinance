// Penanda menu tanpa akses: titik merah kecil di pojok kanan atas ikon (induk harus `relative`). Dekoratif — makna
// disampaikan lewat teks pada kontrolnya (LOCKED_SUFFIX di aria-label/title). Hak akses tetap dijaga halaman & RLS.
export function LockDot({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden
      className={`pointer-events-none absolute -right-0.5 -top-0.5 h-[9px] w-[9px] rounded-full bg-danger ring-2 ring-[var(--surface-elevated)] ${className}`} />
  );
}

export const LOCKED_SUFFIX = " — tidak ada akses";

/** Pesan saat menu tanpa akses diklik (tetap di halaman sekarang). */
export const deniedMessage = (label: string) => `Anda tidak memiliki akses ke “${label}”. Hubungi Super Admin untuk membuka akses.`;
