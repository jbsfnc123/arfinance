"use client";

// Baris tab bergaya sama dengan halaman Cek Selisih Harga.
export function Tabs<K extends string>(props: {
  tabs: readonly { key: K; label: string; icon: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
      {props.tabs.map((t) => (
        <button key={t.key} type="button" onClick={() => props.onChange(t.key)}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm ${props.value === t.key ? "border-accent text-accent" : "border-transparent text-fg-2 hover:text-fg"}`}>
          <span className="material-symbols-outlined !text-lg">{t.icon}</span>{t.label}
        </button>
      ))}
    </div>
  );
}
