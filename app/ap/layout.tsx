import { getSession } from "@/lib/session";
import { AP_MENU_REGISTRY, canEnterWorkspace, navMenu } from "@/lib/menu";
import { currentHost } from "@/lib/workspace-server";
import { WORKSPACES, workspaceUrl } from "@/lib/workspace";
import { WorkspaceDenied } from "@/components/workspace-denied";
import { ShellChrome } from "../(shell)/shell-chrome";
import { canUseConsultant } from "@/lib/consultant-access";
import { myAvatarUrl } from "@/lib/avatar-server";

// AP Workspace (ap.tangki.space): kerangka sama dengan AR; menu diisi fase berikutnya.
export default async function ApLayout({ children }: LayoutProps<"/ap">) {
  const [{ profile, role, access }, host] = await Promise.all([getSession(), currentHost()]);
  if (!canEnterWorkspace("ap", access)) return <WorkspaceDenied ws="ap" access={access} host={host} />;
  // AP: tetap hanya menu yang bisa diakses (penanda titik merah khusus AR Workspace).
  const menu = navMenu(access, AP_MENU_REGISTRY)
    .map((g) => ({ ...g, children: g.children.filter((c) => !c.locked) }))
    .filter((g) => g.children.length > 0);
  const avatar = await myAvatarUrl(profile.avatar_path);

  return (
    <ShellChrome title={WORKSPACES.ap.label} icon={WORKSPACES.ap.icon} menu={menu} homeLocked={false} consultantEnabled={canUseConsultant(role.kind, profile.chatbot_enabled)}
      portalHref={canEnterWorkspace("finance", access) ? workspaceUrl("finance", host) : null}
      user={{ id: profile.id, name: profile.display_name, role: role.name, collection: profile.collection_name, avatar }}>
      {children}
    </ShellChrome>
  );
}
