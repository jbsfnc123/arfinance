// Kerangka aplikasi: sidebar bergrup (gaya AR Workspace) + halaman.
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { JOBS } from "~/shared/catalog";
import type { JobId } from "~/shared/types";
import { useApp } from "./store";
import { ChainsPage } from "./pages/chains";
import { ChecklistPage } from "./pages/checklist";
import { Dashboard } from "./pages/dashboard";
import { EdiAccountsPage } from "./pages/edi-accounts";
import { FakturPage } from "./pages/faktur";
import { HistoryPage } from "./pages/history";
import { JobPage } from "./pages/job";
import { SettingsPage } from "./pages/settings";

type NavItem = { key: string; label: string; icon: string };
const job = (id: JobId): NavItem => { const j = JOBS.find((x) => x.id === id)!; return { key: id, label: j.nav ?? j.label, icon: j.icon }; };
const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ key: "dashboard", label: "Dashboard", icon: "space_dashboard" }] },
  { group: "Jaspersoft", items: [job("jasper.aging"), job("jasper.send-invoice"), job("jasper.sj"), job("jasper.invoice-by-date")] },
  { group: "EDI Mitra 10", items: [{ key: "edi.accounts", label: "Akun", icon: "groups" }, job("edi.gr"), job("edi.kwitansi"), job("edi.upload-faktur")] },
  { group: "Alat", items: [{ key: "checklist", label: "Invoice Checklist", icon: "fact_check" }] },
  { group: "Sistem", items: [{ key: "chains", label: "Rangkaian & Jadwal", icon: "event" }, { key: "history", label: "Riwayat", icon: "history" }, { key: "settings", label: "Pengaturan", icon: "settings" }] },
];

function usePage() {
  const [page, setPage] = useState(() => { try { return sessionStorage.getItem("arbot-page") ?? "dashboard"; } catch { return "dashboard"; } });
  const go = (p: string) => { setPage(p); try { sessionStorage.setItem("arbot-page", p); } catch { /* abaikan */ } };
  return [page, go] as const;
}

export function App() {
  const { state, connected } = useApp();
  const [page, go] = usePage();

  // Tema: ikut Windows / terang / gelap (AR Workspace: gelap bawaan, terang lewat data-theme="light").
  const theme = state?.config.theme ?? "system";
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const light = theme === "light" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = light ? "light" : "dark";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  if (!state) {
    return <div className="grid h-full place-items-center text-[13px] text-fg-2">{connected ? "Memuat…" : "Menghubungkan ke AR Bot…"}</div>;
  }
  const active = state.active;

  let body: React.ReactNode;
  if (page === "dashboard") body = <Dashboard go={go} />;
  else if (page === "edi.accounts") body = <EdiAccountsPage />;
  else if (page === "edi.upload-faktur") body = <FakturPage />;
  else if (page === "checklist") body = <ChecklistPage />;
  else if (page === "chains") body = <ChainsPage />;
  else if (page === "history") body = <HistoryPage />;
  else if (page === "settings") body = <SettingsPage />;
  else if (JOBS.some((j) => j.id === page)) body = <JobPage key={page} id={page as JobId} />;
  else body = <Dashboard go={go} />;

  return (
    <div className="flex h-full">
      <nav aria-label="Menu" className="glass-soft flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-r border-hairline px-2 py-3">
        <div className="flex items-center gap-2 px-2 pb-1">
          <img src="./icon.svg" alt="" className="size-7" />
          <div>
            <div className="text-[14px] font-semibold leading-tight">AR Bot</div>
            <div className="text-[11px] text-fg-2">v{state.version}</div>
          </div>
        </div>
        {NAV.map((g, i) => (
          <div key={i} className="grid gap-0.5">
            {g.group && <div className="px-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-2">{g.group}</div>}
            {g.items.map((it) => {
              const on = page === it.key;
              const running = !!active?.jobs.some((j) => j.id === it.key);
              return (
                <button key={it.key} type="button" aria-current={on ? "page" : undefined} onClick={() => go(it.key)}
                  className={`flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors ${on ? "bg-accent-fill text-on-accent" : "text-fg hover:bg-fg/8"}`}>
                  <Icon name={it.icon} size={17} className={on ? "" : "text-accent"} />
                  <span className="flex-1 truncate">{it.label}</span>
                  {running && <span className="size-2 animate-pulse rounded-full bg-success" aria-label="sedang berjalan" />}
                </button>
              );
            })}
          </div>
        ))}
        <div className="mt-auto px-2 text-[11px] text-fg-2">
          {active ? <span className="text-success">● Bot berjalan</span> : connected ? "● Siap" : <span className="text-danger">● Terputus</span>}
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-[1280px]">{body}</div>
      </main>
    </div>
  );
}
