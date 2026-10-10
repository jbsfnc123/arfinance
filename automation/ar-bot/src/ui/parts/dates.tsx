// Kolom tanggal per job, terisi default dari `defaultDates` (sama dengan runner) dan bisa diubah manual.
import { Icon } from "@/components/icons";
import { btnGhost, inputCls } from "@/components/ui";
import { defaultDates } from "~/shared/catalog";
import type { JobId } from "~/shared/types";
import { Field } from "./common";

export const todayLocal = () => new Date().toLocaleDateString("en-CA");
export type Dates = { start: string; end: string };

/** Nilai awal kolom tanggal job (null = job tanpa kolom tanggal). */
export const initialDates = (id: JobId): Dates | null =>
  id === "jasper.sj" || id === "jasper.aging" || id === "edi.upload-faktur" ? null : defaultDates(id, todayLocal());

/** Parameter tanggal untuk RunRequest (Kwitansi memakai bulan: tanggal 1). */
export const dateParams = (id: JobId, d: Dates | null) =>
  !d ? {} : id === "edi.kwitansi" ? { start: d.start } : { start: d.start, end: d.end };

export function JobDates({ id, value, onChange, compact }: { id: JobId; value: Dates | null; onChange: (d: Dates) => void; compact?: boolean }) {
  const def = initialDates(id);
  if (!def || !value) return null;
  const changed = id === "edi.kwitansi" ? value.start.slice(0, 7) !== def.start.slice(0, 7) : value.start !== def.start || value.end !== def.end;
  const w = compact ? "w-40" : "w-44";
  return (
    <>
      {id === "edi.kwitansi" ? (
        <Field label="Bulan" className={w}>
          <input className={inputCls} type="month" value={value.start.slice(0, 7)} max={todayLocal().slice(0, 7)}
            onChange={(e) => e.target.value && onChange({ start: `${e.target.value}-01`, end: value.end })} />
        </Field>
      ) : (
        <>
          <Field label="Tanggal awal" className={w}>
            <input className={inputCls} type="date" value={value.start} max={todayLocal()} onChange={(e) => onChange({ ...value, start: e.target.value })} />
          </Field>
          <Field label="Tanggal akhir" className={w}>
            <input className={inputCls} type="date" value={value.end} max={todayLocal()} onChange={(e) => onChange({ ...value, end: e.target.value })} />
          </Field>
        </>
      )}
      {changed && (
        <button type="button" className={btnGhost} onClick={() => onChange(def)}><Icon name="undo" />Kembali ke default</button>
      )}
    </>
  );
}
