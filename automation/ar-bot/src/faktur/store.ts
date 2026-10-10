// Penyimpanan kerja Upload Faktur: data\work\faktur\{manifest.json, split\*.pdf}.
import fs from "node:fs";
import path from "node:path";
import { P, readJson, writeAtomic } from "~/core/paths";
import type { FakturItem } from "./split";

export const FAKTUR_DIR = path.join(P.work, "faktur");
export const SPLIT_DIR = path.join(FAKTUR_DIR, "split");
const MANIFEST = path.join(FAKTUR_DIR, "manifest.json");

export type FakturManifest = { source: string | null; createdAt: string | null; totalPages: number; items: FakturItem[] };

export const loadManifest = (): FakturManifest => readJson<FakturManifest>(MANIFEST) ?? { source: null, createdAt: null, totalPages: 0, items: [] };
export const saveManifest = (m: FakturManifest) => writeAtomic(MANIFEST, JSON.stringify(m, null, 2));

/** Ubah satu item (dipakai UI & runner; tulis langsung agar status tersimpan bertahap). */
export function patchItem(invoice: string, patch: Partial<FakturItem>) {
  const m = loadManifest();
  const it = m.items.find((i) => i.invoice === invoice);
  if (!it) throw new Error(`Invoice ${invoice} tidak ada di daftar.`);
  Object.assign(it, patch);
  saveManifest(m);
  return it;
}

/** Path PDF hasil pecah — hanya nama file di dalam folder split (cegah path traversal). */
export function splitFile(name: string) {
  const f = path.join(SPLIT_DIR, path.basename(name));
  if (!fs.existsSync(f)) throw new Error(`File ${path.basename(name)} tidak ditemukan.`);
  return f;
}

export function clearFaktur() {
  fs.rmSync(FAKTUR_DIR, { recursive: true, force: true });
}
