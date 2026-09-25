// Penyimpanan cache di IndexedDB browser (fallback ke memori bila IndexedDB tidak tersedia,
// mis. mode privat atau diblokir). Dua store: "data" (isi) dan "meta" (ukuran & waktu pakai)
// supaya pembersihan LRU tidak perlu membaca isi data yang besar.

const DB_NAME = "arw-cache";
const VERSION = 1;

export type Entry<T = unknown> = { token: string; data: T; at: number };
export type Meta = { key: string; size: number; at: number };

let dbp: Promise<IDBDatabase | null> | null = null;
const mem = new Map<string, Entry>();
const memMeta = new Map<string, Meta>();

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("data");
        req.result.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void) {
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function idbGet<T>(key: string): Promise<Entry<T> | null> {
  const db = await open();
  if (!db) return (mem.get(key) as Entry<T>) ?? null;
  try {
    return ((await tx<Entry<T>>(db, ["data"], "readonly", (t) => t.objectStore("data").get(key))) as Entry<T>) ?? null;
  } catch {
    return null;
  }
}

export async function idbPut<T>(key: string, entry: Entry<T>, size: number) {
  const db = await open();
  const meta: Meta = { key, size, at: entry.at };
  if (!db) { mem.set(key, entry); memMeta.set(key, meta); return; }
  try {
    await tx(db, ["data", "meta"], "readwrite", (t) => {
      t.objectStore("data").put(entry, key);
      t.objectStore("meta").put(meta);
    });
  } catch {
    /* kuota penuh / diblokir: cache hanya dilewati */
  }
}

export async function idbTouch(key: string, size: number) {
  const db = await open();
  const meta: Meta = { key, size, at: Date.now() };
  if (!db) { memMeta.set(key, meta); return; }
  try { await tx(db, ["meta"], "readwrite", (t) => { t.objectStore("meta").put(meta); }); } catch { /* abaikan */ }
}

export async function idbMetas(): Promise<Meta[]> {
  const db = await open();
  if (!db) return [...memMeta.values()];
  try {
    return ((await tx<Meta[]>(db, ["meta"], "readonly", (t) => t.objectStore("meta").getAll())) as Meta[]) ?? [];
  } catch {
    return [];
  }
}

export async function idbDel(keys: string[]) {
  const db = await open();
  if (!db) { keys.forEach((k) => { mem.delete(k); memMeta.delete(k); }); return; }
  try {
    await tx(db, ["data", "meta"], "readwrite", (t) => {
      for (const k of keys) { t.objectStore("data").delete(k); t.objectStore("meta").delete(k); }
    });
  } catch { /* abaikan */ }
}

// Dipanggil saat logout: data tidak tertinggal di komputer bersama.
export async function idbClear() {
  mem.clear();
  memMeta.clear();
  const db = await open();
  if (!db) return;
  try {
    await tx(db, ["data", "meta"], "readwrite", (t) => { t.objectStore("data").clear(); t.objectStore("meta").clear(); });
  } catch { /* abaikan */ }
}
