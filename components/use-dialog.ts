"use client";

import { useEffect, useRef, type RefObject } from "react";

// Perilaku overlay bersama (Modal, Spotlight, Launcher, Popover).
// - Tumpukan overlay tingkat modul: Escape hanya menutup overlay teratas.
// - modal: fokus masuk ([data-autofocus] → elemen fokus pertama → wadah), Tab terkurung, latar `inert`, scroll terkunci.
// - Semua: fokus kembali ke pemicu saat ditutup (bila pemicu masih ada di dokumen).

const stack: number[] = [];
let seq = 0;
export const layerStack = {
  push(): number { const id = ++seq; stack.push(id); return id; },
  remove(id: number) { const i = stack.lastIndexOf(id); if (i >= 0) stack.splice(i, 1); },
  isTop: (id: number) => stack.length > 0 && stack[stack.length - 1] === id,
  size: () => stack.length,
};

/** Indeks tujuan Tab di dalam dialog: membungkus di ujung, -1 = biarkan browser (fokus di tengah daftar). */
export function trapIndex(count: number, current: number, shift: boolean): number {
  if (count === 0) return -2; // tidak ada elemen fokus → tahan fokus di wadah
  if (current < 0) return shift ? count - 1 : 0; // fokus di luar daftar (mis. wadah)
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return -1;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusables = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[inert]") && el.getClientRects().length > 0);

/** Buat saudara di sepanjang jalur node → body menjadi inert; kembalikan fungsi pemulih. */
function inertOthers(node: HTMLElement) {
  const changed: HTMLElement[] = [];
  for (let el: HTMLElement | null = node; el && el !== document.body; el = el.parentElement) {
    const parent: HTMLElement | null = el.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children) as Element[]) {
      if (sib === el || !(sib instanceof HTMLElement) || sib.inert || sib.tagName === "SCRIPT") continue;
      sib.inert = true;
      changed.push(sib);
    }
  }
  return () => changed.forEach((el) => { el.inert = false; });
}

/** Kunci scroll dokumen & leluhur yang bisa di-scroll (mis. <main>) tanpa menggeser layout. */
function lockScroll(node: HTMLElement) {
  const saved: [HTMLElement, string, string][] = [];
  const lock = (el: HTMLElement) => { saved.push([el, el.style.overflow, el.style.scrollbarGutter]); el.style.scrollbarGutter = "stable"; el.style.overflow = "hidden"; };
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) lock(el);
  }
  lock(document.documentElement);
  return () => saved.reverse().forEach(([el, o, g]) => { el.style.overflow = o; el.style.scrollbarGutter = g; });
}

export function useDialog(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>, opts: { modal?: boolean } = {}) {
  const modal = opts.modal ?? true;
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = layerStack.push();
    const cleanups: (() => void)[] = [];
    if (modal && node) {
      cleanups.push(inertOthers(node), lockScroll(node));
      const first = node.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(node)[0];
      if (first) first.focus({ preventScroll: true });
      else { if (!node.hasAttribute("tabindex")) node.tabIndex = -1; node.focus({ preventScroll: true }); }
    }
    const onKey = (e: KeyboardEvent) => {
      if (!layerStack.isTop(id)) return;
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (modal && e.key === "Tab" && node) {
        const els = focusables(node);
        const t = trapIndex(els.length, els.indexOf(document.activeElement as HTMLElement), e.shiftKey);
        if (t === -2) e.preventDefault();
        else if (t >= 0) { e.preventDefault(); els[t].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      layerStack.remove(id);
      cleanups.reverse().forEach((fn) => fn());
      if (trigger && trigger.isConnected && (modal || node?.contains(document.activeElement) || document.activeElement === document.body)) trigger.focus({ preventScroll: true });
    };
  }, [open, modal, ref]);
}
