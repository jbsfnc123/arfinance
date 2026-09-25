import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import { fmtTimestamp } from "@/lib/format";
import { card, td, th } from "@/components/ui";
import { fmtBytes, QUOTA, quotaState, SUPABASE_PLAN, SUPABASE_USAGE_URL, type UsageReport } from "@/lib/modules/usage";

// Pengganti modal "Database" (peta arsitektur) di aplikasi lama: isi tabel & riwayat import.
// Fase 7: laporan ERP disimpan sekali di tabel inti; menu lain membaca lewat view.
const TABLES = [
  { table: "ar_aging_snapshots", desc: "Snapshot aging per bulan (upload Blank_A4 / MASTER AGING, 1 per bulan)" },
  { table: "ar_aging_lines", desc: "Baris aging semua snapshot → view ar_invoices (Collection) & m10_aging (Mitra10)" },
  { table: "erp_invoices", desc: "Invoice ERP (laporan Invoice & Payment) → Mutasi, Presentasi, Marketplace" },
  { table: "erp_payments", desc: "Pembayaran ERP per dokumen → Mutasi, Presentasi (late days), Marketplace" },
  { table: "business_partners", desc: "Master Business Partner → Presentasi" },
  { table: "ar_targets", desc: "Target bulanan → Dashboard Controller & Mutasi" },
  { table: "notes", desc: "Catatan collection (Reminder, No Respon, Case, Administratif)" },
  { table: "payment_promises", desc: "Janji bayar" },
  { table: "invoice_exchanges", desc: "Tukar faktur (Kolektor, Ekspedisi, Sistem, WA, Email)" },
  { table: "contacts", desc: "Kontak WA per Business Partner" },
  { table: "deck_derived", desc: "Agregat Presentasi per bulan (dihitung ulang dari tabel inti)" },
  { table: "profiles", desc: "Akun (login PIN)" },
  { table: "roles", desc: "Role & jenis akses" },
] as const;

export default async function DatabasePage() {
  const { allowed, label } = await menuGuard("set.database");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const counts = await Promise.all(
    TABLES.map(async (t) => {
      const { count } = await supabase.from(t.table as "profiles").select("*", { count: "exact", head: true });
      return count ?? 0;
    }),
  );
  const { data: log } = await supabase
    .from("import_log").select("id, module, kind, file_name, months, rows, at")
    .order("at", { ascending: false }).limit(20);
  // Laporan pemakaian hanya untuk Super Admin (RPC menolak role lain → bagian disembunyikan).
  const { data: usage } = await supabase.rpc("usage_report");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium">Database</h1>
        <p className="mt-1 text-sm text-fg-2">Supabase project arfinance · isi tabel utama dan riwayat import.</p>
      </div>

      {usage ? <UsageSection u={usage as unknown as UsageReport} /> : null}

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

const LEVEL_COLOR = { success: "var(--color-success)", warning: "var(--color-warning)", danger: "var(--color-danger)" } as const;

function QuotaCard({ title, used, quota, fmt }: { title: string; used: number; quota: number; fmt: (n: number) => string }) {
  const q = quotaState(used, quota);
  const pct = Math.round(q.pct * 1000) / 10;
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="text-xs text-fg-2">{title}</div>
      <div className="mt-1 font-medium">{fmt(q.used)} <span className="text-xs font-normal text-fg-2">/ {fmt(q.quota)}</span></div>
      <div className="mt-2 h-[7px] overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full" style={{ width: `${Math.max(1, Math.min(100, pct))}%`, background: LEVEL_COLOR[q.level] }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-fg-2"><span>{pct.toLocaleString("id-ID")}% terpakai</span><span>sisa {fmt(q.left)}</span></div>
    </div>
  );
}

function UsageSection({ u }: { u: UsageReport }) {
  const storageBytes = u.storage.reduce((a, s) => a + Number(s.bytes), 0);
  const count = (n: number) => n.toLocaleString("id-ID");
  return (
    <section className={`${card} space-y-4 p-4`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-medium">Pemakaian &amp; Kuota Supabase</h2>
        <span className="text-xs text-fg-2">Paket {SUPABASE_PLAN} · per {fmtTimestamp(u.at)} · {count(u.connections)} koneksi DB aktif</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <QuotaCard title="Database" used={Number(u.dbBytes)} quota={QUOTA.dbBytes} fmt={fmtBytes} />
        <QuotaCard title="File Storage" used={storageBytes} quota={QUOTA.storageBytes} fmt={fmtBytes} />
        <QuotaCard title={`Pengguna aktif 30 hari (dari ${count(u.users)} akun)`} used={u.activeUsers30d} quota={QUOTA.mau} fmt={count} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <table className="w-full text-sm">
          <thead><tr><th className={th}>10 tabel terbesar</th><th className={`${th} text-right`}>Perkiraan baris</th><th className={`${th} text-right`}>Ukuran</th></tr></thead>
          <tbody>
            {u.tables.map((t) => (
              <tr key={t.name} className="border-t border-line">
                <td className={`${td} font-mono text-xs`}>{t.name}</td>
                <td className={`${td} text-right`}>{count(Number(t.rows))}</td>
                <td className={`${td} text-right`}>{fmtBytes(Number(t.bytes))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Bucket storage</th><th className={`${th} text-right`}>File</th><th className={`${th} text-right`}>Ukuran</th></tr></thead>
          <tbody>
            {u.storage.map((b) => (
              <tr key={b.bucket} className="border-t border-line">
                <td className={`${td} font-mono text-xs`}>{b.bucket}</td>
                <td className={`${td} text-right`}>{count(Number(b.files))}</td>
                <td className={`${td} text-right`}>{fmtBytes(Number(b.bytes))}</td>
              </tr>
            ))}
            {!u.storage.length && <tr><td className={`${td} text-fg-2`} colSpan={3}>Belum ada bucket.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-2">
        Egress/bandwidth (kuota {fmtBytes(QUOTA.egressBytes)}/bulan) tidak bisa dibaca lewat database. Lihat angkanya di{" "}
        <a href={SUPABASE_USAGE_URL} target="_blank" rel="noreferrer" className="text-accent underline">dashboard Supabase → Usage</a>.
        Batas ukuran satu file upload {fmtBytes(QUOTA.uploadBytes)}.
      </p>
    </section>
  );
}
