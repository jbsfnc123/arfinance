"use client";

import { downloadBytes, downloadZip } from "@/lib/modules/pdf/browser";
import { formatBytes, uniqueNames } from "@/lib/modules/pdf/ops";
import { btnGhost, card } from "@/components/ui";
import { Dropzone, type Docs } from "./shared";

// Panel Dokumen: upload sekali, semua alat memakai dokumen yang sama. Hasil alat bisa "Terapkan
// ke dokumen" lalu dilanjutkan ke alat berikutnya. Semua hanya di memori browser.
export function DocPanel({ d, onFiles }: { d: Docs; onFiles: (files: File[]) => void }) {
  const a = d.active;
  return (
    <section className={`${card} space-y-3 p-4`}>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-accent">folder_open</span>
        <h2 className="flex-1 font-medium">Dokumen</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-2">{d.docs.length} dokumen</span>
      </div>
      <Dropzone compact onFiles={onFiles} accept="application/pdf,.pdf,image/*" title="Seret PDF / foto ke sini" hint="atau klik untuk memilih beberapa file" />

      {d.docs.length === 0 ? (
        <p className="text-sm text-fg-2">Belum ada dokumen. File hanya diproses di browser ini — tidak dikirim ke server.</p>
      ) : (
        <ul className="space-y-1">
          {d.docs.map((x) => (
            <li key={x.id}>
              <div role="button" tabIndex={0} onClick={() => d.setActiveId(x.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); d.setActiveId(x.id); } }}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${x.id === d.activeId ? "bg-pill text-pill-fg" : "hover:bg-surface-2"}`}>
                <span className="material-symbols-outlined !text-lg">picture_as_pdf</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate" title={x.name}>{x.name}</span>
                  <span className="text-xs opacity-75">{x.pageCount} hal. · {formatBytes(x.size)}</span>
                </span>
                <button type="button" title="Unduh" onClick={(e) => { e.stopPropagation(); downloadBytes(x.bytes, x.name); }} className="rounded p-0.5 hover:bg-surface">
                  <span className="material-symbols-outlined !text-lg">download</span>
                </button>
                <button type="button" title="Hapus dari daftar" onClick={(e) => { e.stopPropagation(); d.remove(x.id); }} className="rounded p-0.5 hover:bg-surface hover:text-danger">
                  <span className="material-symbols-outlined !text-lg">close</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {a && (
        <div className="rounded-lg bg-surface-2 p-2 text-xs">
          <div className="text-fg-2">Riwayat dokumen aktif</div>
          <div className="mt-0.5">{a.steps.join(" → ")}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhost} disabled={!a?.prev} onClick={() => a && d.undo(a)}>
          <span className="material-symbols-outlined !text-base">undo</span>Batalkan langkah terakhir
        </button>
        <button type="button" className={btnGhost} disabled={!d.docs.length}
          onClick={() => {
            const names = uniqueNames(d.docs.map((x) => x.name));
            void downloadZip(d.docs.map((x, i) => ({ name: names[i], bytes: x.bytes })), "dokumen-pdf.zip");
          }}>
          <span className="material-symbols-outlined !text-base">folder_zip</span>Unduh semua (ZIP)
        </button>
        <button type="button" className={`${btnGhost} hover:text-danger`} disabled={!d.docs.length}
          onClick={() => { if (window.confirm("Kosongkan semua dokumen dari daftar?")) d.clear(); }}>
          <span className="material-symbols-outlined !text-base">delete_sweep</span>Kosongkan
        </button>
      </div>
    </section>
  );
}
