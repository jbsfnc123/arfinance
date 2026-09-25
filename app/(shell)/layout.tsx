import { getSession } from "@/lib/session";
import { canAccess, HOME_ITEM, visibleMenu } from "@/lib/menu";
import { ShellChrome } from "./shell-chrome";

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const { profile, role, access } = await getSession();
  const menu = visibleMenu(access);

  return (
    <ShellChrome menu={menu} showHome={canAccess(HOME_ITEM, access)} user={{ name: profile.display_name, role: role.name, collection: profile.collection_name }}>
      {children}
    </ShellChrome>
  );
}
