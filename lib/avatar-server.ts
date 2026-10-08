import { createClient } from "@/lib/supabase/server";

/** Signed URL (1 jam) foto profil akun yang sedang login; null bila belum ada foto atau gagal. */
export async function myAvatarUrl(path: string | null | undefined) {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
