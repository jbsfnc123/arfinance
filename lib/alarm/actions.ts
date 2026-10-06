"use server";

import { z } from "zod";
import { getSession, requireSuperAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ALARM_ACCESS_KEY, alarmInput, alarmSenders, type AlarmContext } from "./model";

async function permissions() {
  const session = await getSession();
  const db = await createClient();
  const { data, error } = await db.from("app_settings").select("value").eq("key", ALARM_ACCESS_KEY).maybeSingle();
  if (error) throw new Error("Gagal membaca izin Alarm.");
  const senderIds = alarmSenders(data?.value);
  const isAdmin = session.role.kind === "sa";
  return { session, senderIds, isAdmin, canSend: isAdmin || senderIds.includes(session.profile.id) };
}

export async function getAlarmContext(): Promise<AlarmContext> {
  const { session, senderIds, isAdmin, canSend } = await permissions();
  let accounts: AlarmContext["accounts"] = [];
  if (canSend) {
    const { data, error } = await createAdminClient().from("profiles").select("id, display_name").eq("active", true).order("display_name");
    if (error) throw new Error("Gagal membaca daftar penerima.");
    accounts = (data ?? []).map((p) => ({ id: p.id, name: p.display_name }));
  }
  return { userId: session.profile.id, isAdmin, canSend, senderIds: isAdmin ? senderIds : [], accounts };
}

export async function saveAlarmAccess(input: unknown) {
  const { profile } = await requireSuperAdmin();
  const ids = [...new Set(z.array(z.string().uuid()).max(1000).parse(input))];
  const db = await createClient();
  const { error } = await db.from("app_settings").upsert({ key: ALARM_ACCESS_KEY, value: ids, updated_by: profile.id, updated_at: new Date().toISOString() });
  if (error) throw new Error("Gagal menyimpan akses Alarm.");
}

export async function sendAlarm(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = alarmInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Penerima atau pesan Alarm tidak valid (maksimal 2.000 karakter)." };
  const { session, canSend } = await permissions();
  if (!canSend) return { ok: false, error: "Akses mengirim Alarm tidak diberikan atau telah dicabut." };
  if (parsed.data.dueAt > Date.now() + 1000) return { ok: false, error: "Waktu Alarm belum tiba." };
  const admin = createAdminClient();
  const { data: recipient, error } = await admin.from("profiles").select("id").eq("id", parsed.data.recipientId).eq("active", true).maybeSingle();
  if (error || !recipient) return { ok: false, error: "Penerima tidak tersedia." };
  // HTTP Broadcast only: never use realtime.send SQL (it persists messages).
  const channel = admin.channel(`alarm:${recipient.id}`, { config: { private: true } });
  try {
    const result = await channel.httpSend("alarm", {
      ...parsed.data, senderId: session.profile.id,
      senderName: session.profile.display_name, sentAt: Date.now(),
    }, { timeout: 10000 });
    return result.success ? { ok: true } : { ok: false, error: "Pengiriman Alarm gagal." };
  } catch {
    return { ok: false, error: "Koneksi Alarm gagal. Periksa jaringan lalu coba lagi." };
  } finally {
    await admin.removeChannel(channel);
  }
}
