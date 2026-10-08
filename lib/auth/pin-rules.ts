/** PIN baru yang terlalu mudah ditebak (semua digit sama, urutan naik/turun). null = boleh dipakai. */
export function weakPin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "PIN harus 6 digit angka.";
  if (/^(\d)\1{5}$/.test(pin) || "01234567890".includes(pin) || "09876543210".includes(pin)) {
    return "PIN terlalu mudah ditebak. Pilih kombinasi lain.";
  }
  return null;
}
