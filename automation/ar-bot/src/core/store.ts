// Konfigurasi (config.json, tanpa rahasia), rahasia (secrets.dat, DPAPI), status sukses per job (deteksi file kembar),
// dan riwayat run (history.jsonl).
import fs from "node:fs";
import { mergeConfig } from "~/shared/catalog";
import type { Config, RunRecord, SecretKey, Secrets } from "~/shared/types";
import { protect, unprotect } from "./dpapi";
import { P, readJson, writeAtomic } from "./paths";

export const loadConfig = (): Config => mergeConfig(readJson<Partial<Config>>(P.config));
export const saveConfig = (c: Config) => writeAtomic(P.config, JSON.stringify(c, null, 2));

let secretsCache: Secrets | null = null;

export function loadSecrets(): Secrets {
  if (secretsCache) return secretsCache;
  if (!fs.existsSync(P.secrets)) return (secretsCache = {});
  secretsCache = JSON.parse(unprotect(fs.readFileSync(P.secrets, "utf8"))) as Secrets;
  return secretsCache;
}

/** Ubah sebagian rahasia. Nilai "" atau null = hapus. */
export function updateSecrets(patch: Partial<Record<SecretKey, string | null>>) {
  const next: Secrets = { ...loadSecrets() };
  for (const [k, v] of Object.entries(patch) as [SecretKey, string | null][]) {
    if (v) next[k] = v; else delete next[k];
  }
  writeAtomic(P.secrets, protect(JSON.stringify(next)));
  secretsCache = next;
}

export const secretKeys = (): SecretKey[] => Object.keys(loadSecrets()) as SecretKey[];

type State = { lastPush: Record<string, { sha: string; at: string }> };
export const loadState = (): State => readJson<State>(P.state) ?? { lastPush: {} };
export function setLastPush(job: string, sha: string) {
  const s = loadState();
  s.lastPush[job] = { sha, at: new Date().toISOString() };
  writeAtomic(P.state, JSON.stringify(s, null, 2));
}

export function appendHistory(r: RunRecord) {
  fs.appendFileSync(P.history, JSON.stringify(r) + "\n");
}

/** Riwayat terbaru dulu. */
export function readHistory(limit = 200): RunRecord[] {
  let text = "";
  try { text = fs.readFileSync(P.history, "utf8"); } catch { return []; }
  const out: RunRecord[] = [];
  for (const line of text.split("\n").reverse()) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* baris rusak dilewati */ }
    if (out.length >= limit) break;
  }
  return out;
}

/** Pangkas riwayat agar file tidak membesar tanpa batas (simpan 1.000 run terakhir). */
export function trimHistory(keep = 1000) {
  const all = readHistory(keep).reverse();
  writeAtomic(P.history, all.map((r) => JSON.stringify(r)).join("\n") + (all.length ? "\n" : ""));
}
