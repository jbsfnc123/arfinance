import { createClient } from "@/lib/supabase/server";
import { currentHost } from "@/lib/workspace-server";
import { WORKSPACES, workspaceUrl, type Workspace } from "@/lib/workspace";
import { card } from "@/components/ui";

// Portal Finance Workspace: pintu ke semua workspace + ringkasan akun.
export default async function FinancePortal() {
  const supabase = await createClient();
  const [host, { count: accounts }, { count: active }, { count: roles }] = await Promise.all([
    currentHost(),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("roles").select("*", { count: "exact", head: true }),
  ]);
  const targets: Workspace[] = ["ar", "ap"];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-medium">Portal</h1>
      <p className="mt-1 text-sm text-fg-2">Pilih workspace. Login berlaku di semua workspace tangki.space.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {targets.map((w) => (
          <a key={w} href={workspaceUrl(w, host)} className={`${card} group flex items-start gap-4 p-5 hover:border-accent`}>
            <span className="material-symbols-outlined !text-4xl text-accent">{WORKSPACES[w].icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {WORKSPACES[w].label}
                <span className="material-symbols-outlined !text-lg text-fg-2 group-hover:text-accent">open_in_new</span>
              </div>
              <div className="mt-1 text-sm text-fg-2">{WORKSPACES[w].desc}</div>
              <div className="mt-2 text-xs text-fg-2">{workspaceUrl(w, host).replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
            </div>
          </a>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Akun", value: accounts ?? 0, sub: `${active ?? 0} aktif`, href: "/akun" },
          { label: "Role", value: roles ?? 0, sub: "atur akses menu & workspace", href: "/acl" },
          { label: "Database", value: "Kuota", sub: "pemakaian Supabase", href: "/database" },
        ].map((s) => (
          <a key={s.label} href={s.href} className="rounded-xl border border-line bg-surface-2 p-3 hover:border-accent">
            <div className="text-xs text-fg-2">{s.label}</div>
            <div className="mt-1 text-lg font-medium">{s.value}</div>
            <div className="text-xs text-fg-2">{s.sub}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
