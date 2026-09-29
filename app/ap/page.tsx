import { AppIcon } from "@/components/icons";
import { workspaceIcon } from "@/lib/ui/app-icons";
import { WORKSPACES } from "@/lib/workspace";

// Beranda AP Workspace — modul AP ditambahkan di fase berikutnya.
export default function ApHome() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <AppIcon spec={{ ...workspaceIcon("ap"), glyph: WORKSPACES.ap.icon }} size={64} className="mx-auto" />
      <h1 className="mt-3 text-xl font-medium">AP Workspace</h1>
      <p className="mt-2 text-sm text-fg-2">Modul hutang usaha (AP) akan ditambahkan di sini.</p>
    </div>
  );
}
