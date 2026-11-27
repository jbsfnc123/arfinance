// Fase 93: pemicu bot cloud — GitHub Actions repo privat ARBOT (workflow arbot-run.yml). Hanya dipakai di server (API route).
// Env: ARBOT_GH_TOKEN (fine-grained token: repo ARBOT saja, Actions read & write), ARBOT_GH_REPO (bawaan jbsfnc123/ARBOT),
//      ARBOT_CODE_REF (branch arfinance yang dijalankan bot, bawaan main).
const API = "https://api.github.com";

export type GhConfig = { token: string; repo: string; ref: string };

export function ghConfig(env: Record<string, string | undefined> = process.env): GhConfig | null {
  const token = env.ARBOT_GH_TOKEN?.trim();
  if (!token) return null;
  return { token, repo: env.ARBOT_GH_REPO?.trim() || "jbsfnc123/ARBOT", ref: env.ARBOT_CODE_REF?.trim() || "main" };
}

const headers = (c: GhConfig) => ({ Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

/** Picu workflow untuk satu baris bot_runs. Galat = pesan singkat (tanpa token). */
export async function dispatchRun(c: GhConfig, runId: number, fetcher: typeof fetch = fetch) {
  const res = await fetcher(`${API}/repos/${c.repo}/actions/workflows/arbot-run.yml/dispatches`, {
    method: "POST", headers: { ...headers(c), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { run_id: String(runId), ref: c.ref } }),
  });
  if (res.status !== 204) {
    const txt = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`GitHub menolak pemicu (HTTP ${res.status})${txt ? `: ${txt}` : ""}`);
  }
}

/** Batalkan run GitHub (bila sudah berjalan). 409 = sudah selesai → dianggap beres. */
export async function cancelGhRun(c: GhConfig, ghRunId: number, fetcher: typeof fetch = fetch) {
  const res = await fetcher(`${API}/repos/${c.repo}/actions/runs/${ghRunId}/cancel`, { method: "POST", headers: headers(c) });
  if (res.status !== 202 && res.status !== 409) throw new Error(`GitHub menolak pembatalan (HTTP ${res.status})`);
}
