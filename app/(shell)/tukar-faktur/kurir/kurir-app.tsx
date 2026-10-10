"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { compressImage } from "@/lib/image";
import { todayJakarta } from "@/lib/parsers/date";
import { fmtDate, rupiah } from "@/lib/format";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";

type Inv = { invoice_no: string; business_partner: string; payment_group: string; invoice_date: string | null; open_amt: number };

// Port aplikasi kurir (Tukar Faktur/Index.html): 1 nama kurir → 2 tanggal jadwal →
// 3 pilih Payment Group & toko → 4 centang invoice, foto tanda terima, simpan.
export function KurirApp({ ownName }: { ownName: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [step, setStep] = useState(ownName ? 2 : 1);
  const [kurir, setKurir] = useState(ownName ?? "");
  const [kurirList, setKurirList] = useState<string[]>([]);
  const [dates, setDates] = useState<{ send_date: string; invoices: number }[]>([]);
  const [date, setDate] = useState("");
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [pgFilter, setPgFilter] = useState<Set<string>>(new Set());
  const [tokos, setTokos] = useState<Set<string>>(new Set());
  const [qPg, setQPg] = useState("");
  const [qToko, setQToko] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [tanggal, setTanggal] = useState(todayJakarta());
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (ownName) return;
    supabase.rpc("courier_names").then(({ data }) => setKurirList((data ?? []).map((d) => d.name)));
  }, [ownName, supabase]);

  useEffect(() => {
    supabase.rpc("courier_dates").then(({ data, error }) => {
      if (error) toast(`Gagal memuat jadwal: ${error.message}`, "danger");
      setDates(data ?? []);
    });
  }, [supabase, toast, reloadKey]);

  // Invoice tanggal terpilih yang belum dikunjungi.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetchAll((a, b) => supabase
      .from("v_courier_pending")
      .select("invoice_no, business_partner, payment_group, invoice_date, open_amt")
      .eq("send_date", date)
      .order("invoice_no")
      .range(a, b))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast(`Gagal memuat invoice: ${error.message}`, "danger");
        setInvoices((data ?? []).map((s) => ({
          invoice_no: s.invoice_no, business_partner: s.business_partner ?? "", payment_group: s.payment_group ?? "Tanpa Grup",
          invoice_date: s.invoice_date, open_amt: Number(s.open_amt) || 0,
        })));
      });
    return () => {
      cancelled = true;
    };
  }, [date, supabase, toast, reloadKey]);

  const pgs = useMemo(() => [...new Set(invoices.map((i) => i.payment_group))].sort(), [invoices]);
  const tokoList = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of invoices) {
      if (pgFilter.size && !pgFilter.has(i.payment_group)) continue;
      if (i.business_partner) map.set(i.business_partner, (map.get(i.business_partner) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [invoices, pgFilter]);
  const selectedInv = invoices.filter((i) => tokos.has(i.business_partner));
  const doneCount = selectedInv.filter((i) => done.has(i.invoice_no)).length;

  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  async function submit() {
    if (!selectedInv.length) return;
    if (!tanggal) return toast("Tanggal diterima wajib diisi.", "warning");
    setBusy(true);
    try {
      let path = "";
      if (doneCount > 0 && photo) {
        const blob = await compressImage(photo);
        path = `${tanggal.slice(0, 4)}/${tanggal.slice(5, 7)}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("tanda-terima").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
      }
      const { data, error } = await supabase.rpc("courier_submit", {
        p_invoices: selectedInv.map((i) => ({ invoice_no: i.invoice_no, done: done.has(i.invoice_no) })),
        p_tanggal: tanggal,
        // Keterangan tukar faktur dihapus dari aplikasi kolektor (pakai Keterangan invoice bersama).
        p_ket_done: "",
        p_ket_pending: "",
        p_foto_path: path,
        p_kurir: kurir,
      });
      if (error) throw error;
      const res = data as { count: number; done: number; kode: string | null };
      toast(`Tersimpan: ${res.done} Done, ${res.count - res.done} Pending.${res.kode ? `\nKode tanda terima ${res.kode}` : ""}`, "success", 6000);
      setTokos(new Set());
      setDone(new Set());
      setPhoto(null);
      setReloadKey((k) => k + 1);
      setStep(3);
    } catch (e) {
      toast(`Gagal menyimpan: ${(e as Error).message}`, "danger", 6000);
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Kurir", "Jadwal", "Toko", "Invoice"];

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Icon name="local_shipping" size={22} className="text-accent" />Tukar Faktur Kurir</h1>
      <p className="text-sm text-fg-2">{kurir ? `Kurir: ${kurir}` : "Pilih nama kurir"}{date && ` · Jadwal ${fmtDate(date)}`}</p>

      <ol className="mt-4 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
              step === i + 1 ? "bg-accent-fill text-on-accent" : step > i + 1 ? "bg-success text-bg" : "bg-surface-2 text-fg-2"}`}>
              {i + 1}
            </span>
            <span className="hidden text-xs text-fg-2 sm:inline">{s}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      <div className={`${card} mt-4 p-4`}>
        {step === 1 && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-fg-2">Nama Kurir</span>
              <select value={kurir} onChange={(e) => setKurir(e.target.value)} className={`${inputCls} mt-1 min-h-11`}>
                <option value="">Pilih kurir…</option>
                {kurirList.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <input value={kurir} onChange={(e) => setKurir(e.target.value)} placeholder="…atau ketik nama kurir" className={`${inputCls} min-h-11`} />
            <button type="button" className={`${btnPrimary} min-h-11 w-full`} disabled={!kurir.trim()} onClick={() => setStep(2)}>Lanjut</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <div className="text-sm text-fg-2">Tanggal Jadwal Pengiriman</div>
            {dates.length === 0 && <p className="text-sm text-fg-2">Tidak ada jadwal yang belum dikunjungi.</p>}
            {dates.map((d) => (
              <button key={d.send_date} type="button"
                onClick={() => { setDate(d.send_date); setPgFilter(new Set()); setTokos(new Set()); setDone(new Set()); setStep(3); }}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${date === d.send_date ? "border-accent" : "border-line"} hover:bg-surface-2`}>
                <span className="font-medium">{fmtDate(d.send_date)}</span>
                <span className="text-sm text-fg-2">{d.invoices} invoice</span>
              </button>
            ))}
            {!ownName && <button type="button" className={`${btnGhost} min-h-11`} onClick={() => setStep(1)}>Kembali</button>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {pgs.length > 1 && (
              <div>
                <div className="mb-2 text-sm text-fg-2">Payment Group</div>
                {pgs.length > 8 && <input value={qPg} onChange={(e) => setQPg(e.target.value)} placeholder="Cari Payment Group…" aria-label="Cari Payment Group" className={`${inputCls} mb-2`} />}
                <div className="flex flex-wrap gap-2">
                  {pgs.filter((p) => p.toLowerCase().includes(qPg.toLowerCase())).map((p) => (
                    <button key={p} type="button" aria-pressed={pgFilter.has(p)} onClick={() => toggle(pgFilter, p, setPgFilter)}
                      className={`min-h-11 rounded-full border px-4 text-sm ${pgFilter.has(p) ? "border-accent bg-accent/15 text-accent" : "border-line"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 text-sm text-fg-2">Pilih toko yang dikunjungi</div>
              {tokoList.length > 8 && <input value={qToko} onChange={(e) => setQToko(e.target.value)} placeholder="Cari nama toko…" aria-label="Cari nama toko" className={`${inputCls} mb-2`} />}
              <div className="divide-y divide-line rounded-xl border border-line">
                {tokoList.filter(([t]) => t.toLowerCase().includes(qToko.toLowerCase())).map(([t, n]) => (
                  <label key={t} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm active:bg-surface-2">
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" checked={tokos.has(t)} onChange={() => toggle(tokos, t, setTokos)} />
                    <span className="flex-1 break-words">{t}</span>
                    <span className="shrink-0 text-xs text-fg-2">{n} inv</span>
                  </label>
                ))}
                {tokoList.length === 0 && <p className="p-3 text-sm text-fg-2">Semua invoice tanggal ini sudah diproses.</p>}
              </div>
            </div>
            <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 rounded-b-xl border-t border-line bg-surface p-3">
              <button type="button" className={`${btnGhost} min-h-11`} onClick={() => setStep(2)}>Kembali</button>
              <button type="button" className={`${btnPrimary} min-h-11 flex-1`} disabled={!tokos.size}
                onClick={() => { setDone(new Set(selectedInv.map((i) => i.invoice_no))); setStep(4); }}>
                Lanjut ({selectedInv.length} invoice)
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="text-sm">
              Centang = <b className="text-success">Done</b>, tidak dicentang = <b className="text-warning">Pending</b>
              <div className="text-fg-2">{doneCount} Done · {selectedInv.length - doneCount} Pending</div>
            </div>
            {[...tokos].sort().map((t) => {
              const list = selectedInv.filter((i) => i.business_partner === t);
              const all = list.every((i) => done.has(i.invoice_no));
              return (
                <div key={t} className="rounded-xl border border-line">
                  <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                    <span className="flex-1 break-words text-sm font-medium">{t}</span>
                    <button type="button" className="min-h-11 shrink-0 px-2 text-sm text-accent"
                      onClick={() => setDone((d) => { const n = new Set(d); for (const i of list) { if (all) n.delete(i.invoice_no); else n.add(i.invoice_no); } return n; })}>
                      {all ? "Kosongkan" : "Semua"}
                    </button>
                  </div>
                  <div className="divide-y divide-line">
                    {list.map((i) => (
                      <label key={i.invoice_no} className="flex min-h-14 items-center gap-3 px-3 py-2 active:bg-surface-2">
                        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" checked={done.has(i.invoice_no)} onChange={() => toggle(done, i.invoice_no, setDone)} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-all text-sm font-medium">{i.invoice_no}</span>
                          <span className="flex justify-between gap-2 text-xs text-fg-2">
                            <span>{fmtDate(i.invoice_date)}</span>
                            <span className="tabular-nums text-fg">{rupiah(i.open_amt)}</span>
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            <label className="block text-sm">
              <span className="text-fg-2">Foto Tanda Terima <span className="text-xs">(opsional)</span></span>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className={`${inputCls} mt-1 min-h-11`} />
            </label>
            <label className="block text-sm">
              <span className="text-fg-2">Tanggal Diterima <span className="text-danger">*</span></span>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={`${inputCls} mt-1 min-h-11`} />
            </label>
            <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 rounded-b-xl border-t border-line bg-surface p-3">
              <button type="button" className={`${btnGhost} min-h-11`} onClick={() => setStep(3)} disabled={busy}>Kembali</button>
              <button type="button" className={`${btnPrimary} min-h-11 flex-1`} disabled={busy} onClick={submit}>
                {busy ? "Menyimpan…" : `Simpan (${doneCount} Done, ${selectedInv.length - doneCount} Pending)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
