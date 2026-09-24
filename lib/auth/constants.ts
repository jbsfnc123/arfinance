// Aman dipakai di client maupun server (tanpa node:crypto).
export const PIN_LENGTH = 6;

export function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin);
}
