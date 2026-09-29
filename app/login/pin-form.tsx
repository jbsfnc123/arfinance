"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { loginWithPin, type LoginState } from "./actions";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { Icon } from "@/components/icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

// Langkah 2 login: akun "Login tanpa PIN" → hanya tombol Masuk; akun ber-PIN → langsung keypad PIN.
// (Bila status akun berubah sejak halaman dimuat dan server meminta PIN, keypad ikut tampil.)
export function PinForm({ initialError, name, noPin, next, onChangeName }: {
  initialError: string | null; name: string; noPin: boolean; next: string; onChangeName: () => void;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginWithPin, null);
  const [pin, setPin] = useState("");
  const [handledAt, setHandledAt] = useState<number | null>(null);
  const [usePin, setUsePin] = useState(!noPin);
  const formRef = useRef<HTMLFormElement>(null);
  const error = state?.error ?? initialError;

  // Kosongkan PIN setiap kali server menolak (sekali per respons).
  if (state && state.at !== handledAt) {
    setHandledAt(state.at);
    setPin("");
    if (state.needPin && !usePin) setUsePin(true);
  }

  // Berhasil masuk ke host yang sama → muat penuh agar workspace di-rewrite oleh proxy.
  useEffect(() => {
    if (state?.go) window.location.replace(state.go);
  }, [state]);

  // Kirim otomatis begitu digit ke-6 terisi.
  useEffect(() => {
    if (usePin && pin.length === PIN_LENGTH && !pending) formRef.current?.requestSubmit();
  }, [pin, pending, usePin]);

  function press(key: string) {
    if (pending) return;
    if (key === "⌫") setPin((p) => p.slice(0, -1));
    else if (/^\d$/.test(key)) setPin((p) => (p.length < PIN_LENGTH ? p + key : p));
  }

  // Keyboard fisik (desktop) juga didukung.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!usePin) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <form ref={formRef} action={action} className="mt-6">
      <input type="hidden" name="pin" value={pin} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="next" value={next} />

      <p className="mb-4 text-sm">
        Masuk sebagai <b>{name}</b> ·{" "}
        <button type="button" onClick={onChangeName} className="text-accent underline" disabled={pending}>Ganti</button>
      </p>

      {!usePin && (
        <>
          <button type="submit" disabled={pending}
            className="h-12 w-full rounded-xl bg-accent-fill text-base font-medium text-on-accent hover:bg-accent-fill-hover disabled:opacity-60">
            {pending ? "Memeriksa…" : "Masuk"}
          </button>
          <p className="mt-3 min-h-5 text-sm text-danger" role="alert">{pending ? "" : error}</p>
        </>
      )}
      {usePin && (<>

      <div className="flex justify-center gap-2" aria-label="PIN" aria-live="polite">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <div
            key={i}
            className={`flex h-12 w-10 items-center justify-center rounded-[10px] border text-2xl transition-colors ${
              i === pin.length && !pending ? "border-accent-tint shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-tint)_22%,transparent)]" : "border-line"
            } bg-surface-2`}
          >
            {i < pin.length ? "•" : ""}
          </div>
        ))}
      </div>

      <p className="mt-3 h-5 text-sm text-danger" role="alert">
        {pending ? <span className="text-fg-2">Memeriksa…</span> : error}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              disabled={pending}
              aria-label={key === "⌫" ? "Hapus" : key}
              className="h-14 rounded-[14px] bg-fg/[0.07] text-xl font-medium tabular-nums transition-colors hover:bg-fg/[0.11] active:bg-fg/[0.18] disabled:opacity-50"
            >
              {key === "⌫" ? <Icon name="backspace" size={20} /> : key}
            </button>
          ),
        )}
      </div>
      </>)}
    </form>
  );
}
