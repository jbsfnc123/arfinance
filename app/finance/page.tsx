import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { currentHost } from "@/lib/workspace-server";
import { WORKSPACES, workspaceUrl, type Workspace } from "@/lib/workspace";
import { card } from "@/components/ui";
import { canEnterWorkspace } from "@/lib/menu";
import { AppIcon, Icon } from "@/components/icons";
import { workspaceIcon } from "@/lib/ui/app-icons";

// Portal Finance Workspace: pintu ke AR, AP & Aplikasi Kolektor. Ringkasan akun/role hanya untuk Super Admin.
export default async function FinancePortal() {
  const [supabase, host, { role, profile, access }] = await Promise.all([createClient(), currentHost(), getSession()]);
  const isSa = role.kind === "sa";
  const [{ count: accounts }, { count: active }, { count: roles }] = isSa
    ? await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("active", true),
      supabase.from("roles").select("*", { count: "exact", head: true }),
    ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }];
  const targets = (["ar", "ap", "kolektor"] as Workspace[]).filter((w) => canEnterWorkspace(w, access));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-[22px] font-semibold tracking-tight">{isSa ? "Portal" : `Halo, ${profile.display_name.split(" ")[0]}`}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {targets.map((w) => (
          <a key={w} href={workspaceUrl(w, host)} className={`${card} group flex items-start gap-4 p-5 transition-shadow hover:shadow-md`}>
            <AppIcon spec={{ ...workspaceIcon(w), glyph: WORKSPACES[w].icon }} size={52} className="drop-shadow-[0_2px_4px_rgba(0,0,0,.18)]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {WORKSPACES[w].label}
                <Icon name="open_in_new" size={15} className="text-fg-2 group-hover:text-accent" />
              </div>
              <div className="mt-2 text-xs text-fg-2">{workspaceUrl(w, host).replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
            </div>
          </a>
        ))}
      </div>

      {isSa && <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Akun", value: accounts ?? 0, sub: `${active ?? 0} aktif`, href: "/akun" },
          { label: "Role", value: roles ?? 0, sub: "", href: "/acl" },
          { label: "Database", value: "Kuota", sub: "", href: "/database" },
          { label: "Pengaturan AI", value: "AR Helpdesk", sub: "", href: "/ai-settings" },
        ].map((s) => (
          <a key={s.label} href={s.href} className="rounded-xl border border-hairline bg-surface p-3 shadow-sm transition-shadow hover:shadow-md">
            <div className="text-xs text-fg-2">{s.label}</div>
            <div className="mt-1 text-lg font-medium">{s.value}</div>
            <div className="text-xs text-fg-2">{s.sub}</div>
          </a>
        ))}
      </div>}
    </div>
  );
}
