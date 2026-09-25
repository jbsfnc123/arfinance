import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { createClient } from "@/lib/supabase/server";
import { fmtTimestamp, monthLabel } from "@/lib/format";
import { card, td, th } from "@/components/ui";
import { UploadTarget } from "./upload-target";

export default async function TargetPage() {
  const { allowed, label } = await menuGuard("set.target");
  if (!allowed) return <NoAccess label={label} />;

  const supabase = await createClient();
  const { data: history } = await supabase
    .from("import_log")
    .select("id, file_name, months, rows, at")
    .eq("module", "collection")
    .eq("kind", "target")
    .order("at", { ascending: false })
    .limit(12);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium">Upload Target Bulanan</h1>
      <p className="mt-1 text-sm text-fg-2">
        Target menjadi dasar &quot;Total Target&quot; dan &quot;Sudah Terkumpul&quot; di Dashboard Collection. Upload ulang
        untuk bulan yang sama akan mengganti target bulan itu.
      </p>
      <UploadTarget />

      <section className={`${card} mt-6 overflow-hidden`}>
        <h2 className="px-4 pt-4 font-medium">Riwayat upload target</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Waktu</th>
              <th className={th}>Bulan</th>
              <th className={th}>File</th>
              <th className={`${th} text-right`}>Baris</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((h) => (
              <tr key={h.id} className="border-t border-line">
                <td className={td}>{fmtTimestamp(h.at)}</td>
                <td className={td}>{h.months?.map(monthLabel).join(", ")}</td>
                <td className={td}>{h.file_name}</td>
                <td className={`${td} text-right`}>{h.rows?.toLocaleString("id-ID")}</td>
              </tr>
            ))}
            {!history?.length && (
              <tr>
                <td className={`${td} text-fg-2`} colSpan={4}>Belum ada upload target.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
