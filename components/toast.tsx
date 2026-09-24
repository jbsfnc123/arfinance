"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "danger" | "warning" | "info";
type Toast = { id: number; message: string; type: ToastType };

const ToastContext = createContext<(message: string, type?: ToastType, ms?: number) => void>(() => {});

const STYLE: Record<ToastType, string> = {
  success: "border-success/40 text-success",
  danger: "border-danger/40 text-danger",
  warning: "border-warning/40 text-warning",
  info: "border-accent/40 text-accent",
};

// Port toast Script.html: 4 jenis, default 3,5 detik, baris baru ditampilkan.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "info", ms = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`whitespace-pre-line rounded-xl border bg-surface px-4 py-3 text-sm shadow-lg ${STYLE[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
