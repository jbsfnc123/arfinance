// Kerangka pemuatan (pengganti spinner/teks "Memuat…") — bentuk mengikuti isi yang akan tampil.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-4 ${className}`} aria-busy>
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={`mt-3 h-3 ${i === 0 ? "w-2/3" : "w-1/2"}`} />)}
    </div>
  );
}

export function SkeletonChart({ height = 220, className = "" }: { height?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-4 ${className}`} aria-busy>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-4 w-full" />
      <div className="mt-4 animate-pulse rounded-xl bg-surface-2" style={{ height }} />
    </div>
  );
}
