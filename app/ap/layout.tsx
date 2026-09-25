import { getSession } from "@/lib/session";
import { AP_MENU_REGISTRY, canEnterWorkspace, visibleMenu } from "@/lib/menu";
import { currentHost } from "@/lib/workspace-server";
import { WORKSPACES, workspaceUrl } from "@/lib/workspace";
import { WorkspaceDenied } from "@/components/workspace-denied";
import { ShellChrome } from "../(shell)/shell-chrome";

// AP Workspace (ap.tangki.space): kerangka sama dengan AR; menu diisi fase berikutnya.
export default async function ApLayout({ children }: LayoutProps<"/ap">) {
  const [{ profile, role, access }, host] = await Promise.all([getSession(), currentHost()]);
  if (!canEnterWorkspace("ap", access)) return <WorkspaceDenied ws="ap" access={access} host={host} />;
  const menu = visibleMenu(access, AP_MENU_REGISTRY);

  return (
    <ShellChrome title={WORKSPACES.ap.label} icon={WORKSPACES.ap.icon} menu={menu} showHome
      portalHref={canEnterWorkspace("finance", access) ? workspaceUrl("finance", host) : null}
      user={{ name: profile.display_name, role: role.name, collection: profile.collection_name }}>
      {children}
    </ShellChrome>
  );
}
