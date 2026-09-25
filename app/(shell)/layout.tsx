import { getSession } from "@/lib/session";
import { canAccess, canEnterWorkspace, HOME_ITEM, visibleMenu } from "@/lib/menu";
import { currentHost } from "@/lib/workspace-server";
import { WORKSPACES } from "@/lib/workspace";
import { WorkspaceDenied } from "@/components/workspace-denied";
import { ShellChrome } from "./shell-chrome";

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const [{ profile, role, access }, host] = await Promise.all([getSession(), currentHost()]);
  if (!canEnterWorkspace("ar", access)) return <WorkspaceDenied ws="ar" access={access} host={host} />;
  const menu = visibleMenu(access);

  return (
    <ShellChrome title={WORKSPACES.ar.label} icon={WORKSPACES.ar.icon} menu={menu} showHome={canAccess(HOME_ITEM, access)}
      user={{ name: profile.display_name, role: role.name, collection: profile.collection_name }}>
      {children}
    </ShellChrome>
  );
}
