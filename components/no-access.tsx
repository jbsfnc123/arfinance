import { Icon } from "@/components/icons";

export function NoAccess({ label, reason }: { label: string; reason?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <Icon name="lock" size={48} className="text-danger" />
      <h1 className="mt-3 text-xl font-medium">Tidak ada akses</h1>
      <p className="mt-2 text-sm text-fg-2">
        {reason ?? `Menu "${label}" belum diberikan untuk role Anda. Hubungi Super Admin.`}
      </p>
    </div>
  );
}
