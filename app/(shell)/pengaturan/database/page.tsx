import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import { fmtTimestamp } from "@/lib/format";
import { card, td, th } from "@/components/ui";

// Pengganti modal "Database" (peta arsitektur) di aplikasi lama: isi tabel & riwayat import.
const TABLES = [
  { table: "ar_invoices", desc: "Tagihan terbuka (upload Blank_A4, pengganti Update_Tagihan)" },
  { table: "ar_targets", desc: "Target bulanan (pengganti sheet Tagihan)" },
  { table: "notes", desc: "Catatan collection (Reminder, No Respon, Case, Administratif)" },
  { table: "payment_promises", desc: "Janji bayar" },
  { table: "invoice_exchanges", desc: "Tukar faktur (Kolektor, Ekspedisi, Sistem, WA, Email)" },
  { table: "contacts", desc: "Kontak WA per Business Partner" },
  { table: "profiles", desc: "Akun (login PIN)" },
  { table: "roles", desc: "Role & jenis akses" },
] as const;

export default async function DatabasePage() {
  const { allowed, label } = await menuGuard("set.database");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const counts = await Promise.all(
    TABLES.map(async (t) => {
      const { count } = await supabase.from(t.table).select("*", { count: "exact", head: true });
      return count ?? 0;
    }),
  );
  const { data: log } = await supabase
    .from("import_log").select("id, module, kind, file_name, months, rows, at")
    .order("at", { ascending: false }).limit(20);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium">Database</h1>
        <p className="mt-1 text-sm text-fg-2">Supabase project arfinance · isi tabel utama dan riwayat import.</p>
      </div>

      <section className={`${card} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Tabel</th><th className={th}>Isi</th><th className={`${th} text-right`}>Baris</th></tr></thead>
          <tbody>
            {TABLES.map((t, i) => (
              <tr key={t.table} className="border-t border-line">
                <td className={`${td} font-mono text-xs`}>{t.table}</td>
                <td className={`${td} text-fg-2`}>{t.desc}</td>
                <td className={`${td} text-right`}>{counts[i].toLocaleString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${card} overflow-hidden`}>
        <h2 className="px-4 pt-4 font-medium">Riwayat import</h2>
        <table className="mt-2 w-full text-sm">
          <thead><tr><th className={th}>Waktu</th><th className={th}>Modul</th><th className={th}>Jenis</th><th className={th}>File</th><th className={`${th} text-right`}>Baris</th></tr></thead>
          <tbody>
            {(log ?? []).map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className={td}>{fmtTimestamp(l.at)}</td>
                <td className={td}>{l.module}</td>
                <td className={td}>{l.kind}{l.months?.length ? ` (${l.months.join(", ")})` : ""}</td>
                <td className={`${td} max-w-64 truncate`}>{l.file_name}</td>
                <td className={`${td} text-right`}>{l.rows?.toLocaleString("id-ID")}</td>
              </tr>
            ))}
            {!log?.length && <tr><td className={`${td} text-fg-2`} colSpan={5}>Belum ada import.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
