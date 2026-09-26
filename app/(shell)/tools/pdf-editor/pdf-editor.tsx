"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadImageAsset } from "@/lib/modules/pdf/browser";
import { Tabs } from "@/components/tabs";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { card } from "@/components/ui";
import { BusyProvider, classify, uid, useBusy, useDocs, type Doc } from "./shared";
import { DocPanel } from "./doc-panel";
import { TabMoveLast } from "./tab-move-last";
import { TabOverlay } from "./tab-overlay";
import { TabMerge, type MergeState } from "./tab-merge";
import { TabImg2Pdf, type ImgState } from "./tab-img2pdf";
import { TabCompress } from "./tab-compress";

const TABS = [
  { key: "move", label: "1 · Pindah Halaman Terakhir ke Depan", icon: "low_priority" },
  { key: "overlay", label: "2 · Tempel Gambar", icon: "add_photo_alternate" },
  { key: "merge", label: "3 · Gabung PDF", icon: "merge" },
  { key: "img2pdf", label: "4 · Gambar ke PDF", icon: "photo_library" },
  { key: "compress", label: "5 · Kompres PDF", icon: "compress" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const SHORTCUTS: [string, string][] = [
  ["1 – 5", "Pindah alat"],
  ["Ctrl + S", "Unduh hasil alat yang aktif"],
  ["Ctrl + V", "Tempel gambar dari clipboard ke halaman aktif (Tempel Gambar)"],
  ["Delete / Backspace", "Hapus gambar terpilih"],
  ["Panah (Shift = 10×)", "Geser gambar terpilih"],
  ["Shift saat tarik sudut", "Ubah ukuran gambar tanpa kunci rasio"],
  ["Esc", "Batal pilih gambar / tutup bantuan"],
];

// PDF Editor (Tools Support): seluruh proses di browser — tidak ada file yang dikirim ke server/database.
export function PdfEditor() {
  return <BusyProvider><Editor /></BusyProvider>;
}

function Editor() {
  const toast = useToast();
  const busy = useBusy();
  const d = useDocs();
  const [tab, setTab] = useState<Tab>("move");
  const [help, setHelp] = useState(false);
  const [merge, setMerge] = useState<MergeState>({ items: [], photoSize: "a4", initialized: false });
  const [img, setImg] = useState<ImgState>({ items: [], paper: "auto", orient: "auto", margin: "none" });
  const save = useRef<(() => void) | null>(null);
  const setSave = useCallback((fn: (() => void) | null) => { save.current = fn; }, []);

  const addPdfs = useCallback(async (files: File[]): Promise<Doc[]> => {
    const added: Doc[] = [];
    await busy.run("Memuat PDF…", async (label) => {
      for (const [i, f] of files.entries()) {
        label(`Memuat PDF ${i + 1}/${files.length}…`);
        try { added.push(await d.addPdf(f.name, new Uint8Array(await f.arrayBuffer()))); }
        catch (e) { toast(`Gagal membaca "${f.name}": ${(e as Error).message}`, "danger", 7000); }
      }
    });
    return added;
  }, [busy, d, toast]);

  const addImages = useCallback(async (files: File[]) => {
    for (const f of files) {
      try {
        const asset = await loadImageAsset(f);
        setImg((s) => ({ ...s, items: [...s.items, { uid: uid(), asset }] }));
      } catch (e) { toast((e as Error).message, "danger", 7000); }
    }
  }, [toast]);

  // Panel Dokumen: PDF → dokumen; foto → daftar "Gambar ke PDF".
  const onFiles = useCallback(async (files: File[]) => {
    const { pdfs, images, rejected } = classify(files);
    if (rejected) toast(`${rejected} file dilewati karena bukan PDF atau gambar.`, "warning");
    if (pdfs.length) await addPdfs(pdfs);
    if (images.length) {
      await addImages(images);
      toast(`${images.length} foto dimasukkan ke "Gambar ke PDF".`, "info");
      if (!pdfs.length) setTab("img2pdf");
    }
  }, [addPdfs, addImages, toast]);

  // Pintasan keyboard global & cegah browser membuka file yang dijatuhkan di luar area.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (save.current) save.current(); else toast("Belum ada hasil untuk diunduh di alat ini.", "info");
        return;
      }
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) return;
      const i = ["1", "2", "3", "4", "5"].indexOf(e.key);
      if (i >= 0) setTab(TABS[i].key);
      if (e.key === "Escape") setHelp(false);
    }
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, [toast]);

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-medium">PDF Editor</h1>
        <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
          <span className="material-symbols-outlined !text-sm">lock</span>Diproses di browser — file tidak dikirim ke server
        </span>
        <button type="button" onClick={() => setHelp(true)} title="Bantuan & pintasan keyboard"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg">
          <span className="material-symbols-outlined">help</span>
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="lg:sticky lg:top-4 lg:self-start"><DocPanel d={d} onFiles={(f) => void onFiles(f)} /></div>
        <div className={`${card} min-w-0 p-4`}>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          <div className="mt-4">
            {tab === "move" && <TabMoveLast d={d} setSave={setSave} />}
            {tab === "overlay" && <TabOverlay d={d} setSave={setSave} onPdfFiles={(f) => void addPdfs(f)} />}
            {tab === "merge" && <TabMerge d={d} m={merge} setM={setMerge} setSave={setSave} onPdfFiles={addPdfs} />}
            {tab === "img2pdf" && <TabImg2Pdf d={d} s={img} setS={setImg} onImages={(f) => void addImages(f)} setSave={setSave} />}
            {tab === "compress" && <TabCompress d={d} setSave={setSave} />}
          </div>
        </div>
      </div>

      <Modal open={help} title="Cara pakai & pintasan" onClose={() => setHelp(false)}>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Masukkan PDF (atau foto) di panel <b>Dokumen</b> kiri. Klik dokumen untuk menjadikannya aktif.</li>
          <li>Pilih alat di tab kanan, atur, lalu klik <b>Terapkan ke dokumen</b> — hasilnya bisa langsung dilanjutkan ke alat lain.</li>
          <li>Salah langkah? <b>Batalkan langkah terakhir</b>. Selesai? <b>Unduh</b> per dokumen atau semua sekaligus (ZIP).</li>
        </ol>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k} className="border-t border-line"><td className="py-1.5 pr-3 font-mono text-xs">{k}</td><td className="py-1.5 text-fg-2">{v}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-fg-2">Format gambar: JPG, PNG, WebP, GIF, BMP (dikonversi otomatis). HEIC/HEIF dari iPhone belum bisa dibaca browser — ubah dulu ke JPG. Dokumen hanya tersimpan di memori tab ini; tutup/refresh halaman = daftar kosong lagi.</p>
      </Modal>
    </div>
  );
}
