"use client";

import type { AclGroup } from "@/lib/menu";

// Menu dengan syarat jenis role tetap tersembunyi walau dicentang (lihat canAccess di lib/menu.ts).
export function blockedFor(kind: string, needs: string | null) {
  if (needs === "sa") return kind !== "sa";
  if (needs === "ctrl") return kind !== "sa" && kind !== "ctrl";
  return false;
}

// Checklist akses menu (input name="menu"), dipakai Role & Akses (default role) dan Akun & PIN (per akun).
// `selected` + `key` dari pemanggil menentukan isi awal; ganti `key` untuk mengisi ulang (mis. "Samakan dengan role").
export function MenuChecklist(props: { groups: AclGroup[]; kind: string; selected: string[]; defaults?: string[] }) {
  const defaults = props.defaults ? new Set(props.defaults) : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {props.groups.map((g) => (
        <fieldset key={g.id}>
          <legend className="text-xs font-medium uppercase tracking-wide text-fg-2">{g.label}</legend>
          {g.items.map((item) => {
            const blocked = blockedFor(props.kind, item.needs);
            const on = props.selected.includes(item.id);
            // Tanda perbedaan dari default role (khusus checklist akun).
            const diff = defaults && !blocked && on !== defaults.has(item.id);
            return (
              <label
                key={item.id}
                className={`mt-1 flex items-center gap-2 text-sm ${blocked ? "text-fg-disabled" : ""}`}
                title={blocked ? "Butuh role Controller/Super Admin" : diff ? (on ? "Ditambahkan (tidak ada di default role)" : "Dikurangi dari default role") : undefined}
              >
                <input type="checkbox" name="menu" value={item.id} defaultChecked={on} disabled={blocked} />
                {item.label}
                {diff && <span className={`text-xs ${on ? "text-success" : "text-warning"}`}>{on ? "+" : "−"}</span>}
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
