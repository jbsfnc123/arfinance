// Jadwal Tukar Faktur: baca CSV "Send Invoice To Customer" dengan parser yang SAMA dengan halaman Upload Jadwal
// (lib/modules/tukar/schedule.ts) dan kirim lewat RPC yang sama (schedule_replace = ganti seluruh jadwal kurir).
// Tanpa file Aging kedua: schedule_replace mengisi Payment Group / Marketing / Open Amt dari ar_invoices (Aging terkini).
import path from "node:path";
import { parseMasterCsv, type ScheduleRow } from "@/lib/modules/tukar/schedule";
import { botClient } from "./ingest";

export function inspectSchedule(text: string, today: string) {
  const { rows, skipped, delimiter } = parseMasterCsv(text);
  const dates = [...new Set(rows.map((r) => r.send_date).filter(Boolean))].sort() as string[];
  return { rows, skipped, delimiter, dates, otherDates: dates.filter((d) => d !== today) };
}

export async function commitSchedule(filePath: string, rows: ScheduleRow[], env: Parameters<typeof botClient>[0]) {
  const { supabase, done } = await botClient(env);
  try {
    const { data, error } = await supabase.rpc("schedule_replace", { p_rows: rows, p_file_name: path.basename(filePath) });
    if (error) throw new Error(`schedule_replace: ${error.message}`);
    return Number(data);
  } finally {
    await done();
  }
}
