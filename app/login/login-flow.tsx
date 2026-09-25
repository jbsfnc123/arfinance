"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { searchNames } from "./actions";
import { PinForm } from "./pin-form";
import { inputCls } from "@/components/ui";

const KEY_NAME = "login:name";
const readName = () => { try { return localStorage.getItem(KEY_NAME) ?? ""; } catch { return ""; } };
const saveName = (v: string) => { try { if (v) localStorage.setItem(KEY_NAME, v); else localStorage.removeItem(KEY_NAME); } catch { /* opsional */ } };
const noop = () => () => {};

// Login dua langkah: (1) cari & pilih Nama dari akun terdaftar, (2) PIN.
// Nama terakhir diingat per perangkat sehingga login berikutnya langsung ke PIN.
export function LoginFlow({ initialError, next }: { initialError: string | null; next: string }) {
  const remembered = useSyncExternalStore(noop, readName, () => "");
  const [chosen, setChosen] = useState<string | null>(null);
  const name = chosen ?? remembered;

  if (!name) return <NameStep onPick={(n) => { saveName(n); setChosen(n); }} />;
  return <PinForm key={name} initialError={initialError} name={name} next={next}
    onChangeName={() => { saveName(""); setChosen(""); }} />;
}

function NameStep({ onPick }: { onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const query = q.trim();

  // Saran dicari 250 ms setelah berhenti mengetik (≥ 2 huruf); jawaban lama diabaikan.
  useEffect(() => {
    if (query.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchNames(query).catch(() => []);
      if (id !== seq.current) return;
      setItems(res);
      setActive(0);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const shown = query.length < 2 ? [] : items;
  const exact = shown.find((n) => n.toLowerCase() === query.toLowerCase());

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const pick = shown[active] ?? exact;
      if (pick) onPick(pick);
    }
  }

  return (
    <div className="mt-6 text-left">
      <label htmlFor="login-name" className="text-sm text-fg-2">Nama</label>
      <input id="login-name" autoFocus autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
        placeholder="Ketik minimal 2 huruf…" className={`${inputCls} mt-1`} role="combobox" aria-expanded={shown.length > 0}
        aria-controls="login-name-list" />
      <ul id="login-name-list" role="listbox" className="mt-2 space-y-1">
        {shown.map((n, i) => (
          <li key={n} role="option" aria-selected={i === active}>
            <button type="button" onClick={() => onPick(n)} onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-pill text-pill-fg" : "hover:bg-surface-2"}`}>
              <span className="material-symbols-outlined !text-lg">person</span>
              {n}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 h-5 text-center text-xs text-fg-2">
        {query.length >= 2 && !loading && shown.length === 0 ? "Nama tidak ditemukan." : loading ? "Mencari…" : ""}
      </p>
    </div>
  );
}
