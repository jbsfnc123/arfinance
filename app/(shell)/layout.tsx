import { getSession } from "@/lib/session";
import { canAccess, canEnterWorkspace, HOME_ITEM, navMenu } from "@/lib/menu";
import { currentHost } from "@/lib/workspace-server";
import { WORKSPACES, workspaceUrl } from "@/lib/workspace";
import { WorkspaceDenied } from "@/components/workspace-denied";
import { ShellChrome } from "./shell-chrome";
import { canUseConsultant } from "@/lib/consultant-access";
import { myAvatarUrl } from "@/lib/avatar-server";

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const [{ profile, role, access }, host] = await Promise.all([getSession(), currentHost()]);
  if (!canEnterWorkspace("ar", access)) return <WorkspaceDenied ws="ar" access={access} host={host} />;
  // Semua menu tampil; yang tanpa akses ditandai locked (titik merah). Halaman tetap dijaga menuGuard + RLS.
  const menu = navMenu(access);
  const avatar = await myAvatarUrl(profile.avatar_path);

  return (
    <ShellChrome title={WORKSPACES.ar.label} icon={WORKSPACES.ar.icon} menu={menu} consultantEnabled={canUseConsultant(role.kind, profile.chatbot_enabled)}
      portalHref={canEnterWorkspace("finance", access) ? workspaceUrl("finance", host) : null} homeLocked={!canAccess(HOME_ITEM, access)}
      user={{ id: profile.id, name: profile.display_name, role: role.name, collection: profile.collection_name, avatar }}>
      {children}
    </ShellChrome>
  );
}
