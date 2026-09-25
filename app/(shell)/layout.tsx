import { getSession } from "@/lib/session";
import { visibleMenu } from "@/lib/menu";
import { ShellChrome } from "./shell-chrome";

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const { profile, role, access } = await getSession();
  const menu = visibleMenu(access);

  return (
    <ShellChrome menu={menu} user={{ name: profile.display_name, role: role.name, collection: profile.collection_name }}>
      {children}
    </ShellChrome>
  );
}
