"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@/components/popover";
import { Icon } from "@/components/icons";
import { btnGhost, inputCls } from "@/components/ui";

export type MultiOption = { value: string; label: string; count: number };

/** Selection semantics: null = all (no filter); an array = only those values; [] = nothing shown. */
export function nextSelection(all: string[], selected: string[] | null, value: string, on: boolean): string[] | null {
  const cur = new Set(selected ?? all);
  if (on) cur.add(value); else cur.delete(value);
  return all.every((v) => cur.has(v)) ? null : all.filter((v) => cur.has(v));
}

// Excel-style filter (Fase 92): dropdown of distinct values with checkboxes, Pilih semua, search, Reset.
// When every option is ticked, the selection goes back to null (= Semua) so new values are included too.
export function MultiSelectFilter({ label, options, selected, onChange, unit = "nilai" }: {
  label: string; options: MultiOption[]; selected: string[] | null; onChange: (v: string[] | null) => void; unit?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const allRef = useRef<HTMLInputElement>(null);
  const all = useMemo(() => options.map((o) => o.value), [options]);
  const sel = useMemo(() => (selected ? new Set(selected) : null), [selected]);
  const isOn = (v: string) => !sel || sel.has(v);
  const nOn = sel ? options.filter((o) => sel.has(o.value)).length : options.length;
  const allOn = nOn === options.length && options.length > 0;
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = nOn > 0 && !allOn; }, [nOn, allOn, open]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  const summary = !selected ? "Semua" : nOn === 0 ? "Tidak ada" : nOn === 1
    ? options.find((o) => sel?.has(o.value))?.label ?? "1" : `${nOn} ${unit}`;
  const row = "flex items-center gap-2 rounded-[8px] px-2 py-1 text-[13px] hover:bg-fg/8 cursor-pointer";

  return (
    <span className="relative inline-flex">
      <button type="button" data-popover-anchor className={`${btnGhost} ${selected ? "border-accent text-accent" : ""}`}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`Filter ${label}`}>
        <span className="text-fg-2">{label}:</span> {summary}
        <Icon name="expand_more" size={15} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} label={`Filter ${label}`}
        className="left-0 top-full mt-1.5 w-64 p-2 max-sm:fixed max-sm:left-2 max-sm:right-2 max-sm:w-auto">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" aria-label={`Cari ${label}`}
          className={`${inputCls} mb-1.5`} />
        <label className={`${row} font-medium`}>
          <input ref={allRef} type="checkbox" checked={allOn} aria-label="Pilih semua"
            onChange={(e) => onChange(e.target.checked ? null : [])} />
          <span className="flex-1">Pilih semua</span>
          <span className="text-[11px] tabular-nums text-fg-2">{options.reduce((a, o) => a + o.count, 0).toLocaleString("id-ID")}</span>
        </label>
        <div className="my-1 border-t border-hairline" role="separator" />
        <div className="max-h-72 overflow-y-auto" role="group" aria-label={`Daftar ${label}`}>
          {shown.map((o) => (
            <label key={o.value} className={row}>
              <input type="checkbox" checked={isOn(o.value)} onChange={(e) => onChange(nextSelection(all, selected, o.value, e.target.checked))} />
              <span className="flex-1">{o.label}</span>
              <span className="text-[11px] tabular-nums text-fg-2">{o.count.toLocaleString("id-ID")}</span>
            </label>
          ))}
          {!shown.length && <p className="px-2 py-1.5 text-[12px] text-fg-2">Tidak ada yang cocok.</p>}
        </div>
        {selected && (
          <div className="mt-1.5 flex justify-end border-t border-hairline pt-1.5">
            <button type="button" className={btnGhost} onClick={() => onChange(null)}>Reset</button>
          </div>
        )}
      </Popover>
    </span>
  );
}
