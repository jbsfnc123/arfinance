"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { downloadBytes, isImage, isPdf, loadImageAsset, renderPage } from "@/lib/modules/pdf/browser";
import { applyOverlays, clamp, type ImageAsset } from "@/lib/modules/pdf/ops";
import { btnGhost, btnPrimary } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Actions, Hint, previewOf, uid, useBusy, type Doc, type Docs } from "./shared";

// 2. Tempel Gambar: klik halaman → Ctrl+V / Pilih foto / seret foto ke halaman. Geser & ubah ukuran
// (rasio terkunci, Shift = bebas), panah untuk menggeser, Delete untuk menghapus. Posisi disimpan
// sementara di browser (localStorage) sampai diterapkan.

type Ov = { id: string; asset: ImageAsset; ratio: number; x: number; y: number; w: number; h: number };
type Stored = { overlays: Record<string, (Omit<Ov, "asset"> & { asset: Omit<ImageAsset, "bytes"> })[]>; selectedPage: number | null; savedAt: string };

const keyOf = (d: Doc) => `pdf_editor_overlays::${d.name}::${d.size}::${d.steps.length}`;
const bytesOf = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (c) => c.charCodeAt(0));

function restore(d: Doc): { overlays: Record<number, Ov[]>; selectedPage: number | null; savedAt: string | null } {
  try {
    const raw = localStorage.getItem(keyOf(d));
    if (raw) {
      const s = JSON.parse(raw) as Stored & { pageCount?: number };
      if (s.pageCount === d.pageCount) {
        const overlays: Record<number, Ov[]> = {};
        for (const [p, list] of Object.entries(s.overlays)) overlays[Number(p)] = list.map((o) => ({ ...o, asset: { ...o.asset, bytes: bytesOf(o.asset.dataUrl!) } }));
        return { overlays, selectedPage: s.selectedPage, savedAt: s.savedAt };
      }
    }
  } catch { /* abaikan data rusak */ }
  return { overlays: {}, selectedPage: null, savedAt: null };
}

export function TabOverlay({ d, setSave, onPdfFiles }: { d: Docs; setSave: (fn: (() => void) | null) => void; onPdfFiles: (f: File[]) => void }) {
  const a = d.active;
  if (!a) return <Hint>Tambahkan PDF di panel Dokumen, klik halaman, lalu tempel gambar dengan <b>Ctrl+V</b>, tombol <b>Pilih foto</b>, atau seret foto ke halaman.</Hint>;
  return <OverlayEditor key={`${a.id}@${a.rev}`} doc={a} d={d} setSave={setSave} onPdfFiles={onPdfFiles} />;
}

function OverlayEditor({ doc, d, setSave, onPdfFiles }: { doc: Doc; d: Docs; setSave: (fn: (() => void) | null) => void; onPdfFiles: (f: File[]) => void }) {
  const busy = useBusy();
  const toast = useToast();
  const [init] = useState(() => restore(doc));
  const [overlays, setOverlays] = useState<Record<number, Ov[]>>(init.overlays);
  const [selPage, setSelPage] = useState<number | null>(init.selectedPage);
  const [selId, setSelId] = useState<string | null>(null);
  // Status simpan sementara (store kecil agar tidak memanggil setState di dalam effect).
  const [status] = useState(() => {
    let v = { savedAt: init.savedAt, full: false };
    const ls = new Set<() => void>();
    return { get: () => v, set: (n: typeof v) => { v = n; ls.forEach((f) => f()); }, sub: (f: () => void) => { ls.add(f); return () => { ls.delete(f); }; } };
  });
  const { savedAt, full: quotaFull } = useSyncExternalStore(status.sub, status.get, status.get);
  const [aspect0, setAspect0] = useState(0.707);
  const layers = useRef(new Map<number, HTMLDivElement>());
  const photoInput = useRef<HTMLInputElement>(null);
  const total = Object.values(overlays).reduce((s, l) => s + l.length, 0);

  useEffect(() => {
    previewOf(doc).then(async (p) => { const v = (await p.getPage(1)).getViewport({ scale: 1 }); setAspect0(v.width / v.height); }, () => undefined);
  }, [doc]);

  // Simpan sementara setiap perubahan (termasuk gambar sebagai dataUrl).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const at = new Date().toLocaleTimeString("id-ID");
    const s: Stored & { pageCount: number } = {
      pageCount: doc.pageCount, selectedPage: selPage, savedAt: at,
      overlays: Object.fromEntries(Object.entries(overlays).map(([p, l]) => [p, l.map(({ asset, ...o }) => ({ ...o, asset: { name: asset.name, dataUrl: asset.dataUrl, mime: asset.mime, width: asset.width, height: asset.height } }))])),
    };
    try {
      localStorage.setItem(keyOf(doc), JSON.stringify(s));
      status.set({ savedAt: at, full: false });
    } catch {
      if (!status.get().full) toast("Penyimpanan sementara browser penuh. Gambar tetap aman selama PDF-nya diterapkan/diunduh.", "warning", 8000);
      status.set({ ...status.get(), full: true });
    }
  }, [overlays, selPage, doc, status, toast]);

  const addOverlay = useCallback((asset: ImageAsset, center?: { x: number; y: number }, page = selPage) => {
    if (page === null) return toast("Pilih dulu halaman yang mau ditempeli gambar (klik halamannya).", "warning");
    const rect = layers.current.get(page)?.getBoundingClientRect();
    const pageAspect = rect ? rect.width / rect.height : aspect0;
    const ratio = asset.width / asset.height;
    let w = 0.55, h = (w * pageAspect) / ratio;
    if (h > 0.7) { h = 0.7; w = (h * ratio) / pageAspect; }
    w = clamp(w, 0.05, 1); h = clamp(h, 0.05, 1);
    const cx = center?.x ?? 0.5, cy = center?.y ?? 0.35;
    const ov: Ov = { id: uid(), asset, ratio, w, h, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h) };
    setOverlays((o) => ({ ...o, [page]: [...(o[page] ?? []), ov] }));
    setSelPage(page);
    setSelId(ov.id);
  }, [selPage, aspect0, toast]);

  const addFiles = useCallback(async (files: File[], page?: number, center?: { x: number; y: number }) => {
    const pdfs = files.filter(isPdf);
    if (pdfs.length) onPdfFiles(pdfs);
    for (const f of files.filter((x) => !isPdf(x) && isImage(x))) {
      try { addOverlay(await loadImageAsset(f), center, page ?? selPage); } catch (e) { toast((e as Error).message, "danger", 7000); }
    }
  }, [addOverlay, onPdfFiles, selPage, toast]);

  const update = (page: number, id: string, patch: Partial<Ov>) =>
    setOverlays((o) => ({ ...o, [page]: (o[page] ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const removeOv = (page: number, id: string) => {
    setOverlays((o) => ({ ...o, [page]: (o[page] ?? []).filter((x) => x.id !== id) }));
    if (selId === id) setSelId(null);
  };

  // Ctrl+V: tempel gambar dari clipboard (mis. hasil copy tabel Excel) ke halaman terpilih.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const items = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith("image/"));
      if (!items.length) return;
      e.preventDefault();
      if (selPage === null) { toast("Klik dulu halaman tujuan, lalu tekan Ctrl+V lagi.", "warning"); return; }
      for (const it of items) {
        const f = it.getAsFile();
        if (f) loadImageAsset(f, "clipboard.png").then((as) => addOverlay(as), (err) => toast((err as Error).message, "danger"));
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selPage, addOverlay, toast]);

  // Panah = geser 1 px (Shift = 10 px), Delete/Backspace = hapus, Esc = batal pilih.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") { setSelId(null); return; }
      if (!selId || selPage === null) return;
      const ov = overlays[selPage]?.find((x) => x.id === selId);
      if (!ov) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeOv(selPage, selId); return; }
      const rect = layers.current.get(selPage)?.getBoundingClientRect();
      if (!rect) return;
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      update(selPage, selId, { x: clamp(ov.x + d[0] / rect.width, 0, 1 - ov.w), y: clamp(ov.y + d[1] / rect.height, 0, 1 - ov.h) });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const apply = async () => {
    if (!total) return toast("Belum ada gambar yang ditempel.", "info");
    await busy.run("Menggabungkan gambar ke PDF…", async () => {
      const bytes = await applyOverlays(doc.bytes, overlays);
      try { localStorage.removeItem(keyOf(doc)); } catch { /* abaikan */ }
      await d.update(doc, bytes, "Tempel gambar");
      toast("Gambar ditempel ke dokumen.", "success");
    });
  };
  const download = () => busy.run("Menyiapkan unduhan…", async () => downloadBytes(await applyOverlays(doc.bytes, overlays), doc.name));

  useEffect(() => { setSave(() => void download()); });

  return (
    <div className="space-y-4">
      <Hint>Klik halaman tujuan, lalu tempel gambar dengan <b>Ctrl+V</b>, <b>Pilih foto</b>, atau seret foto langsung ke titik di halaman. Geser untuk memindah, tarik sudut kanan bawah untuk ubah ukuran (rasio terkunci, tahan <b>Shift</b> untuk bebas).</Hint>
      <Actions>
        <button type="button" className={btnPrimary} onClick={apply} disabled={!total}><span className="material-symbols-outlined !text-base">check</span>Terapkan ke dokumen</button>
        <button type="button" className={btnGhost} onClick={download}><span className="material-symbols-outlined !text-base">download</span>Unduh hasil</button>
        <button type="button" className={btnGhost} onClick={() => (selPage === null ? toast("Klik dulu halaman tujuan.", "warning") : photoInput.current?.click())}>
          <span className="material-symbols-outlined !text-base">add_photo_alternate</span>Pilih foto
        </button>
        <button type="button" className={btnGhost} disabled={selPage === null || !(overlays[selPage]?.length)}
          onClick={() => selPage !== null && setOverlays((o) => ({ ...o, [selPage]: [] }))}>
          <span className="material-symbols-outlined !text-base">hide_image</span>Hapus gambar di halaman ini
        </button>
        <span className="text-xs text-fg-2">
          {selPage === null ? "Belum ada halaman dipilih" : `Halaman aktif: ${selPage + 1}`} · {total} gambar
          {quotaFull ? " · penyimpanan sementara penuh" : savedAt ? ` · tersimpan sementara ${savedAt}` : ""}
        </span>
        <input ref={photoInput} type="file" multiple accept="image/*" className="hidden"
          onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </Actions>

      <div className="mx-auto max-w-[680px] space-y-4">
        {Array.from({ length: doc.pageCount }, (_, i) => (
          <PageCard key={i} doc={doc} index={i} aspect={aspect0} selected={selPage === i}
            onSelect={() => setSelPage(i)} layerRef={(el) => { if (el) layers.current.set(i, el); else layers.current.delete(i); }}
            onDropFiles={(files, center) => { setSelPage(i); void addFiles(files, i, center); }}>
            {(overlays[i] ?? []).map((o) => (
              <OverlayBox key={o.id} ov={o} selected={selId === o.id} layer={() => layers.current.get(i)}
                onPick={() => { setSelPage(i); setSelId(o.id); }} onChange={(p) => update(i, o.id, p)} onRemove={() => removeOv(i, o.id)} />
            ))}
          </PageCard>
        ))}
      </div>
    </div>
  );
}

// Halaman dirender saat mendekati layar (IntersectionObserver), agar PDF tebal tetap ringan.
function PageCard({ doc, index, aspect, selected, onSelect, layerRef, onDropFiles, children }: {
  doc: Doc; index: number; aspect: number; selected: boolean; onSelect: () => void;
  layerRef: (el: HTMLDivElement | null) => void; onDropFiles: (f: File[], center: { x: number; y: number }) => void; children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let done = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || done) return;
      done = true;
      io.disconnect();
      const c = await renderPage(await previewOf(doc), index, 1.2, 0, canvas.current ?? undefined);
      setRatio(c.width / c.height);
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [doc, index]);

  return (
    <div ref={box} onClick={onSelect}
      className={`rounded-xl border-2 bg-surface-2 p-2 ${selected ? "border-accent" : "border-transparent"}`}>
      <div className="mb-1 text-xs text-fg-2">Halaman {index + 1}{selected ? " · aktif" : ""}</div>
      <div ref={layerRef} className={`relative w-full overflow-hidden bg-white ${over ? "ring-2 ring-accent" : ""}`}
        style={{ aspectRatio: `${ratio ?? aspect}` }}
        onDragOver={(e) => { if ([...e.dataTransfer.items].some((i) => i.kind === "file")) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); setOver(false);
          const r = e.currentTarget.getBoundingClientRect();
          onDropFiles([...e.dataTransfer.files], { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
        }}>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {children}
      </div>
    </div>
  );
}

function OverlayBox({ ov, selected, layer, onPick, onChange, onRemove }: {
  ov: Ov; selected: boolean; layer: () => HTMLDivElement | undefined; onPick: () => void; onChange: (p: Partial<Ov>) => void; onRemove: () => void;
}) {
  const [size, setSize] = useState<string | null>(null);

  function start(e: React.PointerEvent, mode: "drag" | "resize") {
    e.stopPropagation(); e.preventDefault();
    onPick();
    const el = layer();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pageAspect = rect.width / rect.height;
    const s = { x: ov.x, y: ov.y, w: ov.w, h: ov.h, cx: e.clientX, cy: e.clientY };
    const label = (w: number, h: number) => setSize(`${Math.round(w * rect.width)} × ${Math.round(h * rect.height)} px`);
    label(ov.w, ov.h);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - s.cx) / rect.width, dy = (ev.clientY - s.cy) / rect.height;
      if (mode === "drag") {
        onChange({ x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
      } else if (ev.shiftKey) {
        const w = clamp(s.w + dx, 0.03, 1 - s.x), h = clamp(s.h + dy, 0.03, 1 - s.y);
        onChange({ w, h }); label(w, h);
      } else {
        let w = clamp(s.w + dx, 0.03, 1 - s.x), h = (w * pageAspect) / ov.ratio;
        if (s.y + h > 1) { h = 1 - s.y; w = (h * ov.ratio) / pageAspect; }
        onChange({ w, h }); label(w, h);
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setSize(null); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div onPointerDown={(e) => start(e, "drag")} onClick={(e) => e.stopPropagation()}
      className={`absolute cursor-move touch-none select-none ${selected ? "outline outline-2 outline-accent" : "outline outline-1 outline-accent/40"}`}
      style={{ left: `${ov.x * 100}%`, top: `${ov.y * 100}%`, width: `${ov.w * 100}%`, height: `${ov.h * 100}%` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- dataURL lokal, bukan aset untuk dioptimasi */}
      <img src={ov.asset.dataUrl} alt="" className="pointer-events-none h-full w-full" draggable={false} />
      {selected && (
        <>
          <button type="button" title="Hapus gambar (Delete)" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow">
            <span className="material-symbols-outlined !text-sm">close</span>
          </button>
          <span onPointerDown={(e) => start(e, "resize")} title="Tarik untuk ubah ukuran (Shift = bebas)"
            className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-accent" />
        </>
      )}
      {size && <span className="absolute -top-6 left-0 rounded bg-black/70 px-1.5 text-[11px] text-white">{size}</span>}
    </div>
  );
}
