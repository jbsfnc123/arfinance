import { PinForm } from "./pin-form";
import { currentWorkspace } from "@/lib/workspace-server";
import { WORKSPACES } from "@/lib/workspace";

const ERRORS: Record<string, string> = {
  inactive: "Akun Anda dinonaktifkan. Hubungi Super Admin.",
  finance: "Finance Workspace khusus Super Admin.",
  noaccess: "Akun Anda tidak punya akses ke workspace ini. Hubungi Super Admin.",
};

// Satu halaman login untuk semua workspace; judul mengikuti host (tangki.space / ar. / ap.).
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ error }, ws] = await Promise.all([searchParams, currentWorkspace()]);
  const initialError = typeof error === "string" ? ERRORS[error] ?? null : null;
  const w = WORKSPACES[ws];

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xs rounded-2xl border border-line bg-surface p-6 text-center">
        <span className="material-symbols-outlined !text-5xl text-accent">{w.icon}</span>
        <h1 className="mt-3 text-2xl font-medium">{w.label}</h1>
        <p className="mt-1 text-sm text-fg-2">{ws === "finance" ? "Khusus Super Admin · " : ""}Masukkan PIN 6 digit</p>
        <PinForm initialError={initialError} />
      </div>
    </main>
  );
}
