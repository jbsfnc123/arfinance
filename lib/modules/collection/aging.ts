import { daysBetween } from "@/lib/parsers/date";

// Aturan dari Code.gs: lunas bila sisa <= 1000; aging = hari ini − due date.
export const LUNAS_THRESHOLD = 1000;

export const AGING_BUCKETS = ["Belum Jatuh Tempo", "1-30 Hari", "31-60 Hari", ">60 Hari"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number] | "-";

export function agingOf(dueDate: string | null | undefined, today: string) {
  if (!dueDate) return { days: null, bucket: "-" as AgingBucket };
  const days = daysBetween(today, dueDate);
  const bucket: AgingBucket =
    days <= 0 ? "Belum Jatuh Tempo" : days <= 30 ? "1-30 Hari" : days <= 60 ? "31-60 Hari" : ">60 Hari";
  return { days, bucket };
}
