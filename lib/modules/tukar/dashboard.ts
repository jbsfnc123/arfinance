// Port getDashboardData (Tukar Faktur/Code.gs): total = jumlah nilai harian,
// rata-rata hanya dibagi hari aktif, dibulatkan (0,5 ke atas).

export type TukarDay = { day: number; inv: number; bp: number; lok: number };

export function tukarKpi(days: TukarDay[]) {
  const active = days.filter((d) => d.inv > 0 || d.bp > 0 || d.lok > 0);
  const sum = (k: keyof TukarDay) => active.reduce((s, d) => s + d[k], 0);
  const avg = (v: number) => (active.length ? Math.floor(v / active.length + 0.5) : 0);
  const totalInvoice = sum("inv");
  const totalBP = sum("bp");
  const totalLokasi = sum("lok");
  return {
    totalInvoice, totalBP, totalLokasi, activeDays: active.length,
    avgInvoice: avg(totalInvoice), avgBP: avg(totalBP), avgLokasi: avg(totalLokasi),
  };
}

export type JadwalRow = { business_partner: string; invoice_no: string; invoice_date: string | null; tukar: boolean; kolektor: string | null };

// Jadwal Kolektor: dikelompokkan per BP, urut jumlah invoice terbanyak lalu nama.
export function groupJadwal(rows: JadwalRow[]) {
  const map = new Map<string, JadwalRow[]>();
  for (const r of rows) {
    const bp = r.business_partner || "Tanpa Business Partner";
    map.set(bp, [...(map.get(bp) ?? []), r]);
  }
  return [...map.entries()]
    .map(([bp, items]) => {
      const done = items.filter((i) => i.tukar).length;
      const counts = new Map<string, number>();
      for (const i of items) if (i.kolektor) counts.set(i.kolektor, (counts.get(i.kolektor) ?? 0) + 1);
      const kolektor = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { bp, items, done, total: items.length, kolektor };
    })
    .sort((a, b) => b.total - a.total || a.bp.localeCompare(b.bp));
}

// Port RPC tukar_dashboard ke browser: tukar faktur Done per hari (invoice, BP unik, titik lokasi unik).
export function tukarDays(done: { tanggal_tukar: string | null; kurir: string | null; business_partner: string | null; kode: string | null }[], month: string, kurir: string) {
  const kol = (k: string | null) => (k ?? "").trim() || "Tanpa Kolektor";
  const months = [...new Set(done.map((d) => d.tanggal_tukar?.slice(0, 7)).filter(Boolean) as string[])].sort().reverse();
  const kurirs = [...new Set(done.map((d) => kol(d.kurir)))].sort();
  const sel = done.filter((d) => d.tanggal_tukar?.slice(0, 7) === month && (!kurir || kol(d.kurir) === kurir));
  const [y, m] = month.split("-").map(Number);
  const last = /^\d{4}-\d{2}$/.test(month) ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 0;
  const days: TukarDay[] = Array.from({ length: last }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const rows = sel.filter((d) => d.tanggal_tukar === date);
    const uniq = (f: (d: (typeof rows)[number]) => string | null) => new Set(rows.map(f).map((v) => (v ?? "").trim()).filter(Boolean)).size;
    return { day: i + 1, inv: rows.length, bp: uniq((d) => d.business_partner), lok: uniq((d) => d.kode) };
  });
  return { months, kurirs, days };
}
