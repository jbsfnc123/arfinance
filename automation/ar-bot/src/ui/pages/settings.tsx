// Pengaturan: kredensial (rahasia hanya ditulis, tidak pernah ditampilkan), koneksi AR Workspace, browser,
// penyimpanan, tampilan, uji koneksi, dan impor dari aplikasi lama.
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, inputCls, segGroup, segItem } from "@/components/ui";
import type { Config, PublicState, SecretKey } from "~/shared/types";
import { api } from "../api";
import { useApp } from "../store";
import { Card, Field, PageHeader, Switch } from "../parts/common";
import { useSaveConfig } from "../parts/run";

export function SecretInput({ k, label }: { k: SecretKey; label: string }) {
  const { state, setState } = useApp();
  const toast = useToast();
  const [v, setV] = useState("");
  const [show, setShow] = useState(false);
  const set = state!.secretsSet.includes(k);
  const store = async (value: string | null) => {
    try {
      setState(await api<PublicState>("/api/secrets", { [k]: value }));
      setV("");
      toast(value ? `${label} disimpan (terenkripsi).` : `${label} dihapus.`, "success");
    } catch (e) { toast((e as Error).message, "danger"); }
  };
  return (
    <Field label={label}>
      <div className="flex gap-1.5">
        <input className={inputCls} type={show ? "text" : "password"} autoComplete="new-password" value={v} placeholder={set ? "●●●●●● tersimpan" : "belum diisi"}
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && v) void store(v); }} />
        <button type="button" className={btnGhost} onClick={() => setShow(!show)} aria-label={show ? "Sembunyikan" : "Tampilkan"}><Icon name={show ? "visibility_off" : "visibility"} /></button>
        <button type="button" className={btnPrimary} disabled={!v} onClick={() => store(v)}>Simpan</button>
        {set && <button type="button" className={btnGhost} onClick={() => store(null)} aria-label={`Hapus ${label}`}><Icon name="delete" /></button>}
      </div>
    </Field>
  );
}

/** Input teks konfigurasi yang disimpan saat fokus lepas. */
function CfgInput({ label, value, onSave, type = "text", placeholder }: { label: string; value: string; onSave: (v: string) => void; type?: string; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Field label={label}>
      <input className={inputCls} type={type} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v.trim() !== value) onSave(v.trim()); }} />
    </Field>
  );
}

type TestRes = Record<string, { ok: boolean; message: string } | "busy">;

export function TestButton({ target, label, accountId, res, setRes }: { target: string; label: string; accountId?: string; res: TestRes; setRes: React.Dispatch<React.SetStateAction<TestRes>> }) {
  const key = accountId ? `${target}:${accountId}` : target;
  const r = res[key];
  const go = async () => {
    setRes((x) => ({ ...x, [key]: "busy" }));
    const out = await api<{ ok: boolean; message: string }>("/api/test", { target, accountId }).catch((e) => ({ ok: false, message: (e as Error).message }));
    setRes((x) => ({ ...x, [key]: out }));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <button type="button" className={btnGhost} disabled={r === "busy"} onClick={go}>
        <Icon name={r === "busy" ? "progress_activity" : "check_circle"} className={r === "busy" ? "animate-spin" : ""} />{label}
      </button>
      {r && r !== "busy" && <span className={r.ok ? "text-success" : "text-danger"}>{r.ok ? "✓" : "✗"} {r.message}</span>}
    </div>
  );
}

export function SettingsPage() {
  const { state, setState } = useApp();
  const save = useSaveConfig();
  const toast = useToast();
  const cfg = state!.config;
  const [res, setRes] = useState<TestRes>({});
  const [sources, setSources] = useState<{ source: "mando" | "erpbot"; dir: string; env: boolean; accounts: boolean }[]>([]);
  useEffect(() => { api<typeof sources>("/api/import/sources").then(setSources).catch(() => {}); }, []);
  const patch = (f: (c: Config) => Config, msg = "Tersimpan.") => save(f, msg);
  const doImport = async (s: (typeof sources)[number], dir: string) => {
    try {
      const r = await api<{ imported: string[]; state: PublicState }>("/api/import", { source: s.source, dir });
      setState(r.state);
      toast(r.imported.length ? `Diimpor: ${r.imported.join(", ")}` : "Tidak ada data yang bisa diimpor.", r.imported.length ? "success" : "warning", 7000);
    } catch (e) { toast((e as Error).message, "danger"); }
  };

  return (
    <div className="grid gap-4">
      <PageHeader title="Pengaturan" />

      <Card title="Jaspersoft (report.tangki.id)">
        <div className="grid gap-3 md:grid-cols-2">
          <CfgInput label="Username" value={cfg.jasper.username} onSave={(v) => patch((c) => ({ ...c, jasper: { ...c.jasper, username: v } }))} />
          <SecretInput k="jasperPassword" label="Password" />
          <CfgInput label="Organization" value={cfg.jasper.organization} onSave={(v) => patch((c) => ({ ...c, jasper: { ...c.jasper, organization: v || "Penguin Trading" } }))} />
        </div>
        <div className="mt-3"><TestButton target="jasper" label="Uji login" res={res} setRes={setRes} /></div>
      </Card>

      <Card title="AR Workspace (akun Bot ERP)">
        <div className="grid gap-3 md:grid-cols-2">
          <CfgInput label="Supabase URL" value={cfg.arw.supabaseUrl} placeholder="https://….supabase.co" onSave={(v) => patch((c) => ({ ...c, arw: { ...c.arw, supabaseUrl: v } }))} />
          <CfgInput label="Anon key" value={cfg.arw.anonKey} onSave={(v) => patch((c) => ({ ...c, arw: { ...c.arw, anonKey: v } }))} />
          <CfgInput label="Email Bot ERP" value={cfg.arw.botEmail} onSave={(v) => patch((c) => ({ ...c, arw: { ...c.arw, botEmail: v } }))} />
          <SecretInput k="botPassword" label="Password Bot ERP" />
        </div>
        <div className="mt-3"><TestButton target="arw" label="Uji login" res={res} setRes={setRes} /></div>
      </Card>


      <Card title="Browser bot">
        <div className="flex flex-wrap items-center gap-4">
          <div className={segGroup} role="group" aria-label="Browser">
            {(["auto", "edge", "chrome"] as const).map((b) => (
              <button key={b} type="button" aria-pressed={cfg.browser.channel === b} className={segItem(cfg.browser.channel === b)}
                onClick={() => patch((c) => ({ ...c, browser: { ...c.browser, channel: b } }))}>{b === "auto" ? "Otomatis" : b === "edge" ? "Edge" : "Chrome"}</button>
            ))}
          </div>
          <Switch checked={!cfg.browser.headless} onChange={(v) => patch((c) => ({ ...c, browser: { ...c.browser, headless: !v } }))} label="Tampilkan browser saat bot berjalan" />
        </div>
        <div className="mt-3"><TestButton target="browser" label="Cek browser" res={res} setRes={setRes} /></div>
      </Card>

      <Card title="Penyimpanan & tampilan">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48"><CfgInput label="Simpan file (hari)" type="number" value={String(cfg.retentionDays)} onSave={(v) => patch((c) => ({ ...c, retentionDays: Number(v) || 30 }))} /></div>
          <button type="button" className={btnGhost} onClick={() => api("/api/open", { target: "." })}><Icon name="folder_open" />Folder data</button>
          <div className={segGroup} role="group" aria-label="Tema">
            {(["system", "light", "dark"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={cfg.theme === t} className={segItem(cfg.theme === t)}
                onClick={() => patch((c) => ({ ...c, theme: t }), "")}>{t === "system" ? "Ikuti Windows" : t === "light" ? "Terang" : "Gelap"}</button>
            ))}
          </div>
        </div>
        <p className="mt-2 truncate text-xs text-fg-2">{state!.dataDir}</p>
      </Card>

      <Card title="Impor dari aplikasi lama">
        <div className="grid gap-2">
          {sources.map((s) => <ImportRow key={s.source} s={s} onImport={doImport} />)}
        </div>
      </Card>
    </div>
  );
}

function ImportRow({ s, onImport }: { s: { source: "mando" | "erpbot"; dir: string; env: boolean; accounts: boolean }; onImport: (s: { source: "mando" | "erpbot"; dir: string; env: boolean; accounts: boolean }, dir: string) => void }) {
  const [dir, setDir] = useState(s.dir);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={s.source === "mando" ? "Assistent Mando (.env & accounts.json)" : "Bot ERP (automation\\erp-bot\\.env)"} className="min-w-[320px] flex-1">
        <input className={inputCls} value={dir} onChange={(e) => setDir(e.target.value)} />
      </Field>
      <button type="button" className={btnGhost} onClick={() => onImport(s, dir)}><Icon name="download" />Impor</button>
    </div>
  );
}
