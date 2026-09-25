// Tampil seketika saat berpindah menu (sidebar & topbar tetap), sementara halaman tujuan dimuat.
// Batas loading ini juga membuat prefetch halaman dinamis bisa dimanfaatkan Next.js.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse" aria-busy="true" aria-label="Memuat halaman">
      <div className="h-8 w-64 rounded-lg bg-surface-2" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-xl bg-surface-2" />)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="h-64 rounded-xl bg-surface-2 lg:col-span-2" />
        <div className="h-64 rounded-xl bg-surface-2" />
      </div>
      <div className="mt-4 h-72 rounded-xl bg-surface-2" />
    </div>
  );
}
