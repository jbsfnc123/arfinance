export function NoAccess({ label }: { label: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <span className="material-symbols-outlined !text-5xl text-danger">lock</span>
      <h1 className="mt-3 text-xl font-medium">Tidak ada akses</h1>
      <p className="mt-2 text-sm text-fg-2">Menu &quot;{label}&quot; hanya untuk Super Admin.</p>
    </div>
  );
}
