import { LoginButton } from "./login-button";

const ERRORS: Record<string, string> = {
  inactive: "Akun Anda dinonaktifkan. Hubungi Super Admin.",
  auth: "Login gagal. Coba lagi.",
  // Trigger handle_new_user menolak email di luar @penguin.id / allowlist.
  denied: "Email ini tidak diizinkan. Gunakan akun Google @penguin.id.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] ?? ERRORS.auth : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center">
        <span className="material-symbols-outlined !text-5xl text-accent">account_balance</span>
        <h1 className="mt-3 text-2xl font-medium">AR Workspace</h1>
        <p className="mt-1 text-sm text-fg-2">PT Penguin Trading</p>

        {message && (
          <p className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {message}
          </p>
        )}

        <LoginButton />
        <p className="mt-4 text-xs text-fg-2">Masuk memakai akun Google @penguin.id</p>
      </div>
    </main>
  );
}
