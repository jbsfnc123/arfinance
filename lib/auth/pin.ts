import { createHmac } from "node:crypto";

export { PIN_LENGTH, isValidPin } from "./constants";

// Email sintetis untuk user Supabase Auth; user tidak pernah melihatnya.
export function syntheticEmail(userId: string) {
  return `${userId}@pin.arfinance.local`;
}

// Password akun Supabase diturunkan dari rahasia server + user id, sehingga
// satu-satunya cara masuk adalah lewat PIN yang diverifikasi server.
export function derivePassword(userId: string, secret = process.env.PIN_AUTH_SECRET) {
  if (!secret) throw new Error("PIN_AUTH_SECRET belum diset");
  return createHmac("sha256", secret).update(userId).digest("base64url");
}
