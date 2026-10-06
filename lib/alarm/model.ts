import { z } from "zod";
import { todayJakarta } from "@/lib/parsers/date";

export const ALARM_ACCESS_KEY = "alarm_senders_v1";
export const alarmInput = z.object({
  id: z.string().uuid(), recipientId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  dueAt: z.number().int().positive(),
});
export const alarmDelivery = alarmInput.extend({
  senderId: z.string().uuid(), senderName: z.string().max(200), sentAt: z.number(),
});
export type AlarmInput = z.infer<typeof alarmInput>;
export type AlarmDelivery = z.infer<typeof alarmDelivery>;
export type AlarmContext = {
  userId: string; isAdmin: boolean; canSend: boolean; senderIds: string[];
  accounts: { id: string; name: string }[];
};
export type PendingAlarm = AlarmInput & { recipientName: string; status: "waiting" | "sending" | "sent" | "failed"; error?: string };
export function alarmSenders(value: unknown): string[] {
  const parsed = z.array(z.string().uuid()).safeParse(value);
  return parsed.success ? [...new Set(parsed.data)] : [];
}
export function alarmTime(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return NaN;
  const value = Date.parse(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(value) || todayJakarta(new Date(value)) !== date) return NaN;
  return value;
}
export function dueAlarms(alarms: PendingAlarm[], now: number) {
  return alarms.filter((a) => a.status === "waiting" && a.dueAt <= now);
}
