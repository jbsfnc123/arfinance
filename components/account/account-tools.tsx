"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { weakPin } from "@/lib/auth/pin-rules";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icons";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";

// Menu akun (Fase 54): foto profil sendiri + Ganti PIN. Dipakai AR, Finance, dan Aplikasi Kolektor.

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Foto profil (signed URL dari server) atau inisial. */
export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size / 3.2)) };
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element -- signed URL Supabase berumur pendek, tidak melalui optimizer
    return <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" style={style} />;
  }
  return <span className="flex shrink-0 items-center justify-center rounded-full bg-accent/20 font-semibold text-accent" style={style} aria-hidden>{initials(name)}</span>;
}

const PIN_STATUS: Record<string, string> = {
  wrong_old: "PIN lama salah.",
  same: "PIN baru sama dengan PIN lama.",
  invalid_new: "PIN baru harus 6 digit angka.",
  locked: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
  denied: "Sesi berakhir. Silakan masuk ulang.",
};

type Tools = { changePin: () => void; pickPhoto: () => void; removePhoto: () => void; busy: boolean; hasPhoto: boolean; error: string | null };
const Ctx = createContext<Tools | null>(null);
export const useAccountTools = () => useContext(Ctx);

/**
 * Dialog Ganti PIN + pemilih foto dirender DI LUAR popover menu akun (popover tertutup saat item diklik).
 * Item menu memanggil useAccountTools().
 */
export function AccountToolsProvider({ userId, hasPhoto, children }: { userId: string; hasPhoto: boolean; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/^image\//.test(file.type)) return setError("Pilih file gambar.");
    setBusy(true);
    try {
      const blob = await compressImage(file, 256, 0.85);
      const path = `${userId}/${Date.now()}.jpg`;
      const up = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw up.error;
      const { error: e2 } = await supabase.rpc("set_my_avatar" as never, { p_path: path } as never);
      if (e2) throw e2;
      // Foto lama dibuang agar tidak menumpuk.
      const { data: list } = await supabase.storage.from("avatars").list(userId);
      const old = (list ?? []).map((f) => `${userId}/${f.name}`).filter((x) => x !== path);
      if (old.length) await supabase.storage.from("avatars").remove(old);
      router.refresh();
    } catch (e) {
      setError(`Gagal mengganti foto: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function removePhoto() {
    setBusy(true);
    const { data: list } = await supabase.storage.from("avatars").list(userId);
    if (list?.length) await supabase.storage.from("avatars").remove(list.map((f) => `${userId}/${f.name}`));
    await supabase.rpc("set_my_avatar" as never, { p_path: null } as never);
    setBusy(false);
    router.refresh();
  }

  const tools: Tools = { changePin: () => setPinOpen(true), pickPhoto: () => input.current?.click(), removePhoto: () => void removePhoto(), busy, hasPhoto, error };
  return (
    <Ctx.Provider value={tools}>
      {children}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Pilih foto profil" onChange={(e) => void pick(e.target.files?.[0])} />
      <ChangePinDialog open={pinOpen} onClose={() => setPinOpen(false)} />
    </Ctx.Provider>
  );
}

/** Item menu akun: Ganti foto, Hapus foto, Ganti PIN. */
export function AccountMenuItems({ className, onPick }: { className?: string; onPick?: () => void }) {
  const t = useAccountTools();
  if (!t) return null;
  return (
    <>
      <button type="button" className={className} disabled={t.busy} onClick={() => { onPick?.(); t.pickPhoto(); }}>
        <Icon name="photo" size={17} />{t.busy ? "Mengunggah foto…" : t.hasPhoto ? "Ganti foto profil" : "Pasang foto profil"}
      </button>
      {t.hasPhoto && !t.busy && (
        <button type="button" className={className} onClick={() => { onPick?.(); t.removePhoto(); }}>
          <Icon name="hide_image" size={17} />Hapus foto profil
        </button>
      )}
      <button type="button" className={className} onClick={() => { onPick?.(); t.changePin(); }}>
        <Icon name="lock" size={17} />Ganti PIN
      </button>
      {t.error && <p role="alert" className="px-2.5 py-1 text-xs text-danger">{t.error}</p>}
    </>
  );
}

/** Dialog Ganti PIN (PIN lama, PIN baru, ulangi). */
function ChangePinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [v, setV] = useState({ old: "", next: "", again: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = (s: string) => s.replace(/\D/g, "").slice(0, 6);
  const close = () => { onClose(); setV({ old: "", next: "", again: "" }); setMsg(null); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (v.next !== v.again) return setMsg({ ok: false, text: "Ulangi PIN baru tidak sama." });
    const weak = weakPin(v.next);
    if (weak) return setMsg({ ok: false, text: weak });
    setBusy(true);
    const { data, error } = await supabase.rpc("change_my_pin" as never, { p_old: v.old || null, p_new: v.next } as never);
    setBusy(false);
    const status = (data as { status?: string } | null)?.status;
    if (error || status !== "ok") return setMsg({ ok: false, text: error ? "Gagal mengganti PIN. Coba lagi." : PIN_STATUS[status ?? ""] ?? "Gagal mengganti PIN." });
    setMsg({ ok: true, text: "PIN berhasil diganti. Gunakan PIN baru saat masuk berikutnya." });
    setV({ old: "", next: "", again: "" });
  }

  const field = (key: "old" | "next" | "again", label: string) => (
    <label className="block text-sm">
      <span className="text-fg-2">{label}</span>
      <input type="password" inputMode="numeric" autoComplete={key === "old" ? "current-password" : "new-password"} maxLength={6}
        value={v[key]} onChange={(e) => setV({ ...v, [key]: digits(e.target.value) })} className={`${inputCls} mt-1 tracking-[0.4em]`}
        aria-label={label} />
    </label>
  );

  return (
    <Modal open={open} title="Ganti PIN" onClose={close}
      footer={<>
        <button type="button" className={btnGhost} onClick={close}>{msg?.ok ? "Tutup" : "Batal"}</button>
        {!msg?.ok && <button type="submit" form="change-pin-form" className={btnPrimary} disabled={busy || v.next.length !== 6 || v.again.length !== 6}>{busy ? "Menyimpan…" : "Simpan PIN"}</button>}
      </>}>
      <form id="change-pin-form" onSubmit={submit} className="space-y-3">
        {field("old", "PIN lama")}
        {field("next", "PIN baru (6 digit)")}
        {field("again", "Ulangi PIN baru")}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      </form>
    </Modal>
  );
}
