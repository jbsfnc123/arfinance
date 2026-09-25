/* Metrik inti (port webapp/Calc.js tanpa GAS). Semua nilai Rupiah penuh. */

function g_(D, key, ym) {
  const r = D.map[key];
  if (!r) return null;
  const x = r.vals[ym];
  return x === undefined ? null : x;
}
function src_(D, key, ym) {
  const r = D.map[key];
  return r && r.src[ym] ? r.src[ym] : null;
}
function label_(D, key, dflt) { return D.map[key] ? D.map[key].label : dflt; }
function sum_(arr) { return arr.reduce((a, x) => a + (x || 0), 0); }
function anyNum_(arr) { return arr.some(x => x !== null && x !== undefined); }

/** Sales = TOP + Ex DO + CBD (ALL); fallback nilai historis Excel. */
function sales_(D, ym) {
  const p = [0, 1, 2].map(i => g_(D, 'amt_all:' + i, ym));
  if (anyNum_(p)) return sum_(p);
  const h = g_(D, 'sales_hist', ym);
  if (h !== null) return h;
  const s = g_(D, 'sales', ym);
  return s ? s : null;                   // 0 dari rumus Excel bulan kosong = tidak ada data
}
function invCount_(D, ym) {
  const p = [0, 1, 2].map(i => g_(D, 'cnt_all:' + i, ym));
  return anyNum_(p) ? sum_(p) : null;
}
function salesSrc_(D, ym) {
  return src_(D, 'amt_all:0', ym) || src_(D, 'sales_hist', ym) || src_(D, 'sales', ym);
}

function openAmt_(D, ym) {
  const v = g_(D, 'open', ym);
  if (v !== null) return v;
  const h = (D.manual['AR Historis'] || []).find(r => r.Bulan === ym);
  return h ? Number(h['A/R Ending Balance (Rp)']) || null : null;
}

/** 0..3 bucket, 4 = Due >90 (total >90 − Bad Debt manual), 5 = Bad Debt. */
function agingVal_(D, i, ym) {
  if (i === 4) {
    const over = g_(D, 'over90', ym);
    if (over !== null) return over - (g_(D, 'aging:5', ym) || 0);
  }
  return g_(D, 'aging:' + i, ym);
}
function overdue_(D, ym) {
  const v = [0, 1, 2, 3, 4, 5].map(i => agingVal_(D, i, ym));
  return anyNum_(v) ? sum_(v) : null;
}
function odRatio_(D, ym) {
  const open = g_(D, 'open', ym);
  if (open) return overdue_(D, ym) / open;
  const h = g_(D, 'odratio_hist', ym);
  return h !== null ? h : g_(D, 'odratio:0', ym);
}
function arDays_(D, ym) {
  const open = g_(D, 'open', ym);
  const tops = [-2, -1, 0].map(k => g_(D, 'amt_all:0', addM_(ym, k)));
  if (open && tops.every(x => x !== null)) return open / (sum_(tops) / 3) * 30;
  return g_(D, 'ardays:0', ym);
}
function arDaysParts_(D, ym) {
  const tops = [-2, -1, 0].map(k => [addM_(ym, k), g_(D, 'amt_all:0', addM_(ym, k))]);
  return { open: g_(D, 'open', ym), tops: tops, avg: tops.every(t => t[1] !== null) ? sum_(tops.map(t => t[1])) / 3 : null };
}

/** Roll-forward AR: Beginning = Ending bulan lalu, Invoice = Sales, Collection = Beg + Inv − End. */
function rollForward_(D, ym) {
  const beg = openAmt_(D, addM_(ym, -1));
  const inv = sales_(D, ym);
  const end = openAmt_(D, ym);
  return { beg: beg, inv: inv, end: end, col: beg !== null && inv !== null && end !== null ? beg + inv - end : null };
}

/** Collection: scope 'all' (jumlah 5 group), 'top5', 'wo5'. */
function collNums_(D, m, scope) {
  if (scope === 'all') {
    const s = pre => { const v = [0, 1, 2, 3, 4].map(i => g_(D, pre + ':' + i, m)); return anyNum_(v) ? sum_(v) : null; };
    return { t: s('coll_tgt'), a: s('coll_act'), w: s('coll_w') };
  }
  return { t: g_(D, scope + '_tgt', m), a: g_(D, scope + '_act', m), w: g_(D, scope + '_w', m) };
}
function collPct_(D, m) {
  const x = collNums_(D, m, 'all');
  return x.t ? x.a / x.t : null;
}

/** Jumlah; null bila semua kosong (bukan 0). */
function sumN_(arr) { return anyNum_(arr) ? sum_(arr) : null; }

/** Baris tabel manual bulan m; bila kosong pakai bulan terakhir sebelumnya (ditandai stale). */
function manualRows_(D, t, m) {
  const all = D.manual[t] || [];
  const cur = all.filter(r => r.Bulan === m);
  if (cur.length) return { rows: cur, ym: m, stale: false };
  const prev = all.map(r => r.Bulan).filter(ym => ym && ym < m).sort().pop();
  return prev ? { rows: all.filter(r => r.Bulan === prev), ym: prev, stale: true } : { rows: [], ym: m, stale: false };
}
function stalePill_(o) {
  return o && o.stale ? '<span class="pill" style="background:var(--warn-soft);color:var(--warn);border-color:transparent">Data per ' + esc_(idMonth_(o.ym)) + '</span>' : '';
}

// ---------------------------------------------------------------- persen label (sama dengan deck)

function pctLrm_(vals) {
  const t = sum_(vals);
  if (!t) return vals.map(() => null);
  const ex = vals.map(v => 100 * v / t);
  const fl = ex.map(e => Math.floor(e + 1e-9));
  const order = ex.map((e, i) => i).sort((a, b) => (ex[b] - fl[b]) - (ex[a] - fl[a]));
  let d = 100 - sum_(fl);
  for (let k = 0; k < order.length && d > 0; k++, d--) fl[order[k]] += 1;
  return fl;
}

// ---------------------------------------------------------------- bulan tersedia

/** Bulan yang punya data nyata (sales atau open amount). */
function availableMonths_(D) {
  return D.months.filter(ym => {
    const s = sales_(D, ym);
    return (s !== null && s > 0) || g_(D, 'open', ym) !== null;
  });
}

/** Kelengkapan data per bulan (untuk cover & Data Center). */
function coverage_(D, ym) {
  const has = k => g_(D, k, ym) !== null;
  return [
    { id: 'sales', label: 'Sales', ok: sales_(D, ym) !== null, src: salesSrc_(D, ym) },
    { id: 'aging', label: 'Aging', ok: has('open'), src: src_(D, 'open', ym) },
    { id: 'coll', label: 'Collection', ok: has('coll_tgt:0'), src: src_(D, 'coll_tgt:0', ym) },
    { id: 'bpsales', label: 'Detail BP Sales', ok: D.bpMonths.sales.indexOf(ym) >= 0, src: 'raw' },
    { id: 'bpaging', label: 'Detail BP Aging', ok: D.bpMonths.aging.indexOf(ym) >= 0, src: 'raw' },
    { id: 'pay', label: 'Late days (payment)', ok: (D.bpMonths.pay || []).indexOf(ym) >= 0, src: 'raw' },
    { id: 'master', label: 'Master BP', ok: !!(D.bpMaster && Object.keys(D.bpMaster).length), src: 'raw' },
    { id: 'manual', label: 'Tabel manual', ok: Object.keys(D.manual).some(t => (D.manual[t] || []).some(r => r.Bulan === ym)), src: 'manual' },
  ];
}

if (typeof module !== 'undefined') module.exports = {};
