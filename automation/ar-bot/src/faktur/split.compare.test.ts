// Banding hasil pecah PDF versi Node dengan split_faktur.py (Python) pada contoh nyata.
// Hanya jalan bila FAKTUR_SAMPLES (folder berisi *.pdf) & FAKTUR_PY (folder Assistent Mando: bin\python + skrip) diisi.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { splitFaktur } from "./split";

const samples = process.env.FAKTUR_SAMPLES, py = process.env.FAKTUR_PY;
const pdfs = samples ? fs.readdirSync(samples).filter((f) => f.toLowerCase().endsWith(".pdf")) : [];

describe.runIf(!!samples && !!py)("pecah PDF = split_faktur.py", () => {
  for (const f of pdfs) {
    it(f, async () => {
      const src = path.join(samples!, f);
      const pyOut = fs.mkdtempSync(path.join(os.tmpdir(), "fk-py-"));
      const r = spawnSync(path.join(py!, "bin", "python", "python.exe"), [path.join(py!, "Upload Faktur Mitra10", "split_faktur.py"), src, pyOut], { encoding: "utf8" });
      const expected = JSON.parse(r.stdout.trim().split("\n").at(-1)!) as { success: boolean; items: { invoice: string; faktur: string; pages: number }[] };
      const nodeOut = fs.mkdtempSync(path.join(os.tmpdir(), "fk-node-"));
      try {
        const got = await splitFaktur(fs.readFileSync(src), nodeOut);
        expect(expected.success).toBe(true);
        expect(got.items.length).toBeGreaterThan(0);
        expect(got.items.map((i) => [i.faktur, i.invoice, i.pages])).toEqual(expected.items.map((i) => [i.faktur, i.invoice, i.pages]));
        for (const i of got.items) expect(fs.existsSync(path.join(nodeOut, i.filename))).toBe(true);
      } finally {
        // PDF faktur berisi data pajak: jangan tinggalkan salinan di folder TEMP.
        for (const d of [pyOut, nodeOut]) fs.rmSync(d, { recursive: true, force: true });
      }
    }, 120_000);
  }
});
