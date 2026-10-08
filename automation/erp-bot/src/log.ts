import fs from "node:fs";
import path from "node:path";

let file: string | null = null;

/** Log ke konsol + logs/<YYYY-MM-DD>.log (WIB). */
export function initLog(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  file = path.join(dir, `${day}.log`);
}

export function log(msg: string) {
  const t = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", timeStyle: "medium" }).format(new Date());
  const line = `[${t}] ${msg}`;
  console.log(line);
  if (file) fs.appendFileSync(file, line + "\n");
}
