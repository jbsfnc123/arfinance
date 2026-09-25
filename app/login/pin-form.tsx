"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { loginWithPin, type LoginState } from "./actions";
import { PIN_LENGTH } from "@/lib/auth/constants";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

// Langkah 2 login: keypad PIN untuk nama yang sudah dipilih di langkah 1 (NameStep).
export function PinForm({ initialError, name, next, onChangeName }: {
  initialError: string | null; name: string; next: string; onChangeName: () => void;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginWithPin, null);
  const [pin, setPin] = useState("");
  const [handledAt, setHandledAt] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const error = state?.error ?? initialError;

  // Kosongkan PIN setiap kali server menolak (sekali per respons).
  if (state && state.at !== handledAt) {
    setHandledAt(state.at);
    setPin("");
  }

  // Kirim otomatis begitu digit ke-6 terisi.
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !pending) formRef.current?.requestSubmit();
  }, [pin, pending]);

  function press(key: string) {
    if (pending) return;
    if (key === "⌫") setPin((p) => p.slice(0, -1));
    else if (/^\d$/.test(key)) setPin((p) => (p.length < PIN_LENGTH ? p + key : p));
  }

  // Keyboard fisik (desktop) juga didukung.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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

      <div className="flex justify-center gap-2" aria-label="PIN" aria-live="polite">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <div
            key={i}
            className={`flex h-12 w-10 items-center justify-center rounded-lg border text-2xl ${
              i === pin.length && !pending ? "border-accent" : "border-line"
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
              className="h-14 rounded-xl bg-surface-2 text-xl font-medium hover:bg-line active:bg-pill disabled:opacity-50"
            >
              {key === "⌫" ? <span className="material-symbols-outlined">backspace</span> : key}
            </button>
          ),
        )}
      </div>
    </form>
  );
}
