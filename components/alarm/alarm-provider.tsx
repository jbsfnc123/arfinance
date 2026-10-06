"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { btnPrimary, inputCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { todayJakarta } from "@/lib/parsers/date";
import { getAlarmContext, saveAlarmAccess, sendAlarm } from "@/lib/alarm/actions";
import { alarmDelivery, alarmTime, dueAlarms, type AlarmContext, type AlarmDelivery, type PendingAlarm } from "@/lib/alarm/model";

const AlarmUi = createContext<{ open: () => void } | null>(null);
const fmt = (value: number) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }).format(value);

export function AlarmMenuButton({ className, onOpen }: { className?: string; onOpen?: () => void }) {
  const alarm = useContext(AlarmUi);
  if (!alarm) return null;
  return <button type="button" className={className} onClick={() => { onOpen?.(); alarm.open(); }}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>Alarm</button>;
}

export function AlarmProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<AlarmContext | null>(null);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [incoming, setIncoming] = useState<AlarmDelivery[]>([]);
  const [pending, setPending] = useState<PendingAlarm[]>([]);
  const pendingRef = useRef<PendingAlarm[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [date, setDate] = useState(() => todayJakarta());
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const [grants, setGrants] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const active = useRef(true);

  const updatePending = useCallback((change: (rows: PendingAlarm[]) => PendingAlarm[]) => {
    pendingRef.current = change(pendingRef.current);
    setPending(pendingRef.current);
  }, []);

  useEffect(() => {
    active.current = true;
    const db = createClient();
    let stopped = false;
    let channel: ReturnType<typeof db.channel> | undefined;
    const seen = new Set<string>();
    const clear = () => {
      if (channel) { void db.removeChannel(channel); channel = undefined; }
      setConnected(false);
      updatePending(() => []);
      setIncoming([]);
      setMessage("");
      setOpen(false);
      setContext(null);
    };
    let owner: string | undefined;
    const { data: auth } = db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (owner && session?.user.id && session.user.id !== owner)) {
        active.current = false; clear();
      }
    });
    void getAlarmContext().then(async (data) => {
      if (stopped || !active.current) return;
      owner = data.userId;
      setContext(data); setGrants(data.senderIds);
      await db.realtime.setAuth();
      if (stopped || !active.current) return;
      channel = db.channel(`alarm:${data.userId}`, { config: { private: true } })
        .on("broadcast", { event: "alarm" }, ({ payload }) => {
          const parsed = alarmDelivery.safeParse(payload);
          if (!parsed.success || parsed.data.recipientId !== data.userId || seen.has(parsed.data.id)) return;
          seen.add(parsed.data.id);
          if (seen.size > 500) seen.delete(seen.values().next().value!);
          setOpen(false);
          setIncoming((rows) => [...rows, parsed.data]);
        }).subscribe((status) => { if (!stopped) setConnected(status === "SUBSCRIBED"); });
    }).catch(() => { if (!stopped) setError("Koneksi Alarm belum tersedia. Muat ulang aplikasi untuk mencoba kembali."); });
    return () => {
      stopped = true; active.current = false;
      auth.subscription.unsubscribe();
      if (channel) void db.removeChannel(channel);
      pendingRef.current = [];
    };
  }, [updatePending]);

  useEffect(() => {
    async function tick() {
      if (!active.current) return;
      const ready = dueAlarms(pendingRef.current, Date.now());
      if (!ready.length) return;
      // Claim jobs before awaiting the network: repeated ticks cannot send twice.
      updatePending((rows) => rows.map((r) => ready.some((a) => a.id === r.id) ? { ...r, status: "sending" } : r));
      for (const alarm of ready) {
        if (!active.current) break;
        try {
          const result = await sendAlarm(alarm);
          if (active.current) updatePending((rows) => rows.map((r) => r.id === alarm.id ? { ...r, status: result.ok ? "sent" : "failed", error: result.error } : r));
        } catch {
          if (active.current) updatePending((rows) => rows.map((r) => r.id === alarm.id ? { ...r, status: "failed", error: "Pengiriman gagal. Periksa koneksi dan sesi login." } : r));
        }
      }
    }
    const interval = setInterval(() => { if (pendingRef.current.some((a) => a.status === "waiting")) void tick(); }, 1000);
    const wake = () => { if (document.visibilityState === "visible") void tick(); };
    const warn = (e: BeforeUnloadEvent) => {
      if (pendingRef.current.some((a) => a.status === "waiting" || a.status === "sending")) { e.preventDefault(); e.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("beforeunload", warn);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", wake); window.removeEventListener("beforeunload", warn); };
  }, [updatePending]);

  async function show() {
    setOpen(true); setError(""); setNotice(""); setDate(todayJakarta());
    try {
      const data = await getAlarmContext();
      if (!active.current) return;
      setContext(data); setGrants(data.senderIds);
    } catch { setError("Gagal membaca akses Alarm. Periksa koneksi Anda."); }
  }

  function schedule(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNotice("");
    const dueAt = alarmTime(date, time);
    if (!context?.canSend) return setError("Anda belum diberi akses mengirim Alarm.");
    if (!Number.isFinite(dueAt) || dueAt <= Date.now()) return setError("Pilih tanggal dan jam yang belum lewat (WIB).");
    const recipient = context.accounts.find((a) => a.id === recipientId);
    if (!recipient || !message.trim()) return setError("Pilih penerima dan isi pesan.");
    if (pendingRef.current.length >= 20) return setError("Maksimal 20 Alarm per sesi. Hapus Alarm yang sudah selesai.");
    updatePending((rows) => [...rows, { id: crypto.randomUUID(), recipientId, recipientName: recipient.name, message: message.trim(), dueAt, status: "waiting" }]);
    setMessage(""); setNotice("Alarm dijadwalkan pada tab ini. Pastikan aplikasi kedua pihak tetap terbuka.");
  }

  async function saveAccess() {
    setSaving(true); setError(""); setNotice("");
    try { await saveAlarmAccess(grants); setNotice("Akses pengirim Alarm tersimpan. Super Admin selalu memiliki akses."); }
    catch { setError("Gagal menyimpan akses Alarm."); }
    finally { setSaving(false); }
  }

  const current = incoming[0];
  return <AlarmUi.Provider value={{ open: () => { void show(); } }}>
    {children}
    <Modal open={open} onClose={() => setOpen(false)} title="Alarm">
      <div className="space-y-4">
        <p className="text-xs text-fg-2">{connected ? "Notifikasi terhubung" : "Notifikasi belum terhubung"} · Zona waktu WIB</p>
        <p className="rounded-lg bg-surface-2 p-3 text-xs text-fg-2">Pesan dan jadwal hanya tersimpan di memori tab ini. Refresh, tutup tab, logout, atau pindah workspace akan menghapusnya. Perangkat tidur dapat menunda alarm; penerima harus membuka aplikasi saat pengiriman.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {notice && <p role="status" className="text-sm text-success">{notice}</p>}
        {context?.canSend ? <form onSubmit={schedule} className="space-y-3">
          <label className="block text-sm">Penerima<select required className={`${inputCls} mt-1 w-full`} value={recipientId} onChange={(e) => setRecipientId(e.target.value)}><option value="">Pilih akun</option>{context.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Tanggal<input aria-label="Tanggal Alarm" type="date" required min={todayJakarta()} value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} mt-1 w-full`} /></label>
            <label className="text-sm">Jam (WIB)<input aria-label="Jam Alarm" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={`${inputCls} mt-1 w-full`} /></label>
          </div>
          <label className="block text-sm">Pesan<textarea required maxLength={2000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} mt-1 w-full`} /></label>
          <button type="submit" className={btnPrimary}>Jadwalkan Alarm</button>
        </form> : <p className="text-sm">Akses mengirim Alarm diberikan oleh Super Admin. Anda tetap dapat menerima Alarm.</p>}
        {pending.length > 0 && <section aria-label="Alarm sesi ini" className="space-y-2"><h3 className="text-sm font-semibold">Alarm sesi ini</h3>{pending.map((a) => <div key={a.id} className="rounded-lg border border-hairline p-3 text-xs">
          <b>{a.recipientName}</b> · {fmt(a.dueAt)} WIB
          <p className="mt-1 whitespace-pre-wrap break-words">{a.message}</p>
          <p className="mt-1 text-fg-2">{a.status === "waiting" ? "Menunggu" : a.status === "sending" ? "Mengirim…" : a.status === "sent" ? "Dikirim ke saluran — penerimaan belum dikonfirmasi" : a.error}</p>
          {a.status === "failed" && <button type="button" className="mr-3 mt-2 text-accent" onClick={() => updatePending((rows) => rows.map((r) => r.id === a.id ? { ...r, status: "waiting", error: undefined } : r))}>Coba lagi</button>}
          <button type="button" disabled={a.status === "sending"} className="mt-2 text-accent disabled:opacity-40" onClick={() => updatePending((rows) => rows.filter((r) => r.id !== a.id))}>{a.status === "waiting" ? "Batalkan" : "Hapus"}</button>
        </div>)}</section>}
        {context?.isAdmin && <details className="border-t border-hairline pt-3"><summary className="cursor-pointer text-sm font-semibold">Akses pengirim Alarm</summary><p className="my-2 text-xs text-fg-2">Centang akun yang boleh membuat Alarm. Semua akun aktif dapat menerima pesan.</p><div className="max-h-48 space-y-2 overflow-auto">{context.accounts.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={grants.includes(a.id)} onChange={(e) => setGrants((ids) => e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id))} />{a.name}</label>)}</div><button type="button" onClick={saveAccess} disabled={saving} className={`${btnPrimary} mt-3`}>{saving ? "Menyimpan…" : "Simpan akses"}</button></details>}
      </div>
    </Modal>
    <Modal open={!!current} title="Alarm masuk" onClose={() => setIncoming((rows) => rows.slice(1))} footer={<button type="button" className={btnPrimary} onClick={() => setIncoming((rows) => rows.slice(1))}>Mengerti</button>}>
      {current && <div role="alert" className="space-y-3"><p className="text-sm text-fg-2">Dari <b className="text-fg">{current.senderName}</b> · {fmt(current.dueAt)} WIB</p><p className="whitespace-pre-wrap break-words text-base">{current.message}</p>{incoming.length > 1 && <p className="text-xs text-fg-2">{incoming.length - 1} pesan berikutnya</p>}</div>}
    </Modal>
  </AlarmUi.Provider>;
}
