import { getSession } from "@/lib/session";
import { canEnterWorkspace } from "@/lib/menu";
import { currentHost } from "@/lib/workspace-server";
import { WorkspaceDenied } from "@/components/workspace-denied";
import { KolektorChrome } from "./kolektor-chrome";

// Aplikasi Kolektor (kolektor.tangki.space): khusus tukar faktur kolektor di HP — tanpa sidebar/menu.
// Masuk bila akun punya menu Aplikasi Kolektor (tukar.detail) atau Super Admin.
export default async function KolektorLayout({ children }: LayoutProps<"/kolektor">) {
  const [{ profile, role, access }, host] = await Promise.all([getSession(), currentHost()]);
  if (!canEnterWorkspace("kolektor", access)) return <WorkspaceDenied ws="kolektor" access={access} host={host} />;
  return (
    <KolektorChrome user={{ id: profile.id, name: profile.display_name, role: role.name }}>
      {children}
    </KolektorChrome>
  );
}
