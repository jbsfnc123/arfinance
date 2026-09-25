// Memo global per identitas argumen: objek → WeakMap (ikut terhapus saat data versi lama dibuang),
// nilai primitif → Map. Dipakai untuk membagi hasil hitungan berat antar halaman.

type Node = { w?: WeakMap<object, Node>; m?: Map<unknown, Node>; has?: boolean; v?: unknown };

export function memoize<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const root: Node = {};
  return (...args: A) => {
    let node = root;
    for (const a of args) {
      const isObj = a !== null && (typeof a === "object" || typeof a === "function");
      let next: Node | undefined;
      if (isObj) {
        node.w ??= new WeakMap();
        next = node.w.get(a as object);
        if (!next) node.w.set(a as object, (next = {}));
      } else {
        node.m ??= new Map();
        next = node.m.get(a);
        if (!next) node.m.set(a, (next = {}));
      }
      node = next;
    }
    if (!node.has) { node.v = fn(...args); node.has = true; }
    return node.v as R;
  };
}
