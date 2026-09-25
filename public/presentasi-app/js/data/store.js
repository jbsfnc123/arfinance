/* Penyimpanan + pipeline import file.
 * Di AR Workspace, halaman induk (/presentasi) menyediakan window.ARDeckBridge yang
 * menyimpan state ke Supabase (tabel deck_state). Tanpa bridge: IndexedDB seperti semula. */

const Store = (() => {
  const DB = 'ar-deck-demo';
  const KEY = 'state';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB tidak tersedia')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function bridge() {
    try { return window.parent !== window ? window.parent.ARDeckBridge || null : null; } catch (e) { return null; }
  }

  async function load() {
    // Dalam iframe: tunggu sebentar sampai halaman induk memasang bridge.
    for (let i = 0; i < 40 && window.parent !== window && !bridge(); i++) await new Promise(r => setTimeout(r, 50));
    const b = bridge();
    if (b) return b.load(window);
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 2500));
    return Promise.race([loadIdb(), timeout]);
  }

  async function loadIdb() {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const r = db.transaction('kv').objectStore('kv').get(KEY);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    } catch (err) {
      return null;
    }
  }

  async function save(state) {
    state.savedAt = new Date().toISOString();
    const b = bridge();
    if (b) return b.save(state);
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(state, KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  async function clear() {
    const b = bridge();
    if (b) return b.clear();
    try {
      const db = await open();
      await new Promise(resolve => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(KEY);
        tx.oncomplete = resolve;
      });
    } catch (err) { /* abaikan */ }
  }

  // ---------------------------------------------------------------- parsing (Web Worker bila bisa)

  let worker = null;
  let seq = 0;
  const pending = {};
  function getWorker() {
    if (worker !== null) return worker;
    try {
      if (location.protocol === 'file:') throw new Error('file://');
      worker = new Worker('js/data/worker.js');
      worker.onmessage = e => {
        const p = pending[e.data.id];
        if (!p) return;
        delete pending[e.data.id];
        if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.result);
      };
      worker.onerror = e => {                      // worker gagal dimuat -> semua permintaan jatuh ke main thread
        e.preventDefault();
        worker = false;
        Object.keys(pending).forEach(id => { pending[id].fallback(); delete pending[id]; });
      };
    } catch (err) {
      worker = false;
    }
    return worker;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      if (/\.json$/i.test(file.name)) fr.readAsText(file); else fr.readAsArrayBuffer(file);
    });
  }

  /** File -> hasil parse ({kind, months, series, ...}). Snapshot .json -> {kind:'snapshot', state}. */
  async function parseFile(file) {
    const data = await readFile(file);
    if (/\.json$/i.test(file.name)) {
      const st = JSON.parse(data);
      if (!st || !st.layers || !st.version) throw new Error('File JSON bukan snapshot AR Deck.');
      return { kind: 'snapshot', file: file.name, state: st, months: [], stats: { disimpan: st.savedAt || '-' } };
    }
    const main = () => parseWorkbook_(new Uint8Array(data), file.name);
    const w = getWorker();
    if (w) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending[id] = { resolve, reject, fallback: () => { try { resolve(main()); } catch (err) { reject(err); } } };
        w.postMessage({ id: id, name: file.name, buf: data.slice(0) });   // salinan: data asli tetap untuk fallback
      });
    }
    await new Promise(r => setTimeout(r, 30));            // biarkan UI menggambar status
    return main();
  }

  return { load, save, clear, parseFile, bridge };
})();
