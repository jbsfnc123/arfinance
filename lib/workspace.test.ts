import { describe, expect, it } from "vitest";
import { AUTH_COOKIE_MAX_AGE, authCookieOptions, loginUrl, parseNext, routeFor, staysOnKolektor, workspaceFromHost, workspaceUrl } from "./workspace";

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
    const base = { name: "sb-tangki-auth", maxAge: AUTH_COOKIE_MAX_AGE, sameSite: "lax", path: "/" };
    expect(authCookieOptions("ar.tangki.space")).toEqual({ ...base, domain: ".tangki.space", secure: true });
    expect(authCookieOptions("kolektor.tangki.space")).toEqual({ ...base, domain: ".tangki.space", secure: true });
    expect(authCookieOptions("localhost:3000")).toEqual(base);
    expect(AUTH_COOKIE_MAX_AGE).toBe(400 * 86400); // sesi diingat browser 400 hari
    expect(authCookieOptions("evil-tangki.space")).toEqual(base); // bukan subdomain: tanpa domain bersama
  });
});

describe("satu pintu login (produksi)", () => {
  it("login di ar./ap. dipindah ke tangki.space; dev tetap per host", () => {
    expect(routeFor("ar", "/login", true)).toEqual({ kind: "moved", ws: "finance", path: "/login" });
    expect(routeFor("ap", "/login", true)).toEqual({ kind: "moved", ws: "finance", path: "/login" });
    expect(routeFor("finance", "/login", true)).toEqual({ kind: "next" });
    expect(routeFor("ar", "/login", false)).toEqual({ kind: "next" });
  });
  it("URL login membawa alamat asal", () => {
    expect(loginUrl("ar.tangki.space", "https://ar.tangki.space/collection")).toBe(
      "https://tangki.space/login?next=https%3A%2F%2Far.tangki.space%2Fcollection");
    expect(loginUrl("localhost:3000", "http://localhost:3000/x")).toBe("/login?next=http%3A%2F%2Flocalhost%3A3000%2Fx");
  });
  it("next hanya ke keluarga host sendiri", () => {
    expect(parseNext("https://ap.tangki.space/a?b=1", "tangki.space")).toEqual({ ws: "ap", url: "https://ap.tangki.space/a?b=1" });
    expect(parseNext("https://evil.com/", "tangki.space")).toBeNull();
    expect(parseNext("https://tangki.space.evil.com/", "tangki.space")).toBeNull();
    expect(parseNext("http://ar.tangki.space/", "tangki.space")).toBeNull();
    expect(parseNext("https://tangki.space/login", "tangki.space")).toBeNull();
    expect(parseNext("/collection", "tangki.space")).toBeNull();
    expect(parseNext("http://ap.localhost:3000/", "finance.localhost:3000")).toEqual({ ws: "ap", url: "http://ap.localhost:3000/" });
  });
});

describe("Aplikasi Kolektor (kolektor.tangki.space)", () => {
  it("host, URL, rewrite & login sendiri", () => {
    expect(workspaceFromHost("kolektor.tangki.space")).toBe("kolektor");
    expect(workspaceFromHost("kolektor.localhost:3100")).toBe("kolektor");
    expect(workspaceUrl("kolektor", "tangki.space")).toBe("https://kolektor.tangki.space/");
    expect(workspaceUrl("kolektor", "localhost:3100")).toBe("http://kolektor.localhost:3100/");
    expect(routeFor("kolektor", "/", true)).toEqual({ kind: "rewrite", path: "/kolektor" });
    expect(routeFor("kolektor", "/login", true)).toEqual({ kind: "next" }); // tidak dipindah ke tangki.space
    expect(routeFor("ar", "/kolektor", true)).toEqual({ kind: "notfound" });
    expect(loginUrl("kolektor.tangki.space", "https://kolektor.tangki.space/")).toBe("/login?next=https%3A%2F%2Fkolektor.tangki.space%2F");
    expect(parseNext("https://kolektor.tangki.space/", "kolektor.tangki.space")).toEqual({ ws: "kolektor", url: "https://kolektor.tangki.space/" });
  });
});

describe("Aplikasi Kolektor tidak kembali ke tangki.space", () => {
  it("tujuan login di host kolektor selalu host kolektor", () => {
    expect(staysOnKolektor("kolektor.tangki.space", "https://tangki.space/")).toBe("https://kolektor.tangki.space/");
    expect(staysOnKolektor("kolektor.tangki.space", "https://kolektor.tangki.space/")).toBe("https://kolektor.tangki.space/");
    expect(staysOnKolektor("tangki.space", "https://ar.tangki.space/")).toBe("https://ar.tangki.space/"); // host lain tidak diubah
  });
});
