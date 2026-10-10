// Lokasi aplikasi & data. Data selalu di %LOCALAPPDATA%\ARBot\data (di luar OneDrive, tidak tersinkron cloud).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Folder berisi server.mjs / runner.mjs (hasil build: <ARBot>\app). */
export const APP_DIR = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.ARBOT_DATA_DIR
  || path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || ".", "AppData", "Local"), "ARBot", "data");

export const P = {
  config: path.join(DATA_DIR, "config.json"),
  secrets: path.join(DATA_DIR, "secrets.dat"),
  state: path.join(DATA_DIR, "state.json"),
  history: path.join(DATA_DIR, "history.jsonl"),
  runLock: path.join(DATA_DIR, "run.lock"),
  server: path.join(DATA_DIR, "server.json"),
  runs: path.join(DATA_DIR, "runs"),
  downloads: path.join(DATA_DIR, "downloads"),
  shots: path.join(DATA_DIR, "shots"),
  work: path.join(DATA_DIR, "work"),
  windowProfile: path.join(DATA_DIR, "window-profile"),
  browserProfile: path.join(DATA_DIR, "bot-profile"),
};

export function ensureDirs() {
  for (const d of [DATA_DIR, P.runs, P.downloads, P.shots, P.work]) fs.mkdirSync(d, { recursive: true });
}

/** Folder unduhan per job, mis. downloads\jasper.aging. */
export const jobDir = (id: string) => { const d = path.join(P.downloads, id); fs.mkdirSync(d, { recursive: true }); return d; };

/** Tulis file secara atomik (tulis ke .tmp lalu rename) agar tidak rusak bila proses mati di tengah jalan. */
export function writeAtomic(file: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return null; }
}
