import { PinForm } from "./pin-form";

const ERRORS: Record<string, string> = {
  inactive: "Akun Anda dinonaktifkan. Hubungi Super Admin.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const initialError = typeof error === "string" ? ERRORS[error] ?? null : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xs rounded-2xl border border-line bg-surface p-6 text-center">
        <span className="material-symbols-outlined !text-5xl text-accent">account_balance</span>
        <h1 className="mt-3 text-2xl font-medium">AR Workspace</h1>
        <p className="mt-1 text-sm text-fg-2">Masukkan PIN 6 digit</p>
        <PinForm initialError={initialError} />
      </div>
    </main>
  );
}
