"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useDialog } from "@/components/use-dialog";

import { CONSULTANT_URL } from "@/lib/consultant-config";
import { isChatOrigin, isWithin, menuLabel } from "@/lib/chat-context";
import { CHAT_BTN, chatPanelBox, clampB, saveChatPos, snapChatPos, useChatPos, useViewportH } from "@/lib/ui/chat-position";

export const CHAT_NAME = "AR Helpdesk";
export const POWERED_BY_URL = "https://otomatisasi.store";

// Logo OS otomatisasi.store (salinan public/brand/os-mark.svg di repo otomatisasi.store).
function OsMark({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" width={size} height={size} fill="none" className="shrink-0">
      <rect width="64" height="64" rx="16" fill="#172743" />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" stroke="#91BFFF" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="11.5" y="19" width="18" height="26" rx="9" stroke="#F7FBFF" strokeWidth="5" />
      <path d="M52 20H43a6 6 0 0 0 0 12h3a6 6 0 0 1 0 12H37" stroke="#91BFFF" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
export { CONSULTANT_URL } from "@/lib/consultant-config";

// Load the remote bot only after the first click. Keep its conversation when minimized.
// Display name and account ID scope greeting/memory. When the chat frame asks, it receives only the NAME of the page
// the user has open ({menu, path}) — never page data — and only the Apps Script frame inside this panel is answered.
// Tombol bisa digeser (Fase 67): tarik > 6 px = geser (bukan klik), dilepas → menempel ke tepi kiri/kanan; posisi disimpan per
// perangkat (lib/ui/chat-position.ts). Panel terbuka di atas tombol, atau di bawahnya bila tombol ada di separuh atas layar.
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

  const pos = useChatPos();
  const vh = useViewportH();
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const gesture = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    gesture.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return;
    if (!g.moved) {
      g.moved = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer sudah tidak aktif: geser tetap jalan tanpa capture */ }
    }
    setDrag({ x: Math.max(0, Math.min(innerWidth - CHAT_BTN, e.clientX - g.dx)), y: Math.max(0, Math.min(innerHeight - CHAT_BTN, e.clientY - g.dy)) });
  }
  function onPointerEnd(e: React.PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.moved) return;
    suppressClick.current = true; // klik yang menyusul pointerup bukan "buka chat"
    const x = Math.max(0, Math.min(innerWidth - CHAT_BTN, e.clientX - g.dx)), y = Math.max(0, Math.min(innerHeight - CHAT_BTN, e.clientY - g.dy));
    saveChatPos(snapChatPos(x, y, innerWidth, innerHeight));
    setDrag(null);
  }
  const edge = (side: "left" | "right") => ({ [side]: `max(8px, env(safe-area-inset-${side}, 0px))` });
  const side = pos?.side ?? "right";
  const btnStyle: React.CSSProperties = drag ? { left: drag.x, top: drag.y }
    : pos ? { ...edge(side), bottom: clampB(pos.b, vh) }
    : { ...edge("right"), bottom: "max(8px, env(safe-area-inset-bottom, 0px))" };
  const box = pos ? chatPanelBox(pos, vh) : null;
  const panelStyle: React.CSSProperties = box
    ? { ...edge(side), ...(box.top !== undefined ? { top: box.top } : { bottom: box.bottom }), height: box.height }
    : { ...edge("right"), bottom: "calc(max(8px, env(safe-area-inset-bottom, 0px)) + 52px)", height: "min(640px, calc(100dvh - env(safe-area-inset-bottom, 0px) - 80px))" };

  function close() { setOpen(false); trigger.current?.focus(); }
  useDialog(open, close, panel, { kind: "popover", layerRef: layer });
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);

  return <div ref={layer} className="fixed left-0 top-0 z-[41]" style={{ width: 0, height: 0 }}>
    {started && <section ref={panel} id="consultant-chat-panel" hidden={!open} role="dialog" aria-label={CHAT_NAME} aria-modal="false"
      className="fixed w-[min(400px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      style={panelStyle}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
          <a href={POWERED_BY_URL} target="_blank" rel="noopener noreferrer" aria-label="Powered by otomatisasi.store (buka situs)"
            className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 text-xs text-fg-2 hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">
            <OsMark />
            <span className="truncate">Powered by <b className="font-semibold text-fg">otomatisasi<span className="text-[#5b8fd6]">.store</span></b></span>
          </a>
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
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } if (open) close(); else { setStarted(true); setOpen(true); } }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
      onDoubleClick={() => { if (pos) saveChatPos(null); }}
      style={btnStyle}
      className={`fixed flex h-11 w-11 touch-none select-none items-center justify-center rounded-full border border-white/20 bg-[#25d366] text-white shadow-lg hover:bg-[#1fba59] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${drag ? "scale-110 cursor-grabbing shadow-2xl" : "transition-[background-color,box-shadow,transform]"}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></svg>
    </button>
  </div>;
}
