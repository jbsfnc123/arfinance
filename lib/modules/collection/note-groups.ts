
// Port buildNoteGroups (Aplikasi Utama/Script.html): catatan terbaru per invoice
// dikelompokkan per Kategori + BP + isi. Grup mengikuti urutan catatan terbaru.

// Catatan terbaru per invoice + nominal open (dihitung di browser, lib/modules/collection/rows.ts).
export type NoteLatest = {
  id: number | null; invoice_no: string | null; kategori: string | null; business_partner: string | null; isi: string | null;
  collection_name: string | null; invoice_date: string | null; no_po: string | null; no_sj: string | null; done: boolean | null;
  closed_by: string | null; closed_at: string | null; created_at: string | null; nominal: number | null;
};

export type NoteGroup = {
  key: string;
  kategori: string;
  bp: string;
  isi: string;
  items: NoteLatest[];
  nomTotal: number;
  collections: string[];
  lateCount: number;
  done: boolean;
  closedBy: string | null;
  closedAt: string | null;
};

export const bpKey = (bp: string | null | undefined) => (bp ?? "").trim() || "Tanpa Partner";

export function buildNoteGroups(notes: NoteLatest[], currentMonth: string): NoteGroup[] {
  const sorted = [...notes].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  // Diurutkan id menurun, jadi anggota pertama tiap grup = catatan terbaru (penentu done/closed).
  const groups = new Map<string, NoteGroup>();

  for (const n of sorted) {
    const bp = bpKey(n.business_partner);
    const isi = (n.isi ?? "").trim();
    const key = `${n.kategori}\0${bp}\0${isi}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key, kategori: n.kategori ?? "", bp, isi, items: [], nomTotal: 0, collections: [], lateCount: 0,
        done: !!n.done, closedBy: n.closed_by, closedAt: n.closed_at,
      };
      groups.set(key, g);
    }
    g.items.push(n);
    g.nomTotal += Number(n.nominal) || 0;
    if (n.collection_name && !g.collections.includes(n.collection_name)) g.collections.push(n.collection_name);
    if (n.invoice_date && n.invoice_date.slice(0, 7) < currentMonth) g.lateCount++;
  }

  return [...groups.values()];
}

export type StatusFilter = "open" | "done" | "all";

export const filterGroups = (groups: NoteGroup[], status: StatusFilter) =>
  status === "all" ? groups : groups.filter((g) => (status === "done" ? g.done : !g.done));
