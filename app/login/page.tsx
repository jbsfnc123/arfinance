import { LoginFlow } from "./login-flow";
import { currentHost } from "@/lib/workspace-server";
import { isSharedHost, WORKSPACES, workspaceFromHost } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginNamesFor, type LoginAccount } from "@/lib/auth/login-names";

const ERRORS: Record<string, string> = {
  inactive: "Akun Anda dinonaktifkan. Hubungi Super Admin.",
};

// Satu pintu login di tangki.space (produksi): pilih nama → Masuk (akun tanpa PIN) atau PIN, lalu diarahkan ke
// workspace sesuai akses. Aplikasi Kolektor (kolektor.tangki.space) punya halaman login sendiri berisi akun kolektor saja.
// Dev (*.localhost) tetap login per host karena cookie tidak bisa dibagi antar host.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ error, next }, host] = await Promise.all([searchParams, currentHost()]);
  const initialError = typeof error === "string" ? ERRORS[error] ?? null : null;
  const here = workspaceFromHost(host);
  const ws = isSharedHost(host) && here !== "kolektor" ? "finance" : here;
  const w = WORKSPACES[ws];

  // Hanya nama & tanda "tanpa PIN" yang dikirim ke browser.
  const { data } = await createAdminClient()
    .from("profiles").select("display_name, active, pin_optional, role:roles(kind)").eq("active", true);
  const accounts: LoginAccount[] = (data ?? []).map((p) => ({
    display_name: p.display_name, active: p.active, pin_optional: p.pin_optional,
    kind: (p.role as { kind: string } | null)?.kind ?? null,
  }));
  const names = loginNamesFor(accounts, here === "kolektor" ? "kolektor" : ws);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xs rounded-2xl border border-line bg-surface p-6 text-center">
        <span className="material-symbols-outlined !text-5xl text-accent">{w.icon}</span>
        <h1 className="mt-3 text-2xl font-medium">{w.label}</h1>
        <p className="mt-1 text-sm text-fg-2">Pilih nama Anda untuk masuk</p>
        <LoginFlow initialError={initialError} next={typeof next === "string" ? next : ""} names={names} />
      </div>
    </main>
  );
}
