import { LoginFlow } from "./login-flow";
import { currentHost } from "@/lib/workspace-server";
import { isSharedHost, WORKSPACES, workspaceFromHost } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginNamesFor, type LoginAccount } from "@/lib/auth/login-names";
import { AppIcon } from "@/components/icons";
import { workspaceIcon } from "@/lib/ui/app-icons";

const ERRORS: Record<string, string> = {
  inactive: "Akun Anda dinonaktifkan. Hubungi Super Admin.",
};

// Satu pintu login di tangki.space (produksi): pilih nama → Masuk (akun tanpa PIN) atau PIN, lalu diarahkan ke
// workspace sesuai akses. Aplikasi Kolektor (kolektor.tangki.space) punya halaman login sendiri berisi akun kolektor saja.
// Dev (*.localhost) tetap login per host karena cookie tidak bisa dibagi antar host.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ error, next, admin }, host] = await Promise.all([searchParams, currentHost()]);
  // Alamat khusus (bookmark) untuk akun yang tidak tampil di daftar, mis. Super Admin: ketik nama → PIN.
  const manual = admin !== undefined;
  const initialError = typeof error === "string" ? ERRORS[error] ?? null : null;
  const here = workspaceFromHost(host);
  const ws = isSharedHost(host) && here !== "kolektor" ? "finance" : here;
  const w = WORKSPACES[ws];

  // Hanya nama & tanda "tanpa PIN" yang dikirim ke browser (mode manual: tidak ada daftar sama sekali).
  const { data } = manual ? { data: [] } : await createAdminClient()
    .from("profiles").select("display_name, active, pin_optional, role:roles(kind)").eq("active", true).eq("system_account", false);
  const accounts: LoginAccount[] = (data ?? []).map((p) => ({
    display_name: p.display_name, active: p.active, pin_optional: p.pin_optional,
    kind: (p.role as { kind: string } | null)?.kind ?? null,
  }));
  const names = loginNamesFor(accounts, here === "kolektor" ? "kolektor" : ws);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong pop-in w-full max-w-sm rounded-[24px] px-7 pb-7 pt-8 text-center">
        <AppIcon spec={{ ...workspaceIcon(ws), glyph: w.icon }} size={64} className="mx-auto drop-shadow-[0_4px_10px_rgba(0,0,0,.2)]" />
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight">{w.label}</h1>
        <p className="mt-1 text-sm text-fg-2">{manual ? "Masuk dengan nama & PIN" : "Pilih nama Anda untuk masuk"}</p>
        <LoginFlow initialError={initialError} next={typeof next === "string" ? next : ""} names={names} manual={manual} />
      </div>
    </main>
  );
}
