import { LoginFlow } from "./login-flow";
import { currentHost } from "@/lib/workspace-server";
import { isSharedHost, WORKSPACES, workspaceFromHost } from "@/lib/workspace";

const ERRORS: Record<string, string> = {
  inactive: "Akun Anda dinonaktifkan. Hubungi Super Admin.",
};

// Satu pintu login di tangki.space (produksi): Nama → PIN, lalu diarahkan ke workspace sesuai divisi.
// Dev (*.localhost) tetap login per host karena cookie tidak bisa dibagi antar host.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ error, next }, host] = await Promise.all([searchParams, currentHost()]);
  const initialError = typeof error === "string" ? ERRORS[error] ?? null : null;
  const w = WORKSPACES[isSharedHost(host) ? "finance" : workspaceFromHost(host)];

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xs rounded-2xl border border-line bg-surface p-6 text-center">
        <span className="material-symbols-outlined !text-5xl text-accent">{w.icon}</span>
        <h1 className="mt-3 text-2xl font-medium">{w.label}</h1>
        <p className="mt-1 text-sm text-fg-2">Masuk dengan nama &amp; PIN 6 digit</p>
        <LoginFlow initialError={initialError} next={typeof next === "string" ? next : ""} />
      </div>
    </main>
  );
}
