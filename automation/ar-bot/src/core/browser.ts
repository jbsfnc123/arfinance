// Cari Chrome/Edge yang terpasang di Windows (bot memakai puppeteer-core, tanpa unduh Chromium).
import fs from "node:fs";
import path from "node:path";
import type { Config } from "~/shared/types";

const LA = process.env.LOCALAPPDATA ?? "";
const PF = [process.env.ProgramFiles ?? "C:\\Program Files", process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"];
const EDGE = path.join("Microsoft", "Edge", "Application", "msedge.exe");
const CHROME = path.join("Google", "Chrome", "Application", "chrome.exe");

const CANDIDATES = {
  edge: [...PF.map((p) => path.join(p, EDGE)), path.join(LA, EDGE)],
  chrome: [...PF.map((p) => path.join(p, CHROME)), path.join(LA, CHROME)],
};

export function findBrowser(channel: Config["browser"]["channel"] = "auto"): { path: string; name: string } | null {
  const order: ("edge" | "chrome")[] = channel === "chrome" ? ["chrome", "edge"] : channel === "edge" ? ["edge", "chrome"] : ["edge", "chrome"];
  for (const k of order) {
    const hit = CANDIDATES[k].find((p) => p && fs.existsSync(p));
    if (hit) return { path: hit, name: k === "edge" ? "Microsoft Edge" : "Google Chrome" };
  }
  return null;
}
