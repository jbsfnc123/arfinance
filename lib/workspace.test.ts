import { describe, expect, it } from "vitest";
import { authCookieOptions, routeFor, workspaceFromHost, workspaceUrl } from "./workspace";

describe("workspace per host", () => {
  it("mengenali host produksi, dev, dan preview", () => {
    expect(workspaceFromHost("tangki.space")).toBe("finance");
    expect(workspaceFromHost("www.tangki.space")).toBe("finance");
    expect(workspaceFromHost("ar.tangki.space")).toBe("ar");
    expect(workspaceFromHost("AP.tangki.space")).toBe("ap");
    expect(workspaceFromHost("finance.localhost:3000")).toBe("finance");
    expect(workspaceFromHost("ap.localhost:3000")).toBe("ap");
    expect(workspaceFromHost("localhost:3000")).toBe("ar");
    expect(workspaceFromHost("arfinance-git-x.vercel.app")).toBe("ar");
    expect(workspaceFromHost(null)).toBe("ar");
  });

  it("tautan antar workspace", () => {
    expect(workspaceUrl("ap", "tangki.space")).toBe("https://ap.tangki.space/");
    expect(workspaceUrl("finance", "ar.tangki.space", "/akun")).toBe("https://tangki.space/akun");
    expect(workspaceUrl("finance", "localhost:3000")).toBe("http://finance.localhost:3000/");
    expect(workspaceUrl("ar", "ap.localhost:3000")).toBe("http://localhost:3000/");
  });
});

describe("routing per workspace", () => {
  it("finance & ap di-rewrite, login/statis tidak", () => {
    expect(routeFor("finance", "/")).toEqual({ kind: "rewrite", path: "/finance" });
    expect(routeFor("finance", "/akun")).toEqual({ kind: "rewrite", path: "/finance/akun" });
    expect(routeFor("ap", "/")).toEqual({ kind: "rewrite", path: "/ap" });
    expect(routeFor("ap", "/login")).toEqual({ kind: "next" });
    expect(routeFor("finance", "/auth/signout")).toEqual({ kind: "next" });
    expect(routeFor("finance", "/presentasi-app/index.html")).toEqual({ kind: "next" });
    expect(routeFor("ap", "/logo.svg")).toEqual({ kind: "next" });
  });

  it("host AR tidak bisa membuka route finance/ap", () => {
    expect(routeFor("ar", "/finance/akun")).toEqual({ kind: "notfound" });
    expect(routeFor("ar", "/ap")).toEqual({ kind: "notfound" });
    expect(routeFor("ar", "/approval")).toEqual({ kind: "next" });
    expect(routeFor("ar", "/collection")).toEqual({ kind: "next" });
    expect(routeFor("ar", "/pengaturan/acl")).toEqual({ kind: "moved", ws: "finance", path: "/acl" });
    expect(routeFor("ar", "/pengaturan/upload")).toEqual({ kind: "next" });
  });
});

describe("cookie sesi", () => {
  it("dibagi ke semua *.tangki.space, host-only di dev", () => {
    expect(authCookieOptions("ar.tangki.space")).toEqual({ name: "sb-tangki-auth", domain: ".tangki.space" });
    expect(authCookieOptions("tangki.space")).toEqual({ name: "sb-tangki-auth", domain: ".tangki.space" });
    expect(authCookieOptions("localhost:3000")).toEqual({ name: "sb-tangki-auth" });
    expect(authCookieOptions("evil-tangki.space")).toEqual({ name: "sb-tangki-auth" });
  });
});
