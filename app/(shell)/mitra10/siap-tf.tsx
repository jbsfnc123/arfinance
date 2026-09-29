"use client";

import { useViewState } from "@/lib/ui/view-state";
import { btnGhost } from "@/components/ui";
import { Icon } from "@/components/icons";

// Tombol "Siap Tukar Faktur" di Kertas Kerja (Mitra10 & RKM): GR Done + Tukar Faktur Pending.
// Menulis/membaca state filter LocalTable yang sama (`table:<stateKey>:f`), jadi tombol menyala selama filter itu aktif —
// termasuk bila dipilih lewat dropdown — dan mati saat dilepas atau di-Reset.
export function SiapTfButton({ stateKey }: { stateKey: string }) {
  const [f, setF] = useViewState<Record<string, string>>(`table:${stateKey}:f`, {});
  const active = f.gr === "Done" && f.tukar_faktur === "Pending";
  function toggle() {
    if (active) {
      const rest = { ...f };
      delete rest.gr;
      delete rest.tukar_faktur;
      setF(rest);
    } else {
      setF({ ...f, gr: "Done", tukar_faktur: "Pending" });
    }
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={active}
      title="GR sudah Done, Tukar Faktur masih Pending"
      className={`${btnGhost} ${active ? "border-accent bg-accent/15 text-accent" : ""}`}>
      <Icon name="task_alt" size={16} />Siap Tukar Faktur
    </button>
  );
}
