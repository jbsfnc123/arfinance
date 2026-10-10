// Impor sekali dari aplikasi lama (atas klik pengguna): Assistent Mando (.env + accounts.json) dan Bot ERP
// (automation/erp-bot/.env). Nilai rahasia langsung disimpan terenkripsi; yang dilaporkan hanya nama data yang diimpor.
import fs from "node:fs";
import path from "node:path";
import type { EdiAccount, SecretKey } from "~/shared/types";
import { loadConfig, saveConfig, updateSecrets } from "~/core/store";

const HOME = process.env.USERPROFILE ?? "";

export function parseEnv(text: string) {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const CANDIDATES = {
  mando: [path.join(HOME, "OneDrive", "Documents", "App", "BOT EDI"), path.join(HOME, "Documents", "App", "BOT EDI")],
  erpbot: [path.join(HOME, "dev", "ar-workspace", "automation", "erp-bot")],
};

export function importSources() {
  return (Object.keys(CANDIDATES) as (keyof typeof CANDIDATES)[]).map((source) => {
    const dir = CANDIDATES[source].find((d) => fs.existsSync(path.join(d, ".env"))) ?? CANDIDATES[source][0];
    return { source, dir, env: fs.existsSync(path.join(dir, ".env")), accounts: source === "mando" && fs.existsSync(path.join(dir, "accounts.json")) };
  });
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "akun";

export function runImport({ source, dir }: { source: "mando" | "erpbot"; dir: string }) {
  const envFile = path.join(dir, ".env");
  if (!fs.existsSync(envFile)) throw new Error(`File .env tidak ditemukan di ${dir}`);
  const env = parseEnv(fs.readFileSync(envFile, "utf8"));
  const cfg = loadConfig();
  const secrets: Partial<Record<SecretKey, string>> = {};
  const done: string[] = [];

  if (env.JASPER_USERNAME) { cfg.jasper.username = env.JASPER_USERNAME; done.push("username Jaspersoft"); }
  if (env.JASPER_PASSWORD) { secrets.jasperPassword = env.JASPER_PASSWORD; done.push("password Jaspersoft"); }
  if (env.BOT_HEADLESS) cfg.browser.headless = env.BOT_HEADLESS !== "false";

  if (source === "erpbot") {
    if (env.SUPABASE_URL) cfg.arw.supabaseUrl = env.SUPABASE_URL;
    if (env.SUPABASE_ANON_KEY) cfg.arw.anonKey = env.SUPABASE_ANON_KEY;
    if (env.BOT_EMAIL) cfg.arw.botEmail = env.BOT_EMAIL;
    if (env.SUPABASE_URL || env.BOT_EMAIL) done.push("koneksi AR Workspace");
    if (env.BOT_PASSWORD) { secrets.botPassword = env.BOT_PASSWORD; done.push("password Bot ERP"); }
    if (env.ERP_DRIVE_URL) { cfg.drive.url = env.ERP_DRIVE_URL; done.push("URL Drive Inbox"); }
    if (env.ERP_DRIVE_SECRET) { secrets.driveSecret = env.ERP_DRIVE_SECRET; done.push("rahasia Drive Inbox"); }
  } else {
    const list: { username: string; password: string }[] = [];
    const accFile = path.join(dir, "accounts.json");
    if (fs.existsSync(accFile)) {
      const raw = JSON.parse(fs.readFileSync(accFile, "utf8")) as unknown;
      if (Array.isArray(raw)) for (const a of raw) if (a?.username && a?.password) list.push({ username: String(a.username), password: String(a.password) });
    }
    if (env.EDI_USERNAME && env.EDI_PASSWORD && !list.some((a) => a.username === env.EDI_USERNAME)) list.push({ username: env.EDI_USERNAME, password: env.EDI_PASSWORD });
    let added = 0, updated = 0;
    for (const a of list) {
      let acc: EdiAccount | undefined = cfg.edi.accounts.find((x) => x.username === a.username);
      if (acc) updated++;
      else {
        let id = slug(a.username);
        while (cfg.edi.accounts.some((x) => x.id === id)) id = `${id}-${Math.random().toString(36).slice(2, 5)}`;
        acc = { id, label: a.username, username: a.username, active: true };
        cfg.edi.accounts.push(acc);
        added++;
      }
      secrets[`edi:${acc.id}`] = a.password;
    }
    if (list.length) done.push(`${list.length} akun EDI (${added} baru, ${updated} diperbarui)`);
  }
  saveConfig(cfg);
  if (Object.keys(secrets).length) updateSecrets(secrets);
  return { imported: done };
}
