// Klien API lokal: token sesi dari URL (#t=…) disimpan di sessionStorage lalu dihapus dari address bar.
const token = (() => {
  const m = location.hash.match(/t=([\w-]+)/);
  if (m) {
    try { sessionStorage.setItem("arbot-t", m[1]); } catch { /* mode privat */ }
    history.replaceState(null, "", location.pathname);
    return m[1];
  }
  try { return sessionStorage.getItem("arbot-t") ?? ""; } catch { return ""; }
})();

export const withToken = (url: string) => `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-arbot-token": token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

/** File → base64 (untuk unggah PDF / Excel ke server lokal). */
export function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
export const fmtClock = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
export function fmtDur(a?: string, b?: string) {
  if (!a || !b) return "-";
  const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
  return s < 60 ? `${s} dtk` : `${Math.floor(s / 60)} mnt ${s % 60} dtk`;
}
export const fmtSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
