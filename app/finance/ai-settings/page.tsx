import { getSession } from "@/lib/session";
import { NoAccess } from "@/components/no-access";
import { CONSULTANT_SETTINGS_URL } from "@/lib/consultant-config";

export default async function AiSettingsPage() {
  const { role } = await getSession();
  if (role.kind !== "sa") return <NoAccess label="Pengaturan AI" reason="Menu ini hanya untuk Super Admin." />;
  return <div className="mx-auto max-w-5xl">
    <h1 className="text-[22px] font-semibold tracking-tight">Pengaturan AI</h1>
    <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <iframe src={CONSULTANT_SETTINGS_URL} title="Pengaturan AI AR Helpdesk"
        className="w-full border-0" style={{ height: "max(560px, calc(100dvh - 210px))" }} referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" />
    </div>
  </div>;
}
