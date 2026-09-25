// Urutan papan sticky notes: yang di-pin di atas (pin terbaru paling atas), sisanya urut dibuat.
type Sortable = { id: number; created_at: string; pinned_at: string | null };

export function sortNotes<T extends Sortable>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.pinned_at && b.pinned_at) return b.pinned_at.localeCompare(a.pinned_at) || a.id - b.id;
    if (a.pinned_at || b.pinned_at) return a.pinned_at ? -1 : 1;
    return a.created_at.localeCompare(b.created_at) || a.id - b.id;
  });
}
