import { getSession } from "@/lib/session";
import { canEnterWorkspace } from "@/lib/menu";
import { currentHost } from "@/lib/workspace-server";
import { WorkspaceDenied } from "@/components/workspace-denied";
import { KolektorChrome } from "./kolektor-chrome";
import { myAvatarUrl } from "@/lib/avatar-server";

// Aplikasi Kolektor (kolektor.tangki.space): khusus tukar faktur kolektor di HP — tanpa sidebar/menu.
// Masuk bila akun punya menu Aplikasi Kolektor (tukar.detail) atau Super Admin.
export default async function KolektorLayout({ children }: LayoutProps<"/kolektor">) {
  const [{ profile, role, access }, host] = await Promise.all([getSession(), currentHost()]);
  if (!canEnterWorkspace("kolektor", access)) return <WorkspaceDenied ws="kolektor" access={access} host={host} />;
  const avatar = await myAvatarUrl(profile.avatar_path);
  return (
    <KolektorChrome user={{ id: profile.id, name: profile.display_name, role: role.name, avatar }}>
      {children}
    </KolektorChrome>
  );
}
