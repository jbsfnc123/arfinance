// Fase 93: pemicu GitHub Actions bot cloud — konfigurasi env, isi permintaan dispatch, galat tanpa membocorkan token.
import { describe, expect, it, vi } from "vitest";
import { cancelGhRun, dispatchRun, ghConfig } from "./github";

describe("ghConfig", () => {
  it("tanpa token → null; bawaan repo & ref", () => {
    expect(ghConfig({})).toBeNull();
    expect(ghConfig({ ARBOT_GH_TOKEN: " t " })).toEqual({ token: "t", repo: "jbsfnc123/ARBOT", ref: "main" });
    expect(ghConfig({ ARBOT_GH_TOKEN: "t", ARBOT_GH_REPO: "o/r", ARBOT_CODE_REF: "dev" })).toEqual({ token: "t", repo: "o/r", ref: "dev" });
  });
});

describe("dispatchRun / cancelGhRun", () => {
  const c = { token: "rahasia", repo: "o/r", ref: "main" };
  it("POST workflow_dispatch dengan run_id & ref kode", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    await dispatchRun(c, 42, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/o/r/actions/workflows/arbot-run.yml/dispatches");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main", inputs: { run_id: "42", ref: "main" } });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rahasia");
  });
  it("ditolak → galat dengan status, tanpa token", async () => {
    const f = vi.fn(async () => new Response("Bad credentials", { status: 401 }));
    await expect(dispatchRun(c, 1, f as unknown as typeof fetch)).rejects.toThrow(/HTTP 401.*Bad credentials/);
    await expect(dispatchRun(c, 1, f as unknown as typeof fetch)).rejects.not.toThrow(/rahasia/);
  });
  it("batal: 202/409 beres, lainnya galat", async () => {
    await expect(cancelGhRun(c, 5, (async () => new Response(null, { status: 409 })) as unknown as typeof fetch)).resolves.toBeUndefined();
    await expect(cancelGhRun(c, 5, (async () => new Response(null, { status: 404 })) as unknown as typeof fetch)).rejects.toThrow(/404/);
  });
});
