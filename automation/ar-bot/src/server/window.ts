// Jendela aplikasi: Edge/Chrome mode --app (tanpa tab & address bar) dengan profil terpisah milik AR Bot.
import { spawn, type ChildProcess } from "node:child_process";
import { findBrowser } from "~/core/browser";
import { P } from "~/core/paths";

export function openWindow(url: string): ChildProcess | null {
  const b = findBrowser("auto");
  if (!b) {
    // Tanpa Edge/Chrome: buka di browser bawaan sebagai cadangan.
    spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return null;
  }
  const child = spawn(b.path, [
    `--app=${url}`,
    `--user-data-dir=${P.windowProfile}`,
    "--window-size=1360,880",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate,msEdgeSidebarV2",
  ], { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  return child;
}
