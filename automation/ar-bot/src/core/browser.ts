// Cari Chrome/Edge yang terpasang (bot memakai puppeteer-core, tanpa unduh Chromium).
// Windows: Edge/Chrome di Program Files / LOCALAPPDATA. Cloud (Fase 93, Linux runner GitHub): CHROME_PATH atau Chrome sistem.
import fs from "node:fs";
import path from "node:path";
import type { Config } from "~/shared/types";

const LA = process.env.LOCALAPPDATA ?? "";
const PF = [process.env.ProgramFiles ?? "C:\\Program Files", process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"];
const EDGE = path.join("Microsoft", "Edge", "Application", "msedge.exe");
const CHROME = path.join("Google", "Chrome", "Application", "chrome.exe");

const CANDIDATES = {
  edge: [...PF.map((p) => path.join(p, EDGE)), path.join(LA, EDGE), "/usr/bin/microsoft-edge"],
  chrome: [...PF.map((p) => path.join(p, CHROME)), path.join(LA, CHROME), "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"],
};

export function findBrowser(channel: Config["browser"]["channel"] = "auto", exists: (f: string) => boolean = fs.existsSync): { path: string; name: string } | null {
  const forced = process.env.CHROME_PATH;
  if (forced && exists(forced)) return { path: forced, name: "Google Chrome" };
  const order: ("edge" | "chrome")[] = channel === "chrome" ? ["chrome", "edge"] : channel === "edge" ? ["edge", "chrome"] : ["edge", "chrome"];
  for (const k of order) {
    const hit = CANDIDATES[k].find((p) => p && exists(p));
    if (hit) return { path: hit, name: k === "edge" ? "Microsoft Edge" : "Google Chrome" };
  }
  return null;
}
