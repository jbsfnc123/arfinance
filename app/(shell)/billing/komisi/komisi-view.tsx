"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/tabs";
import { btnGhost, card, inputCls, segGroup, segItem, tableCls, td, th } from "@/components/ui";
import { Icon } from "@/components/icons";
import { rupiah } from "@/lib/format";
import { useViewState } from "@/lib/ui/view-state";
import { hitungKomisi, type Penerima } from "@/lib/modules/komisi/pph";

// Billing › Komisi dan Cashback. Tab Komisi = kalkulator PPh (tidak menyimpan data); Cashback menyusul.
type TabKey = "komisi" | "cashback";
type Baris = { id: number; ket: string; jumlah: string };

const TABS = [{ key: "komisi", label: "Komisi", icon: "receipt_long" }, { key: "cashback", label: "Cashback", icon: "payments" }] as const;
const PENERIMA: { key: Penerima; label: string }[] = [{ key: "orang", label: "Orang Pribadi (PPh 21)" }, { key: "badan", label: "Badan (PPh 23)" }];
const angka = (s: string) => Number(s.replace(/\D/g, "")) || 0;
const ribuan = (s: string) => { const n = angka(s); return n ? n.toLocaleString("id-ID") : ""; };

export function KomisiView() {
  const [tab, setTab] = useViewState<TabKey>("komisi:tab", "komisi");
  return (
    <div className="w-full space-y-4">
      <h1 className="text-[22px] font-semibold tracking-tight">Komisi dan Cashback</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "komisi" ? <Komisi /> : <p className="py-10 text-center text-sm text-fg-2">Segera hadir.</p>}
    </div>
  );
}

function Komisi() {
  const [penerima, setPenerima] = useState<Penerima>("orang");
  const [rows, setRows] = useState<Baris[]>([{ id: 1, ket: "", jumlah: "" }]);
  const hasil = useMemo(() => hitungKomisi(penerima, rows.map((r) => angka(r.jumlah))), [penerima, rows]);
  const set = (id: number, patch: Partial<Baris>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const tambah = () => setRows((rs) => [...rs, { id: Math.max(0, ...rs.map((r) => r.id)) + 1, ket: "", jumlah: "" }]);

  return (
    <div className="space-y-4">
      <div className={segGroup} role="radiogroup" aria-label="Penerima komisi">
        {PENERIMA.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={penerima === p.key} className={segItem(penerima === p.key)} onClick={() => setPenerima(p.key)}>{p.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:max-w-2xl sm:grid-cols-3" role="group" aria-label="Ringkasan PPh komisi">
        {([["Total Komisi", hasil.bruto, "text-fg"], ["Total PPh", hasil.pph, "text-danger"], ["Total Diterima", hasil.neto, "text-success"]] as const).map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-xs text-fg-2">{l}</div>
            <div className={`text-xl font-semibold tabular-nums ${c}`}>{rupiah(v)}</div>
          </div>
        ))}
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className={tableCls}>
          <thead><tr>
            <th className={th}>#</th><th className={th}>Keterangan</th><th className={`${th} text-right`}>Jumlah Komisi</th>
            <th className={`${th} text-right`}>DPP</th><th className={th}>Tarif</th><th className={`${th} text-right`}>PPh</th>
            <th className={`${th} text-right`}>Diterima</th><th className={th}><span className="sr-only">Aksi</span></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const h = hasil.rows[i];
              return (
                <tr key={r.id} className="border-t border-hairline">
                  <td className={`${td} text-fg-2`}>{i + 1}</td>
                  <td className={td}><input className={`${inputCls} w-48`} value={r.ket} aria-label={`Keterangan baris ${i + 1}`} onChange={(e) => set(r.id, { ket: e.target.value })} /></td>
                  <td className={td}><input className={`${inputCls} w-40 text-right tabular-nums`} inputMode="numeric" value={r.jumlah} aria-label={`Jumlah komisi baris ${i + 1}`}
                    onChange={(e) => set(r.id, { jumlah: ribuan(e.target.value) })} /></td>
                  <td className={`${td} text-right tabular-nums`}>{rupiah(h.dpp)}</td>
                  <td className={td}>{h.bruto ? h.tarif : "-"}</td>
                  <td className={`${td} text-right tabular-nums text-danger`}>{rupiah(h.pph)}</td>
                  <td className={`${td} text-right tabular-nums`}>{rupiah(h.neto)}</td>
                  <td className={td}>{rows.length > 1 && (
                    <button type="button" className={btnGhost} aria-label={`Hapus baris ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><Icon name="delete" /></button>
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnGhost} onClick={tambah}><Icon name="add" /> Tambah Baris</button>
        <button type="button" className={btnGhost} onClick={() => setRows([{ id: 1, ket: "", jumlah: "" }])}>Reset</button>
      </div>
    </div>
  );
}
