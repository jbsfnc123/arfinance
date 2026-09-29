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
      <div data-inert-exempt className="pointer-events-none fixed right-4 z-(--z-toast) flex max-w-sm flex-col gap-2" style={{ bottom: "calc(var(--dock-reserve) + 8px)" }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`glass pop-in whitespace-pre-line rounded-2xl px-4 py-3 text-sm ${STYLE[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
