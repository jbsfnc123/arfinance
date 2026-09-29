import { Icon } from "@/components/icons";

// Keadaan kosong seragam (ikon + judul + petunjuk). Isi harus jujur: jelaskan kenapa kosong & langkah berikutnya.
export function EmptyState({ icon = "inventory_2", title, hint, action, className = "" }: {
  icon?: string; title: string; hint?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 py-12 text-center ${className}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-fill-3 text-fg-2"><Icon name={icon} size={24} /></span>
      <p className="text-[15px] font-semibold">{title}</p>
      {hint && <p className="max-w-md text-[13px] text-fg-2">{hint}</p>}
      {action}
    </div>
  );
}
