"use client";
import { inputCls } from "@/components/ui";
import { todayJakarta } from "@/lib/parsers/date";
export function AgingPeriodFields({month,date,disabled,onMonth,onDate}:{month:string;date:string;disabled:boolean;onMonth:(s:string)=>void;onDate:(s:string)=>void}) {
  return <div className="grid gap-2 text-sm sm:grid-cols-2">
    <label>Bulan Collection tujuan (Open)<input aria-label="Bulan Collection tujuan" type="month" value={month} disabled={disabled} onChange={e=>onMonth(e.target.value)} className={`${inputCls} mt-1`} /></label>
    <label>Tanggal posisi laporan Aging<input aria-label="Tanggal posisi laporan Aging" type="date" value={date} max={todayJakarta()} disabled={disabled} onChange={e=>onDate(e.target.value)} className={`${inputCls} mt-1`} /></label>
  </div>;
}
