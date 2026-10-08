"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { loginWithPin, type LoginState } from "./actions";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { weakPin } from "@/lib/auth/pin-rules";
import { Icon } from "@/components/icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
type Mode = "check" | "pin" | "setup" | "confirm" | "nopin";

// Langkah 2 login. Kolektor "tanpa PIN" → tombol Masuk. Akun lain: status akun dicek dulu (tanpa PIN) →
// sudah punya PIN → keypad PIN; belum punya PIN → WAJIB membuat PIN (isi lalu ulangi) sebelum masuk (Fase 54).
export function PinForm({ initialError, name, noPin, next, onChangeName }: {
  initialError: string | null; name: string; noPin: boolean; next: string; onChangeName: () => void;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginWithPin, null);
  const [mode, setMode] = useState<Mode>(noPin ? "nopin" : "check");
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState(""); // PIN baru yang harus diulang
  const [localError, setLocalError] = useState<string | null>(null);
  const [handledAt, setHandledAt] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const checkRef = useRef<HTMLFormElement>(null);
  const error = localError ?? state?.error ?? initialError;

  // Respons server (sekali per respons): tentukan langkah berikutnya & kosongkan PIN.
  if (state && state.at !== handledAt) {
    setHandledAt(state.at);
    setPin("");
    setLocalError(null);
    if (state.needSetup) { setMode("setup"); setFirst(""); }
    else if (state.needPin) setMode("pin");
    else if (mode === "check") setMode("pin");
  }

  // Cek status PIN akun sekali saat nama dipilih (kolektor tanpa PIN tidak perlu).
  useEffect(() => { if (mode === "check") checkRef.current?.requestSubmit(); }, [mode]);

  // Berhasil masuk ke host yang sama → muat penuh agar workspace di-rewrite oleh proxy.
  useEffect(() => { if (state?.go) window.location.replace(state.go); }, [state]);

  // Digit ke-6: login, atau kirim pembuatan PIN bila PIN ulangan sama.
  useEffect(() => {
    if (pin.length !== PIN_LENGTH || pending) return;
    if (mode === "pin" || (mode === "confirm" && pin === first)) formRef.current?.requestSubmit();
  }, [pin, pending, mode, first]);

  const keypad = mode === "pin" || mode === "setup" || mode === "confirm";
  function press(key: string) {
    if (pending || !keypad) return;
    setLocalError(null);
    if (key === "⌫") return setPin((p) => p.slice(0, -1));
    if (!/^\d$/.test(key) || pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    if (next.length < PIN_LENGTH || mode === "pin") return setPin(next);
    if (mode === "setup") {
      // PIN baru lengkap → cek kekuatan → minta diulang.
      const weak = weakPin(next);
      if (weak) { setLocalError(weak); setPin(""); return; }
      setFirst(next); setPin(""); setMode("confirm");
    } else if (next !== first) {
      setLocalError("PIN tidak sama. Buat ulang dari awal."); setPin(""); setFirst(""); setMode("setup");
    } else setPin(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const title = mode === "setup" ? "Buat PIN baru (6 digit)" : mode === "confirm" ? "Ulangi PIN baru" : null;

  return (
    <div className="mt-6">
      <form ref={checkRef} action={action} hidden>
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="next" value={next} />
      </form>
      <form ref={formRef} action={action}>
        <input type="hidden" name="pin" value={pin} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="next" value={next} />
        {mode === "confirm" && <input type="hidden" name="setup" value="1" />}

        <p className="mb-4 text-sm">
          Masuk sebagai <b>{name}</b> ·{" "}
          <button type="button" onClick={onChangeName} className="text-accent underline" disabled={pending}>Ganti</button>
        </p>

        {mode === "check" && <p className="text-sm text-fg-2" role="status">Memeriksa akun…</p>}

        {mode === "nopin" && (
          <>
            <button type="submit" disabled={pending}
              className="h-12 w-full rounded-xl bg-accent-fill text-base font-medium text-on-accent hover:bg-accent-fill-hover disabled:opacity-60">
              {pending ? "Memeriksa…" : "Masuk"}
            </button>
            <p className="mt-3 min-h-5 text-sm text-danger" role="alert">{pending ? "" : error}</p>
          </>
        )}

        {keypad && (<>
          {title && (
            <div className="mb-3 rounded-xl bg-accent/10 px-3 py-2 text-left text-sm">
              <b>{title}</b>
              {mode === "setup" && <span className="block text-xs text-fg-2">Akun ini belum punya PIN. Buat PIN untuk masuk ke aplikasi.</span>}
            </div>
          )}
          <div className="flex justify-center gap-2" aria-label="PIN" aria-live="polite">
            {Array.from({ length: PIN_LENGTH }, (_, i) => (
              <div key={i}
                className={`flex h-12 w-10 items-center justify-center rounded-[10px] border text-2xl transition-colors ${
                  i === pin.length && !pending ? "border-accent-tint shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-tint)_22%,transparent)]" : "border-line"
                } bg-surface-2`}>
                {i < pin.length ? "•" : ""}
              </div>
            ))}
          </div>
          <p className="mt-3 h-5 text-sm text-danger" role="alert">
            {pending ? <span className="text-fg-2">Memeriksa…</span> : error}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {KEYS.map((key, i) =>
              key === "" ? <span key={i} /> : (
                <button key={i} type="button" onClick={() => press(key)} disabled={pending} aria-label={key === "⌫" ? "Hapus" : key}
                  className="h-14 rounded-[14px] bg-fg/[0.07] text-xl font-medium tabular-nums transition-colors hover:bg-fg/[0.11] active:bg-fg/[0.18] disabled:opacity-50">
                  {key === "⌫" ? <Icon name="backspace" size={20} /> : key}
                </button>
              ),
            )}
          </div>
        </>)}
      </form>
    </div>
  );
}
