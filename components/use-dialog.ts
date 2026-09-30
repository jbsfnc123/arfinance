"use client";

import { useEffect, useRef, type RefObject } from "react";

// Perilaku overlay bersama (Modal, Spotlight, Launcher, Popover).
// - Tumpukan lapisan tingkat modul dengan jenis: "modal" (form/data halaman), "overlay" (Spotlight, Launcher),
//   "popover" (non-modal). Escape hanya menutup lapisan teratas; pintasan global (Ctrl/Cmd+K) ditolak selama ada modal.
// - Lapisan modal/overlay: fokus masuk ([data-autofocus] → elemen fokus pertama → wadah), Tab terkurung, latar `inert`,
//   scroll terkunci. Urutan visual mengikuti urutan tumpukan: z-index lapisan = token jenisnya + kedalaman.
// - Inert & kunci scroll dihitung per elemen (refcount) → menutup satu lapisan tidak mengaktifkan latar milik lapisan lain.
// - Semua: fokus kembali ke pemicu saat ditutup (bila pemicu masih ada di dokumen).

export type LayerKind = "modal" | "overlay" | "popover";
type Layer = { id: number; kind: LayerKind };

const stack: Layer[] = [];
let seq = 0;
export const layerStack = {
  push(kind: LayerKind = "modal"): number { const id = ++seq; stack.push({ id, kind }); return id; },
  remove(id: number) { const i = stack.findIndex((l) => l.id === id); if (i >= 0) stack.splice(i, 1); },
  isTop: (id: number) => stack.length > 0 && stack[stack.length - 1].id === id,
  depth: (id: number) => stack.findIndex((l) => l.id === id),
  size: () => stack.length,
  /** Ada dialog form/data modal yang masih aktif? */
  hasModal: () => stack.some((l) => l.kind === "modal"),
  topKind: (): LayerKind | null => stack[stack.length - 1]?.kind ?? null,
};

/** Boleh membuka overlay global (Spotlight/Launcher) dari pintasan? Tidak selama dialog modal halaman aktif. */
export const canOpenGlobalOverlay = () => !layerStack.hasModal();

/** Indeks tujuan Tab di dalam dialog: membungkus di ujung, -1 = biarkan browser (fokus di tengah daftar). */
export function trapIndex(count: number, current: number, shift: boolean): number {
  if (count === 0) return -2; // tidak ada elemen fokus → tahan fokus di wadah
  if (current < 0) return shift ? count - 1 : 0; // fokus di luar daftar (mis. wadah)
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return -1;
}

const CANDIDATES = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';

/** Terlihat & ikut tata letak: tanpa [hidden], display:none atau visibility:hidden di leluhur. */
function isRendered(el: HTMLElement): boolean {
  if (el.closest("[hidden]")) return false;
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === "none") return false;
    if (e === el && cs.visibility === "hidden") return false;
  }
  return true;
}

/** Elemen yang masuk urutan Tab normal: tabIndex ≥ 0, tidak disabled, tidak inert, terlihat. Roving tabindex (-1) dilewati. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CANDIDATES)].filter((el) =>
    el.tabIndex >= 0 && !el.matches(":disabled") && !el.closest("[inert]") && isRendered(el));
}

// ── Inert & kunci scroll dengan refcount ────────────────────────────────────
const inertCount = new Map<HTMLElement, number>();
function acquireInert(el: HTMLElement) {
  const n = inertCount.get(el);
  if (n === undefined) {
    if (el.hasAttribute("inert")) return false; // inert milik pihak lain → jangan disentuh
    el.setAttribute("inert", "");
  }
  inertCount.set(el, (n ?? 0) + 1);
  return true;
}
function releaseInert(el: HTMLElement) {
  const n = (inertCount.get(el) ?? 1) - 1;
  if (n <= 0) { inertCount.delete(el); el.removeAttribute("inert"); } else inertCount.set(el, n);
}

/** Buat saudara di sepanjang jalur node → body menjadi inert (kecuali [data-inert-exempt], mis. toast); kembalikan pemulih. */
function inertOthers(node: HTMLElement) {
  const held: HTMLElement[] = [];
  for (let el: HTMLElement | null = node; el && el !== document.body; el = el.parentElement) {
    const parent: HTMLElement | null = el.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children) as Element[]) {
      if (sib === el || !(sib instanceof HTMLElement) || sib.tagName === "SCRIPT" || sib.hasAttribute("data-inert-exempt")) continue;
      if (acquireInert(sib)) held.push(sib);
    }
  }
  return () => held.forEach(releaseInert);
}

const scrollCount = new Map<HTMLElement, { n: number; overflow: string; gutter: string }>();
function acquireScroll(el: HTMLElement) {
  const s = scrollCount.get(el);
  if (s) { s.n++; return; }
  scrollCount.set(el, { n: 1, overflow: el.style.overflow, gutter: el.style.scrollbarGutter });
  // Gutter "stable" hanya untuk elemen yang saat ini punya scrollbar (agar lebar konten tidak berubah).
  if (el.scrollHeight > el.clientHeight) el.style.scrollbarGutter = "stable";
  el.style.overflow = "hidden";
}
function releaseScroll(el: HTMLElement) {
  const s = scrollCount.get(el);
  if (!s) return;
  if (--s.n > 0) return;
  scrollCount.delete(el);
  el.style.overflow = s.overflow;
  el.style.scrollbarGutter = s.gutter;
}

/** Kunci scroll dokumen & leluhur yang bisa di-scroll (mis. <main>) tanpa menggeser layout. */
function lockScroll(node: HTMLElement) {
  const held: HTMLElement[] = [];
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) { acquireScroll(el); held.push(el); }
  }
  acquireScroll(document.documentElement); held.push(document.documentElement);
  return () => held.reverse().forEach(releaseScroll);
}

const Z_TOKEN: Record<LayerKind, string> = { modal: "--z-modal", overlay: "--z-overlay", popover: "--z-popover" };

/**
 * @param ref      elemen dialog (role="dialog")
 * @param kind     jenis lapisan (bawaan "modal")
 * @param layerRef elemen lapisan terluar (backdrop fixed) yang diberi z-index sesuai urutan tumpukan
 */
export function useDialog(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>,
  { kind = "modal", layerRef }: { kind?: LayerKind; layerRef?: RefObject<HTMLElement | null> } = {}) {
  const trapped = kind !== "popover";
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const trigger = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const id = layerStack.push(kind);
    const layer = layerRef?.current;
    if (layer) layer.style.zIndex = `calc(var(${Z_TOKEN[kind]}) + ${layerStack.depth(id)})`;
    const cleanups: (() => void)[] = [];
    if (trapped && node) {
      cleanups.push(inertOthers(node), lockScroll(node));
      const first = node.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(node)[0];
      if (first) first.focus({ preventScroll: true });
      else { if (!node.hasAttribute("tabindex")) node.tabIndex = -1; node.focus({ preventScroll: true }); }
    }
    const onKey = (e: KeyboardEvent) => {
      if (!layerStack.isTop(id)) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); return; }
      if (trapped && e.key === "Tab" && node) {
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
      cleanups.reverse().forEach((fn) => fn()); // latar aktif lagi sebelum fokus dikembalikan
      if (layer) layer.style.zIndex = "";
      const focusInside = !!node && (node.contains(document.activeElement) || !node.isConnected);
      if (trigger && trigger.isConnected && !trigger.closest("[inert]") && (trapped || focusInside || document.activeElement === document.body))
        trigger.focus({ preventScroll: true });
    };
  }, [open, kind, trapped, ref, layerRef]);
}
