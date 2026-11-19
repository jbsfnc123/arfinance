// Penyimpanan lokal kecil (key → value) di IndexedDB browser untuk data kerja yang SENGAJA tidak dikirim ke server
// (mis. SO & hasil rekonsiliasi Cek Selisih Harga, Fase 83). Terpisah dari "arw-cache" (lib/cache/idb.ts) karena cache
// itu bisa membuang entri lama otomatis (LRU). Dikosongkan saat logout (shell-chrome → kvClear).
// Fallback ke memori bila IndexedDB tidak tersedia (mode privat / diblokir): data hanya bertahan selama tab terbuka.

const DB_NAME = "arw-local";
const STORE = "kv";

let dbp: Promise<IDBDatabase | null> | null = null;
const mem = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void) {
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction([STORE], mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await open();
  if (!db) return (mem.get(key) as T) ?? null;
  try {
    return ((await run<T>(db, "readonly", (s) => s.get(key))) as T) ?? null;
  } catch {
    return null;
  }
}

/** Simpan; melempar galat bila gagal (mis. kuota penuh) agar pemanggil bisa memberi tahu pengguna. */
export async function kvSet<T>(key: string, value: T) {
  const db = await open();
  if (!db) { mem.set(key, value); return; }
  await run(db, "readwrite", (s) => { s.put(value, key); });
}

export async function kvDel(key: string) {
  const db = await open();
  if (!db) { mem.delete(key); return; }
  try { await run(db, "readwrite", (s) => { s.delete(key); }); } catch { /* abaikan */ }
}

/** Dipanggil saat logout: data kerja lokal tidak tertinggal di komputer bersama. */
export async function kvClear() {
  mem.clear();
  const db = await open();
  if (!db) return;
  try { await run(db, "readwrite", (s) => { s.clear(); }); } catch { /* abaikan */ }
}
