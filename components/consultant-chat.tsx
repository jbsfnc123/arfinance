"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useDialog } from "@/components/use-dialog";

import { CONSULTANT_URL } from "@/lib/consultant-config";
import { isChatOrigin, isWithin, menuLabel } from "@/lib/chat-context";

export const CHAT_NAME = "AR Helpdesk";
export { CONSULTANT_URL } from "@/lib/consultant-config";

// Load the remote bot only after the first click. Keep its conversation when minimized.
// Display name and account ID scope greeting/memory. When the chat frame asks, it receives only the NAME of the page
// the user has open ({menu, path}) — never page data — and only the Apps Script frame inside this panel is answered.
export function ConsultantChat({ accountName = "", accountId = "" }: { accountName?: string; accountId?: string }) {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const chatUrl = new URL(CONSULTANT_URL);
  if (accountName.trim()) chatUrl.searchParams.set("account", accountName.trim());
  if (accountId) chatUrl.searchParams.set("accountId", accountId);

  const path = usePathname() ?? "/";
  const iframe = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const d = event.data as { type?: unknown; id?: unknown } | null;
      if (!d || d.type !== "qna:context:request" || typeof d.id !== "string" || d.id.length > 40) return;
      if (!isChatOrigin(event.origin) || !isWithin(iframe.current?.contentWindow, event.source)) return;
      (event.source as Window).postMessage({ type: "qna:context", id: d.id, context: { menu: menuLabel(path), path } }, event.origin);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [path]);

  function close() { setOpen(false); trigger.current?.focus(); }
  useDialog(open, close, panel, { kind: "popover", layerRef: layer });
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);

  return <div ref={layer} className="fixed z-[41] flex flex-col items-end gap-2" style={{ right: "max(8px, env(safe-area-inset-right, 0px))", bottom: "max(8px, env(safe-area-inset-bottom, 0px))" }}>
    {started && <section ref={panel} id="consultant-chat-panel" hidden={!open} role="dialog" aria-label={CHAT_NAME} aria-modal="false"
      className="w-[min(400px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      style={{ height: "min(640px, calc(100dvh - env(safe-area-inset-bottom, 0px) - 80px))" }}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
          <span className="text-sm font-semibold">{CHAT_NAME}</span>
          <button ref={closeButton} type="button" onClick={close} aria-label="Tutup chat" className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-fg/5 focus-visible:outline-2 focus-visible:outline-accent">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        {!loaded && <p role="status" className="px-3 py-2 text-xs text-fg-2">Memuat chatbot…</p>}
        <iframe src={chatUrl.href} ref={iframe} title={`Percakapan dengan ${CHAT_NAME}`} onLoad={() => setLoaded(true)}
          className="min-h-0 w-full flex-1 border-0 bg-white" referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" />
      </div>
    </section>}
    <button ref={trigger} type="button" aria-label={open ? `Tutup ${CHAT_NAME}` : `Buka ${CHAT_NAME}`} aria-expanded={open}
      aria-controls={started ? "consultant-chat-panel" : undefined} title={CHAT_NAME}
      onClick={() => { if (open) close(); else { setStarted(true); setOpen(true); } }}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-[#25d366] text-white shadow-lg transition hover:bg-[#1fba59] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></svg>
    </button>
  </div>;
}
