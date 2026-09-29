"use client";

import { useState, useSyncExternalStore } from "react";
import { PinForm } from "./pin-form";
import type { LoginName } from "@/lib/auth/login-names";
import { inputCls } from "@/components/ui";

const KEY_NAME = "login:name";
const readName = () => { try { return localStorage.getItem(KEY_NAME) ?? ""; } catch { return ""; } };
const saveName = (v: string) => { try { if (v) localStorage.setItem(KEY_NAME, v); else localStorage.removeItem(KEY_NAME); } catch { /* opsional */ } };
const noop = () => () => {};

// Login dua langkah: (1) pilih Nama dari dropdown akun halaman ini, (2) akun tanpa PIN → tombol Masuk;
// akun ber-PIN → langsung keypad PIN. Nama terakhir diingat per perangkat (bila masih ada di daftar halaman ini).
export function LoginFlow({ initialError, next, names, manual }: {
  initialError: string | null; next: string; names: LoginName[]; manual?: boolean;
}) {
  const remembered = useSyncExternalStore(noop, readName, () => "");
  const [chosen, setChosen] = useState<string | null>(null);
  const picked = names.find((n) => n.name === (chosen ?? remembered)) ?? null;

  // Alamat khusus (?admin): ketik nama → keypad PIN. Nama tidak disimpan/dipakai dari perangkat.
  if (manual) {
    if (!chosen) return <ManualNameStep onPick={setChosen} />;
    return <PinForm key={chosen} initialError={initialError} name={chosen} noPin={false} next={next} onChangeName={() => setChosen("")} />;
  }

  if (!picked) return <NameStep names={names} onPick={(n) => { saveName(n); setChosen(n); }} />;
  return <PinForm key={picked.name} initialError={initialError} name={picked.name} noPin={picked.noPin} next={next}
    onChangeName={() => { saveName(""); setChosen(""); }} />;
}

function NameStep({ names, onPick }: { names: LoginName[]; onPick: (name: string) => void }) {
  if (!names.length) return <p className="mt-6 text-sm text-fg-2">Belum ada akun. Hubungi Super Admin.</p>;
  return (
    <div className="mt-6 text-left">
      <label htmlFor="login-name" className="text-sm text-fg-2">Nama</label>
      <select id="login-name" autoFocus defaultValue="" onChange={(e) => e.target.value && onPick(e.target.value)}
        className={`${inputCls} mt-1 h-12 text-base`}>
        <option value="" disabled>Pilih nama…</option>
        {names.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
      </select>
    </div>
  );
}

function ManualNameStep({ onPick }: { onPick: (name: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="mt-6 text-left" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onPick(v.trim()); }}>
      <label htmlFor="login-manual" className="text-sm text-fg-2">Nama akun</label>
      <input id="login-manual" autoFocus autoComplete="off" spellCheck={false} value={v} onChange={(e) => setV(e.target.value)}
        className={`${inputCls} mt-1 h-12 text-base`} />
      <button type="submit" disabled={!v.trim()}
        className="mt-3 h-12 w-full rounded-xl bg-accent-fill text-base font-medium text-on-accent hover:bg-accent-fill-hover disabled:opacity-60">
        Lanjut
      </button>
    </form>
  );
}
