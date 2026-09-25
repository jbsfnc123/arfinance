// Satu project Vercel melayani beberapa workspace; workspace ditentukan oleh host:
//   tangki.space / www.  → Finance Workspace (khusus Super Admin, route app/finance)
//   ar.tangki.space      → AR Workspace (route app/(shell), path apa adanya)
//   ap.tangki.space      → AP Workspace (route app/ap)
// Dev: finance.localhost:3000 / ap.localhost:3000 / localhost:3000. Preview *.vercel.app = AR.

export type Workspace = "finance" | "ar" | "ap";

export const ROOT_DOMAIN = "tangki.space";
export const WORKSPACE_HEADER = "x-workspace";

export const WORKSPACES: Record<Workspace, { label: string; icon: string; sub: string; desc: string }> = {
  finance: { label: "Finance Workspace", icon: "account_balance", sub: "", desc: "Portal & pengaturan pusat (Super Admin)" },
  ar: { label: "AR Workspace", icon: "request_quote", sub: "ar.", desc: "Piutang: collection, tukar faktur, faktur pajak, rekonsiliasi" },
  ap: { label: "AP Workspace", icon: "payments", sub: "ap.", desc: "Hutang usaha — modul menyusul" },
};

const hostname = (host: string) => host.toLowerCase().split(":")[0];

export function workspaceFromHost(host: string | null | undefined): Workspace {
  const h = hostname(host ?? "");
  if (h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}` || h === "finance.localhost") return "finance";
  if (h === `ap.${ROOT_DOMAIN}` || h === "ap.localhost") return "ap";
  return "ar";
}

export const isWorkspace = (v: unknown): v is Workspace => v === "finance" || v === "ar" || v === "ap";

// Alamat workspace lain dari host yang sedang dipakai (produksi → https://…tangki.space, dev → *.localhost).
export function workspaceUrl(ws: Workspace, currentHost: string | null | undefined, path = "/") {
  const host = (currentHost ?? "").toLowerCase();
  const h = hostname(host);
  if (h === "localhost" || h.endsWith(".localhost")) {
    const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
    const sub = { finance: "finance.", ar: "", ap: "ap." }[ws];
    return `http://${sub}localhost${port}${path}`;
  }
  return `https://${WORKSPACES[ws].sub}${ROOT_DOMAIN}${path}`;
}

// Path publik/statis tidak di-rewrite (login & auth dipakai bersama semua workspace).
const SHARED = /^\/(login|auth|_next|presentasi-app)(\/|$)/;
const hasExtension = (p: string) => /\.[a-z0-9]+$/i.test(p.split("/").pop() ?? "");

export type Route = { kind: "next" } | { kind: "rewrite"; path: string } | { kind: "notfound" } | { kind: "moved"; ws: Workspace; path: string };

// Halaman admin pusat yang pindah dari AR ke Finance Workspace (fase 16).
const MOVED_TO_FINANCE: Record<string, string> = { "/pengaturan/akun": "/akun", "/pengaturan/acl": "/acl", "/pengaturan/database": "/database" };

// Host produksi *.tangki.space: cookie sesi dibagi, jadi login hanya lewat satu pintu (tangki.space).
export function isSharedHost(host: string | null | undefined) {
  const h = hostname(host ?? "");
  return h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`);
}

export function routeFor(ws: Workspace, pathname: string, shared = false): Route {
  if (shared && ws !== "finance" && /^\/login(\/|$)/.test(pathname)) return { kind: "moved", ws: "finance", path: "/login" };
  if (SHARED.test(pathname) || hasExtension(pathname)) return { kind: "next" };
  if (ws === "ar") {
    if (MOVED_TO_FINANCE[pathname]) return { kind: "moved", ws: "finance", path: MOVED_TO_FINANCE[pathname] };
    return /^\/(finance|ap)(\/|$)/.test(pathname) ? { kind: "notfound" } : { kind: "next" };
  }
  return { kind: "rewrite", path: `/${ws}${pathname === "/" ? "" : pathname}` };
}

// Cookie sesi bersama untuk semua *.tangki.space (login sekali). Nama baru sengaja dipakai agar
// cookie lama ar.tangki.space (host-only) diabaikan dan tidak ada dua sesi yang bentrok.
export const AUTH_COOKIE = "sb-tangki-auth";
export function authCookieOptions(host: string | null | undefined) {
  return isSharedHost(host) ? { name: AUTH_COOKIE, domain: `.${ROOT_DOMAIN}` } : { name: AUTH_COOKIE };
}

// Alamat login untuk request yang belum login: produksi → tangki.space/login?next=<asal>, dev → host sendiri.
export function loginUrl(host: string | null | undefined, from: string) {
  const base = isSharedHost(host) ? workspaceUrl("finance", host, "/login") : "/login";
  return `${base}?next=${encodeURIComponent(from)}`;
}

// `next` hanya diterima bila mengarah ke keluarga host yang sama (tangki.space / *.localhost) —
// mencegah open redirect. Mengembalikan workspace tujuan + URL, atau null.
export function parseNext(next: string | null | undefined, currentHost: string | null | undefined): { ws: Workspace; url: string } | null {
  if (!next) return null;
  let u: URL;
  try { u = new URL(next); } catch { return null; }
  const h = u.hostname.toLowerCase();
  const cur = hostname(currentHost ?? "");
  const prod = (h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`)) && u.protocol === "https:" && isSharedHost(cur);
  const dev = (h === "localhost" || h.endsWith(".localhost")) && (cur === "localhost" || cur.endsWith(".localhost"));
  if (!prod && !dev) return null;
  if (/\/login(\/|$)/.test(u.pathname)) return null;
  return { ws: workspaceFromHost(u.host), url: u.toString() };
}
