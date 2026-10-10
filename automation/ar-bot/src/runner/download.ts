// Tunggu file unduhan browser selesai. Chromium bisa membuat file pengganti kosong (0 byte) dengan nama akhir sebelum
// isi .crdownload dipindahkan; file baru dianggap selesai bila ukurannya > 0 dan stabil selama satu detik.
import fs from "node:fs";
import path from "node:path";
import { delay, type RunContext } from "./ctx";

const size = (f: string) => { try { return fs.statSync(f).size; } catch { return -1; } };

export async function waitDownload(ctx: RunContext, dir: string, before: Set<string>, re: RegExp, seconds: number) {
  let last: { name: string; size: number } | null = null;
  for (let s = 0; s < seconds; s++) {
    ctx.check();
    await delay(1000);
    const all = fs.readdirSync(dir);
    if (all.some((f) => f.endsWith(".crdownload") || f.endsWith(".tmp"))) { last = null; continue; }
    const name = all.filter((f) => re.test(f) && !before.has(f) && size(path.join(dir, f)) > 0).at(-1);
    if (!name) { last = null; continue; }
    const n = size(path.join(dir, name));
    if (last && last.name === name && last.size === n) {
      removeEmpty(dir, before);
      return path.join(dir, name);
    }
    last = { name, size: n };
  }
  return null;
}

/** Hapus file kosong (0 byte) yang muncul selama unduhan ini. */
export function removeEmpty(dir: string, before: Set<string>) {
  for (const f of fs.readdirSync(dir)) {
    if (before.has(f)) continue;
    const p = path.join(dir, f);
    if (size(p) === 0) { try { fs.rmSync(p); } catch { /* sedang dipakai */ } }
  }
}
