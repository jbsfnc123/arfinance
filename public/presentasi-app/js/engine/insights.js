/*
 * Insight & drill-down (bagian dasar diambil dari webapp/Insight.js) + narasi otomatis untuk manajemen.
 *
 * Panel = daftar seksi: {t:'kv'|'table'|'bars'|'note', ...}; lihat ui/drawer.js untuk render.
 */
const NO_BP = 'Detail per BP belum tersedia untuk bulan ini. Import file Invoice/Aging/Payment mentah di Data Center.';

function kv_(title, rows) { return { t: 'kv', title: title, rows: rows.filter(r => r) }; }

function tb_(title, cols, rows, foot) { return { t: 'table', title: title, cols: cols, rows: rows, foot: foot || null }; }

function bars_(title, rows) { return { t: 'bars', title: title, rows: rows }; }

function note_(text) { return { t: 'note', text: text }; }

function bp_(D) {
  if (D._bp) return D._bp;
  const group = (rows, i) => {
    const o = {};
    (rows || []).forEach(r => { (o[r[i]] = o[r[i]] || []).push(r); });
    return o;
  };
  D._bp = { sales: group(D.bpSales, BPS.ym), aging: group(D.bpAging, BPA.ym), pay: group(D.payments, BPP.ym) };
  return D._bp;
}

/** Nama ternormalisasi: huruf kecil, tanpa PT/CV, tanpa "(…)" dan akhiran " - …". */
function nm_(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase()
    .replace(/\s+-\s+.*$/, '').replace(/\([^)]*\)/g, ' ').replace(/\b(pt|cv|ud|tbk)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Baris master BP untuk Key BP (atau null). */
function master_(D, key) {
  return D.bpMaster ? D.bpMaster[keyNo_(key)] || null : null;
}
function hasMaster_(D) { return !!(D.bpMaster && Object.keys(D.bpMaster).length); }

function grpCode_(g) {
  const s = String(g || '').toLowerCase().replace(/^\d+\s*-\s*/, '').trim();
  if (!s) return '';
  if (s.indexOf('tradi') === 0) return 'trad';
  if (s.indexOf('resel') === 0) return 'res';
  if (/^(modern market nas|modern market nation|mo nas|mm nas|modern outlet nas)/.test(s)) return 'mmn';
  if (/^(modern market|modern outlet|mo\b|mm\b)/.test(s)) return 'mm';
  if (/^(end user|proyek|project)/.test(s)) return 'eup';
  if (/^e ?commerce/.test(s)) return 'ecom';
  return s;
}

const GRP_OF_IDX = ['trad', 'res', 'mmn', 'mm', 'eup'];

/** Filter scope ALL/Traditional/Reseller (kolom Marketing Group = indeks 4 di BPS & BPP). */
function inScope_(r, scope) {
  if (scope === 'trad') return r[BPS.grp] === 'Traditional';
  if (scope === 'res') return r[BPS.grp] === 'Reseller';
  return !rawExcluded_(r[BPS.grp]);
}

function sumBy_(rows, keyFn) {
  const out = {};
  rows.forEach(r => {
    const k = keyFn(r);
    let a = out[k];
    if (!a) a = out[k] = { name: r[BPS.name] || r[BPS.key], pg: r[BPS.pg], grp: r[BPS.grp], amt: 0, cnt: 0, keys: {} };
    a.amt += Number(r[BPS.amt]) || 0;
    a.cnt += Number(r[BPS.cnt]) || 0;
    a.keys[r[BPS.key]] = 1;
  });
  return out;
}

function topSales_(rows, n) {
  const agg = sumBy_(rows, r => r[BPS.key]);
  const list = Object.keys(agg).map(k => agg[k]).sort((a, b) => b.amt - a.amt);
  const total = list.reduce((a, x) => a + x.amt, 0);
  return list.slice(0, n || 10).map(x => [x.name, x.amt, jt_(x.amt) + ' · ' + x.cnt + ' inv' + (total ? ' · ' + pc_(x.amt / total) : '')]);
}

// ---------------------------------------------------------------- late days (file Invoice Payment Date, per bulan PAYMENT)

/** Agregasi baris payment -> {n, sum, avg, max, amt, ex}. Rata-rata = per transaksi. */
function lateAgg_(rows) {
  const a = { n: 0, sum: 0, max: null, amt: 0, ex: 0, keys: {} };
  rows.forEach(r => {
    const n = Number(r[BPP.n]) || 0;
    a.n += n;
    a.sum += Number(r[BPP.sum]) || 0;
    a.amt += Number(r[BPP.amt]) || 0;
    a.ex += Number(r[BPP.ex]) || 0;
    if (n && r[BPP.max] !== '' && r[BPP.max] !== null) a.max = a.max === null ? Number(r[BPP.max]) : Math.max(a.max, Number(r[BPP.max]));
    a.keys[r[BPP.key]] = 1;
  });
  a.avg = a.n ? a.sum / a.n : null;
  return a;
}
function lateTxt_(a) { return a && a.n ? days_(a.avg) + ' (' + grp_(a.n, '.') + ' trx)' : '-'; }
/** Late days bulan payment ym untuk baris yang lolos filter; null bila file payment bulan itu belum diimpor. */
function lateFor_(D, ym, filter) {
  const rows = bp_(D).pay[ym];
  return rows ? lateAgg_(filter ? rows.filter(filter) : rows) : null;
}
/** Late days untuk nama payment group / BP; null = belum ada file payment bulan itu, {n:0} = tidak ada transaksi. */
function lateByName_(D, names, ym) {
  if (!bp_(D).pay[ym]) return null;
  const idx = nameIdx_(D, 'pay', ym);
  for (let i = 0; i < names.length; i++) {
    const h = lookup_(idx, names[i]);
    if (h.length) return lateAgg_(h);
  }
  return lateAgg_([]);
}

// ---------------------------------------------------------------- indeks nama

function nameIdx_(D, kind, ym) {
  const B = bp_(D);
  const cache = B.idx || (B.idx = {});
  const id = kind + '|' + ym;
  if (cache[id]) return cache[id];
  const rows = (kind === 'sales' ? B.sales : kind === 'aging' ? B.aging : B.pay)[ym] || [];
  const cols = kind === 'sales' ? [BPS.pg, BPS.name] : kind === 'aging' ? [BPA.pg, BPA.name] : [BPP.pg, BPP.name];
  const kcol = kind === 'sales' ? BPS.key : kind === 'aging' ? BPA.key : BPP.key;
  const byName = {};
  const byKey = {};
  const add = (k, r) => { if (k && (byName[k] = byName[k] || []).indexOf(r) < 0) byName[k].push(r); };
  rows.forEach(r => {
    cols.forEach(c => add(nm_(r[c]), r));
    const ms = master_(D, r[kcol]);                   // payment group resmi dari master BP
    if (ms) { add(nm_(ms[BPM.pg]), r); add(nm_(ms[BPM.name]), r); }
    const kn = keyNo_(r[kcol]);
    if (kn) (byKey[kn] = byKey[kn] || []).push(r);
  });
  cache[id] = { byName: byName, byKey: byKey, names: Object.keys(byName) };
  return cache[id];
}

function lookup_(idx, name) {
  const k = nm_(name);
  const kn = keyNo_(name);
  let hit = [];
  if (k && idx.byName[k]) hit = hit.concat(idx.byName[k]);
  if (/^\d{5,}$/.test(kn) && idx.byKey[kn]) hit = hit.concat(idx.byKey[kn]);
  if (!hit.length && k.length >= 6) {
    idx.names.forEach(v => {
      if (v.length >= 6 && (v.indexOf(k) === 0 || k.indexOf(v) === 0)) hit = hit.concat(idx.byName[v]);
    });
  }
  return hit.filter((r, i) => hit.indexOf(r) === i);
}

// ---------------------------------------------------------------- profil Payment Group / BP

function masterSection_(D, keys, open) {
  const list = keys.map(k => master_(D, k)).filter(Boolean);
  if (!list.length) return hasMaster_(D) ? [note_('BP tidak ada di master Business Partner.')] : [];
  const m0 = list[0];
  const limit = list.reduce((a, x) => a + (Number(x[BPM.limit]) || 0), 0);
  const last = list.map(x => x[BPM.last]).filter(Boolean).sort().pop();
  const first = list.map(x => x[BPM.first]).filter(Boolean).sort()[0];
  const today = new Date();
  const since = d => (d ? ' (' + grp_(dayDiff_(today, rawDate_(d)), '.') + ' hari lalu)' : '');
  const status = {};
  list.forEach(x => { if (x[BPM.status]) status[x[BPM.status]] = (status[x[BPM.status]] || 0) + 1; });
  return [kv_('Master Business Partner' + (list.length > 1 ? ' (' + list.length + ' BP)' : ''), [
    list.length === 1 ? ['Search Key', m0[BPM.key]] : null,
    ['PIC AR', m0[BPM.pic] || '-'], ['Sales / Agent', m0[BPM.sales] || '-'],
    ['Payment Term resmi', m0[BPM.term] || '-'],
    ['Credit limit', limit ? money_(limit) + (open ? '  (terpakai ' + pc_(open / limit, 0) + ')' : '') : 'tidak ada'],
    ['Status kredit', Object.keys(status).map(s => s + (list.length > 1 ? ' ×' + status[s] : '')).join(', ') || '-'],
    m0[BPM.type] ? ['Tipe pelanggan', m0[BPM.type]] : null,
    ['Region · Branch', (m0[BPM.region] || '-') + ' · ' + (m0[BPM.branch] || '-').replace(/^\d+-\w+_/, '')],
    first ? ['Pelanggan sejak', first] : null,
    last ? ['Transaksi terakhir', last + since(last)] : null,
  ])].concat(m0[BPM.desc] ? [kv_('Catatan master', [['Description', m0[BPM.desc]]])] : []);
}

function profile_(D, names, ym) {
  const B = bp_(D);
  const months = [-2, -1, 0].map(k => addM_(ym, k));
  const find = (kind, m) => {
    const idx = nameIdx_(D, kind, m);
    for (let i = 0; i < names.length; i++) {
      const h = lookup_(idx, names[i]);
      if (h.length) return h;
    }
    return [];
  };
  const out = [];
  const hasSales = months.some(m => B.sales[m]);
  const hasPay = months.some(m => B.pay[m]);
  const agRows = find('aging', ym);
  const sRows = months.map(m => find('sales', m));
  const pRows = months.map(m => (B.pay[m] ? find('pay', m) : null));
  const all = [].concat.apply([], sRows);
  const allPay = [].concat.apply([], pRows.filter(Boolean));

  if (!hasSales && !hasPay && !(B.aging[ym] || []).length) return [note_(NO_BP)];
  if (!all.length && !agRows.length && !allPay.length) {
    return [note_('Nama "' + names.filter(Boolean)[0] + '" tidak ditemukan di data Sales / Aging / Payment (' + abbr_(ym) + ').')];
  }

  const keys = [];
  agRows.slice().sort((a, b) => b[BPA.open] - a[BPA.open]).forEach(r => { if (keys.indexOf(r[BPA.key]) < 0) keys.push(r[BPA.key]); });
  all.concat(allPay).forEach(r => { if (keys.indexOf(r[1]) < 0) keys.push(r[1]); });
  const a0 = agRows[0];
  const g = all[0] || allPay[0];
  const ms0 = master_(D, keys[0]);
  out.push(kv_('Profil', [
    ['Marketing Group', a0 ? a0[BPA.grp] : g ? g[BPS.grp] : ms0 ? ms0[BPM.grp] : '-'],
    ['PIC AR', (ms0 && ms0[BPM.pic]) || (a0 && a0[BPA.coll]) || '-'],
    ['Sales', (ms0 && ms0[BPM.sales]) || (a0 && a0[BPA.sales]) || '-'],
    ['Branch', a0 ? a0[BPA.branch] : g && g[BPS.branch] ? g[BPS.branch] : '-'],
    ['Jumlah BP', String(keys.length)],
  ]));

  const open = agRows.reduce((x, r) => x + (Number(r[BPA.open]) || 0), 0);
  if (hasSales || hasPay) {
    const rows = months.map((m, i) => {
      const s = sRows[i].length ? sumBy_(sRows[i], () => 'x').x : null;
      const L = pRows[i] ? lateAgg_(pRows[i]) : null;
      return [abbr_(m), B.sales[m] ? jt_(s ? s.amt : 0) : 'belum diimpor', s ? String(s.cnt) : '-',
        !pRows[i] ? 'belum diimpor' : L.n ? days_(L.avg) : '–', L && L.n ? String(L.n) : '-'];
    });
    const tot = all.length ? sumBy_(all, () => 'x').x : null;
    const LT = lateAgg_(allPay);
    out.push(tb_('Sales & late days 3 bulan', [{ h: 'Bulan' }, { h: 'Sales', align: 'right' }, { h: 'Inv', align: 'right' },
      { h: 'Late days', align: 'right' }, { h: 'Trx', align: 'right' }], rows,
    ['Total', jt_(tot ? tot.amt : 0), tot ? String(tot.cnt) : '0', LT.n ? days_(LT.avg) : '–', LT.n ? String(LT.n) : '-']));
    if (LT.n) {
      out.push(kv_('Pembayaran (file Invoice Payment Date)', [['Rata-rata late days', days_(LT.avg)], ['Terlama', days_(LT.max)],
        ['Transaksi dihitung', grp_(LT.n, '.') + (LT.ex ? ' (+' + LT.ex + ' dibuang: invoice = due date)' : '')],
        ['Total dibayar', money_(LT.amt)]]));
    }
    out.push(note_('Late days = Payment Date − Due Date, rata-rata semua transaksi di bulan pembayaran. Transaksi dengan Invoice Date = Due Date tidak dihitung.'));
  }

  if (agRows.length) {
    const s = i => agRows.reduce((x, r) => x + (Number(r[i]) || 0), 0);
    const od = s(BPA.b1) + s(BPA.b2) + s(BPA.b3) + s(BPA.b4) + s(BPA.b5);
    out.push(kv_('Outstanding per ' + lastDay_(ym) + ' ' + abbr_(ym), [
      ['Open amount', jt_(open)],
      ['Belum jatuh tempo', jt_(s(BPA.notdue))],
      ['Overdue', jt_(od) + (open ? ' (' + pc_(od / open) + ')' : '')],
      ['  1–15 hari', jt_(s(BPA.b1))], ['  16–30 hari', jt_(s(BPA.b2))], ['  31–60 hari', jt_(s(BPA.b3))],
      ['  61–90 hari', jt_(s(BPA.b4))], ['  > 90 hari', jt_(s(BPA.b5))],
      ['Umur overdue terlama', days_(Math.max.apply(null, agRows.map(r => Number(r[BPA.maxd]) || 0)))],
    ]));
  } else if ((B.aging[ym] || []).length) {
    out.push(note_('Tidak ada saldo outstanding per ' + abbr_(ym) + ' di data Aging.'));
  }
  out.push.apply(out, masterSection_(D, keys, open));
  if (agRows.length) {
    const fu = agRows.map(r => r[BPA.fu]).filter(Boolean);
    if (fu.length) out.push(kv_('Follow up (file Aging)', [['Catatan', fu.join(' | ').slice(0, 400)]]));
    if (agRows.length > 1) {
      out.push(bars_('BP dengan open terbesar', agRows.slice().sort((a, b) => b[BPA.open] - a[BPA.open]).slice(0, 5)
        .map(r => [r[BPA.name], Number(r[BPA.open]), jt_(r[BPA.open])])));
    }
  }
  return out;
}

// ---------------------------------------------------------------- per marketing group

function groupInfo_(D, idx, ym) {
  const code = GRP_OF_IDX[idx];
  const B = bp_(D);
  const out = [];
  const sales = (B.sales[ym] || []).filter(r => grpCode_(r[BPS.grp]) === code);
  const aging = (B.aging[ym] || []).filter(r => grpCode_(r[BPA.grp]) === code);
  const L = lateFor_(D, ym, r => grpCode_(r[BPP.grp]) === code);
  if (sales.length) {
    const a = sumBy_(sales, () => 'x').x;
    out.push(kv_('Sales ' + abbr_(ym), [['Invoice amount', jt_(a.amt)], ['Invoice', String(a.cnt)],
      ['Rata-rata per invoice', jt_(a.amt / a.cnt)], ['BP aktif', String(Object.keys(a.keys).length)]]));
  }
  if (L) out.push(kv_('Pembayaran ' + abbr_(ym), [['Avg late days', lateTxt_(L)], ['Total dibayar', money_(L.amt)]]));
  if (aging.length) {
    const s = i => aging.reduce((x, r) => x + (Number(r[i]) || 0), 0);
    const open = s(BPA.open);
    const od = s(BPA.b1) + s(BPA.b2) + s(BPA.b3) + s(BPA.b4) + s(BPA.b5);
    out.push(kv_('Outstanding per ' + lastDay_(ym) + ' ' + abbr_(ym), [['Open amount', jt_(open)],
      ['Belum jatuh tempo', jt_(s(BPA.notdue))], ['Overdue', jt_(od) + (open ? ' (' + pc_(od / open) + ')' : '')],
      ['  1–30 hari', jt_(s(BPA.b1) + s(BPA.b2))], ['  31–90 hari', jt_(s(BPA.b3) + s(BPA.b4))], ['  > 90 hari', jt_(s(BPA.b5))]]));
    const od5 = aging.map(r => [r[BPA.name], BPA_OD_(r)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (od5.length) out.push(bars_('Top 5 BP overdue', od5.map(x => [x[0], x[1], jt_(x[1])])));
  }
  if (!sales.length && !aging.length) out.push(note_(NO_BP));
  return out;
}

// ---------------------------------------------------------------- PIC AR & pelanggan tidak aktif (master BP)

/** PIC AR per BP: master BP, fallback kolom Collection Name di file Aging. */
function picOf_(D, r) {
  const ms = master_(D, r[BPA.key]);
  const coll = String(r[BPA.coll] || '').trim();
  return (ms && ms[BPM.pic]) || (coll && coll !== 'null' ? coll : '(tanpa PIC)');
}

function picPerf_(D, m) {
  const rows = bp_(D).aging[m] || [];
  if (!rows.length) return null;
  const by = {};
  rows.forEach(r => {
    const p = picOf_(D, r);
    const a = by[p] = by[p] || { pic: p, bp: 0, open: 0, od: 0, o90: 0, b: [0, 0, 0, 0, 0], notdue: 0, rows: [] };
    a.bp += 1;
    a.open += Number(r[BPA.open]) || 0;
    a.notdue += Number(r[BPA.notdue]) || 0;
    [BPA.b1, BPA.b2, BPA.b3, BPA.b4, BPA.b5].forEach((c, i) => { a.b[i] += Number(r[c]) || 0; });
    a.od += BPA_OD_(r);
    a.o90 += Number(r[BPA.b5]) || 0;
    a.rows.push(r);
  });
  const pay = bp_(D).pay[m] || [];
  const lat = {};
  pay.forEach(r => {
    const ms = master_(D, r[BPP.key]);
    const p = ms && ms[BPM.pic];
    if (p) (lat[p] = lat[p] || []).push(r);
  });
  const list = Object.keys(by).map(k => {
    const a = by[k];
    a.late = lat[k] ? lateAgg_(lat[k]) : null;
    a.odPct = a.open ? a.od / a.open : null;
    return a;
  }).sort((x, y) => y.open - x.open);
  return { list: list, hasPay: pay.length > 0, hasMaster: hasMaster_(D) };
}

function drillPic_(D, m, a) {
  const out = [kv_('Ringkasan ' + abbr_(m), [['Jumlah BP dengan saldo', grp_(a.bp, '.')], ['Open amount', money_(a.open)],
    ['Overdue', money_(a.od) + ' (' + pc_(a.odPct) + ')'], ['> 90 hari', money_(a.o90)],
    ['Avg late days (pembayaran ' + abbr_(m) + ')', a.late ? lateTxt_(a.late) : '-']]),
  tb_('Umur overdue', [{ h: 'Bucket' }, { h: 'Nilai', align: 'right' }],
    [['Belum jatuh tempo', money_(a.notdue)], ['1–15 hari', money_(a.b[0])], ['16–30 hari', money_(a.b[1])], ['31–60 hari', money_(a.b[2])],
      ['61–90 hari', money_(a.b[3])], ['> 90 hari', money_(a.b[4])]])];
  const od = a.rows.map(r => [r[BPA.name], BPA_OD_(r)]).filter(x => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 10);
  if (od.length) out.push(bars_('Top 10 BP overdue', od.map(x => [x[0], x[1], money_(x[1])])));
  const pay = (bp_(D).pay[m] || []).filter(r => { const ms = master_(D, r[BPP.key]); return ms && ms[BPM.pic] === a.pic; });
  const byBp = {};
  pay.forEach(r => { (byBp[r[BPP.key]] = byBp[r[BPP.key]] || []).push(r); });
  const slow = Object.keys(byBp).map(k => [byBp[k][0][BPP.name], lateAgg_(byBp[k])]).filter(x => x[1].n >= 3)
    .sort((x, y) => y[1].avg - x[1].avg).slice(0, 8);
  if (slow.length) out.push(tb_('BP paling lambat bayar (≥ 3 transaksi)', [{ h: 'BP' }, { h: 'Late days', align: 'right' }, { h: 'Trx', align: 'right' }],
    slow.map(x => [x[0], days_(x[1].avg), String(x[1].n)])));
  return out;
}

/**
 * BP dengan saldo terbuka tetapi tidak bertransaksi > minDays sebelum akhir bulan m.
 * Transaksi terakhir = Last Sale di master BP, dan dianggap aktif bila ada penjualan (file Invoice) 3 bulan terakhir
 * dengan Key BP atau nama yang sama (Last Sale di master tidak selalu mutakhir per key).
 */
function dormant_(D, m, minDays) {
  const rows = bp_(D).aging[m] || [];
  if (!rows.length || !hasMaster_(D)) return null;
  const cache = bp_(D).dorm || (bp_(D).dorm = {});
  if (cache[m + '|' + (minDays || 90)]) return cache[m + '|' + (minDays || 90)];
  const end = new Date(yr_(m), mIdx_(m) + 1, 0);
  const lim = minDays || 90;
  const activeKey = {};
  const activeName = {};
  monthRange_(m, -2, 0).forEach(ym => (bp_(D).sales[ym] || []).forEach(r => {
    activeKey[keyNo_(r[BPS.key])] = 1;
    activeName[nm_(r[BPS.name])] = 1;
  }));
  const list = [];
  rows.forEach(r => {
    const open = Number(r[BPA.open]) || 0;
    if (open <= 0) return;
    if (activeKey[keyNo_(r[BPA.key])] || activeName[nm_(r[BPA.name])]) return;
    const ms = master_(D, r[BPA.key]);
    const last = ms && rawDate_(ms[BPM.last]);
    if (!last) return;
    const days = dayDiff_(end, last);
    if (days > lim) list.push({ r: r, ms: ms, days: days, open: open, o90: Number(r[BPA.b5]) || 0 });
  });
  list.sort((a, b) => b.open - a.open);
  cache[m + '|' + lim] = { list: list, n: list.length, open: list.reduce((a, x) => a + x.open, 0), o90: list.reduce((a, x) => a + x.o90, 0),
    salesMonths: monthRange_(m, -2, 0).filter(ym => bp_(D).sales[ym]).length };
  return cache[m + '|' + lim];
}

function BPA_OD_(r) {
  return [BPA.b1, BPA.b2, BPA.b3, BPA.b4, BPA.b5].reduce((a, i) => a + (Number(r[i]) || 0), 0);
}

function mixTable_(D, scope, ym, title) {
  const names = ['TOP', 'Ex DO', 'CBD'];
  const a = names.map((_, i) => g_(D, 'amt_' + scope + ':' + i, ym));
  const n = names.map((_, i) => g_(D, 'cnt_' + scope + ':' + i, ym));
  const A = a.reduce((x, v) => x + (v || 0), 0);
  const N = n.reduce((x, v) => x + (v || 0), 0);
  return tb_(title || 'Komposisi ' + abbr_(ym), [{ h: 'Kategori' }, { h: 'Amount', align: 'right' }, { h: 'Share', align: 'right' },
    { h: 'Inv', align: 'right' }, { h: 'Avg/inv', align: 'right' }],
  names.map((nm, i) => [nm, jt_(a[i]), A ? pc_((a[i] || 0) / A) : '-', n[i] === null ? '-' : grp_(n[i], '.'),
    a[i] && n[i] ? jt_(a[i] / n[i]) : '-']),
  ['Total', jt_(A), '100%', grp_(N, '.'), N ? jt_(A / N) : '-']);
}

function monthSales_(D, ym) {
  const amt = sales_(D, ym);
  const cnt = [0, 1, 2].map(i => g_(D, 'cnt_all:' + i, ym));
  const N = cnt.some(x => x !== null) ? cnt.reduce((a, x) => a + (x || 0), 0) : null;
  return { amt: amt, cnt: N, avg: amt && N ? amt / N : null };
}

function groupSales_(D, ym) {
  const rows = (bp_(D).sales[ym] || []).filter(r => inScope_(r, 'all'));
  if (!rows.length) return [];
  const agg = sumBy_(rows, r => r[BPS.grp]);
  const total = rows.reduce((a, r) => a + (Number(r[BPS.amt]) || 0), 0);
  const list = Object.keys(agg).map(k => [k, agg[k]]).sort((a, b) => b[1].amt - a[1].amt);
  return [tb_('Sales per Marketing Group ' + abbr_(ym), [{ h: 'Group' }, { h: 'Amount', align: 'right' }, { h: 'Share', align: 'right' },
    { h: 'BP', align: 'right' }, { h: 'Avg/inv', align: 'right' }],
  list.map(([g, a]) => [g, jt_(a.amt), pc_(a.amt / total), String(Object.keys(a.keys).length), jt_(a.amt / a.cnt)]))];
}

function topBlock_(D, ym, filter, title) {
  const rows = (bp_(D).sales[ym] || []).filter(filter);
  if (!bp_(D).sales[ym]) return [note_(NO_BP)];
  if (!rows.length) return [];
  return [bars_(title, topSales_(rows, 10))];
}

// ================================================================ drill-down per slide (demo)

function drillSalesMonth_(D, ym) {
  const x = monthSales_(D, ym);
  if (x.amt === null) return [note_('Belum ada data sales ' + full_(ym) + '.')];
  const out = [kv_(idMonth_(ym), [
    ['Sales', money_(x.amt)], ['vs ' + abbr_(addM_(ym, -12)), chg_(x.amt, sales_(D, addM_(ym, -12)))],
    ['vs ' + abbr_(addM_(ym, -1)), chg_(x.amt, sales_(D, addM_(ym, -1)))],
    x.cnt !== null ? ['Invoice', grp_(x.cnt, '.')] : null, x.avg ? ['Rata-rata per invoice', jt_(x.avg)] : null,
    ['Sumber angka', LAYER_LABEL[salesSrc_(D, ym)] || '-'],
  ])];
  if (g_(D, 'amt_all:0', ym) !== null) out.push(mixTable_(D, 'all', ym));
  return out.concat(groupSales_(D, ym), topBlock_(D, ym, r => inScope_(r, 'all'), 'Top 10 BP ' + abbr_(ym)));
}

function drillMix_(D, scope, si, ym) {
  const nm = CATS[si];
  const a = g_(D, 'amt_' + scope + ':' + si, ym);
  const n = g_(D, 'cnt_' + scope + ':' + si, ym);
  if (a === null && n === null) return [note_('Belum ada data.')];
  const A = sum_([0, 1, 2].map(i => g_(D, 'amt_' + scope + ':' + i, ym)));
  const N = sum_([0, 1, 2].map(i => g_(D, 'cnt_' + scope + ':' + i, ym)));
  const rows = (bp_(D).sales[ym] || []).filter(r => inScope_(r, scope) && r[BPS.cat] === nm);
  const agg = rows.length ? sumBy_(rows, () => 'x').x : null;
  const bpN = agg ? Object.keys(agg.keys).length : null;
  return [kv_(nm + ' · ' + idMonth_(ym), [
    ['Amount', money_(a)], ['Invoice', grp_(n, '.')],
    ['Rata-rata per invoice', a && n ? jt_(a / n) : '-'],
    ['Rata-rata per invoice (semua kategori)', A && N ? jt_(A / N) : '-'],
    ['Share amount / invoice', (A ? pc_((a || 0) / A) : '-') + ' / ' + (N ? pc_((n || 0) / N) : '-')],
    ['Amount vs bulan lalu', chg_(a, g_(D, 'amt_' + scope + ':' + si, addM_(ym, -1)))],
    bpN !== null ? ['BP aktif', grp_(bpN, '.')] : null,
    bpN ? ['Rata-rata sales per BP', jt_(agg.amt / bpN)] : null,
    (L => (L ? ['Avg late days (pembayaran ' + abbr_(ym) + ')', lateTxt_(L)] : null))(lateFor_(D, ym, r => inScope_(r, scope) && r[BPP.cat] === nm)),
  ]), mixTable_(D, scope, ym)]
    .concat(topBlock_(D, ym, r => inScope_(r, scope) && r[BPS.cat] === nm, 'Top 10 BP ' + nm + ' ' + abbr_(ym)));
}

function drillReseller_(D, si, ym) {
  const cat = CATS[si];
  const bp = g_(D, 'bp_res:' + si, ym);
  const a = g_(D, 'amt_res:' + si, ym);
  const n = g_(D, 'cnt_res:' + si, ym);
  if (bp === null) return [note_('Belum ada data.')];
  const B = bp_(D);
  const keysOf = m => {
    const o = {};
    (B.sales[m] || []).forEach(r => { if (r[BPS.grp] === 'Reseller' && r[BPS.cat] === cat) o[r[BPS.key]] = 1; });
    return o;
  };
  const pbp = g_(D, 'bp_res:' + si, addM_(ym, -1));
  const rows = [
    ['BP aktif', grp_(bp, '.') + (pbp !== null ? '  (' + sgn_(bp - pbp, x => grp_(x, '.')) + ')' : '')],
    ['Invoice amount', money_(a)], ['Rata-rata sales per BP', a && bp ? jt_(a / bp) : '-'],
    ['Rata-rata per invoice', a && n ? jt_(a / n) : '-'], ['Invoice per BP', n && bp ? dec_(n / bp, 1) : '-'],
  ];
  if (B.sales[ym] && B.sales[addM_(ym, -1)]) {
    const cur = keysOf(ym);
    const prv = keysOf(addM_(ym, -1));
    rows.push(['BP baru vs bulan lalu', String(Object.keys(cur).filter(k => !prv[k]).length)]);
    rows.push(['BP tidak aktif lagi', String(Object.keys(prv).filter(k => !cur[k]).length)]);
  }
  return [kv_('Reseller ' + cat + ' · ' + idMonth_(ym), rows)]
    .concat(topBlock_(D, ym, r => r[BPS.grp] === 'Reseller' && r[BPS.cat] === cat, 'Top 10 BP Reseller ' + cat));
}

function drillSite_(D, k, ym) {
  const site = SITES[k];
  const a = g_(D, 's7_amt:' + k, ym);
  const n = g_(D, 's7_cnt:' + k, ym);
  const bp = g_(D, 's7_bp:' + k, ym);
  if (a === null && n === null) return [note_('Belum ada data.')];
  const tot = sum_(SITES.map((_, i) => g_(D, 's7_amt:' + i, ym)));
  return [kv_(site + ' · ' + idMonth_(ym), [
    ['Invoice amount', money_(a)], ['Invoice', grp_(n, '.')], ['BP aktif', grp_(bp, '.')],
    ['Rata-rata per invoice', a && n ? jt_(a / n) : '-'], ['Rata-rata sales per BP', a && bp ? jt_(a / bp) : '-'],
    ['Share dari 6 site', tot ? pc_((a || 0) / tot) : '-'], ['vs bulan lalu', chg_(a, g_(D, 's7_amt:' + k, addM_(ym, -1)))],
  ])].concat(topBlock_(D, ym, r => r[BPS.site] === site, 'Top 10 BP Reseller CBD ' + site));
}

function drillCollGroup_(D, i, m, w) {
  const t = g_(D, 'coll_tgt:' + i, m);
  const a = g_(D, 'coll_act:' + i, m);
  const ww = g_(D, 'coll_w:' + i, m);
  return [kv_('Collection ' + (GROUPS[i]) + ' · ' + idMonth_(m), [
    ['Target', money_(t)], ['Actual akhir bulan', money_(a) + (t ? '  (' + pc_(a / t, 2) + ')' : '')],
    ['s/d W' + w + ' ' + abbr_(addM_(m, 1)), money_(ww) + (t ? '  (' + pc_(ww / t, 2) + ')' : '')],
    ['Belum tertagih akhir bulan', money_(t - a)], ['Belum tertagih s/d W' + w, money_(t - ww)],
    ['Target bulan depan', money_(g_(D, 'tgt_next:' + i, m))], ['Bad debt (> 90 hari)', money_(g_(D, 'baddebt:' + i, m))],
  ])].concat(groupInfo_(D, i, m));
}

function drillAgingBucket_(D, si, ym) {
  const names = ['Due 1-15', 'Due 16-30', 'Due 31-60', 'Due 61-90', 'Due >90', 'Bad Debt'];
  const v = agingVal_(D, si, ym);
  if (v === null) return [note_('Belum ada data aging ' + full_(ym) + '.')];
  const open = g_(D, 'open', ym);
  const out = [kv_(names[si] + ' · ' + idMonth_(ym), [
    ['Nilai', money_(v)], ['% dari open amount', open ? pc_(v / open, 2) : '-'],
    ['vs bulan lalu', chg_(v, agingVal_(D, si, addM_(ym, -1)))],
  ])];
  if (si === 5) return out.concat([note_('Bad Debt = input manual. Rincian per BP di slide Risiko.')]);
  const rows = bp_(D).aging[ym];
  if (!rows) return out.concat([note_(NO_BP)]);
  const col = [BPA.b1, BPA.b2, BPA.b3, BPA.b4, BPA.b5][si];
  const list = rows.filter(r => Number(r[col]) > 0).sort((a, b) => b[col] - a[col]);
  out.push(kv_('Sebaran', [['Jumlah BP di bucket', grp_(list.length, '.')],
    ['Top 10 BP menyumbang', v ? pc_(sum_(list.slice(0, 10).map(r => Number(r[col]))) / (si === 4 ? g_(D, 'over90', ym) : v)) : '-']]));
  if (si === 4) out.push(note_('Top BP memakai total > 90 hari (termasuk yang dicatat Bad Debt).'));
  return out.concat([bars_('Top 10 BP', list.slice(0, 10).map(r => [r[BPA.name], Number(r[col]), money_(r[col])]))]);
}

function drillOverdueMonth_(D, ym) {
  const open = g_(D, 'open', ym);
  const r = odRatio_(D, ym);
  const pr = odRatio_(D, addM_(ym, -1));
  const rows = ['Due 1-15', 'Due 16-30', 'Due 31-60', 'Due 61-90', 'Due >90', 'Bad Debt'].map((nm, i) => {
    const v = agingVal_(D, i, ym);
    return [nm, money_(v), open && v !== null ? pc_(v / open, 2) : '-'];
  });
  return [kv_(idMonth_(ym), [['Rasio overdue / open', pc_(r, 2)], ['Perubahan vs bulan lalu', r !== null && pr !== null ? pp_(r - pr, 2) : '-'],
    ['Open amount', money_(open)], ['Invoice overdue', money_(overdue_(D, ym))]]),
  tb_('Per bucket', [{ h: 'Bucket' }, { h: 'Nilai', align: 'right' }, { h: '% open', align: 'right' }], rows)];
}

function drillArDays_(D, ym) {
  const ard = arDays_(D, ym);
  if (ard === null) return [note_('Belum ada data.')];
  const p = arDaysParts_(D, ym);
  return [kv_('AR Days TOP · ' + idMonth_(ym), [['AR Days TOP', num_(ard, 2) + ' hari'], ['Open amount', money_(p.open)]]
    .concat(p.tops.map(t => ['Invoice TOP ' + abbr_(t[0]), money_(t[1])])).concat([['Rata-rata TOP 3 bulan', money_(p.avg)]])),
  note_(p.avg && p.open ? 'AR Days = Open amount ÷ rata-rata Invoice TOP 3 bulan × 30.' : 'Nilai historis dari Excel.')];
}

function drillRoll_(D, ym) {
  const r = rollForward_(D, ym);
  return [kv_('Roll-forward AR · ' + idMonth_(ym), [['A/R awal bulan', money_(r.beg)], ['+ Invoice (sales)', money_(r.inv)],
    ['− Collection', money_(r.col)], ['= A/R akhir bulan', money_(r.end)],
    ['Collection ÷ (awal + invoice)', r.col !== null && r.beg + r.inv ? pc_(r.col / (r.beg + r.inv), 2) : '-'],
    ['Collection % (input)', pc_(g_(D, 'collpct:0', ym), 2)]]),
  (pay => (pay === null ? note_('Import file Invoice Payment Date untuk membandingkan dengan pembayaran aktual.')
    : kv_('Rekonsiliasi dengan pembayaran aktual', [['Pembayaran diterima (file payment)', money_(pay)],
      ['Selisih vs collection roll-forward', r.col !== null ? sgn_(pay - r.col, x => money_(x)) : '-'],
      ['Avg late days', days_(g_(D, 'late_all', ym))]])))(g_(D, 'pay_amt', ym))];
}

/** Late days bulan payment m: per marketing group, kategori, dan payment group paling lambat. */
function drillLate_(D, m) {
  const rows = bp_(D).pay[m];
  if (!rows) return [note_('Belum ada file Invoice Payment Date untuk ' + idMonth_(m) + '. Import di Data Center.')];
  const all = lateAgg_(rows);
  const out = [kv_('Pembayaran ' + idMonth_(m), [['Rata-rata late days', days_(all.avg)], ['Transaksi dihitung', grp_(all.n, '.')],
    ['Dibuang (Invoice Date = Due Date)', grp_(all.ex, '.')], ['Total dibayar', money_(all.amt)],
    ['vs bulan lalu', (p => (p === null ? '-' : sgn_(all.avg - p, x => num_(x, 1)) + ' hari'))(g_(D, 'late_all', addM_(m, -1)))]])];
  const by = (fn, title, min) => {
    const o = {};
    rows.forEach(r => { const k = fn(r); if (k) (o[k] = o[k] || []).push(r); });
    return tb_(title, [{ h: title.split(' ')[1] || 'Grup' }, { h: 'Late days', align: 'right' }, { h: 'Trx', align: 'right' }, { h: 'Dibayar', align: 'right' }],
      Object.keys(o).map(k => [k, lateAgg_(o[k])]).filter(x => x[1].n >= (min || 1)).sort((a, b) => b[1].amt - a[1].amt)
        .map(x => [x[0], days_(x[1].avg), grp_(x[1].n, '.'), money_(x[1].amt)]));
  };
  out.push(by(r => r[BPP.grp], 'Per Marketing Group'));
  out.push(by(r => r[BPP.cat], 'Per Kategori'));
  const pg = {};
  rows.forEach(r => {
    const ms = master_(D, r[BPP.key]);
    const k = (ms && ms[BPM.pg]) || r[BPP.pg] || r[BPP.name];
    (pg[k] = pg[k] || []).push(r);
  });
  const slow = Object.keys(pg).map(k => [k, lateAgg_(pg[k])]).filter(x => x[1].n >= 5).sort((a, b) => b[1].avg - a[1].avg).slice(0, 10);
  if (slow.length) out.push(bars_('Payment group paling lambat (≥ 5 transaksi)', slow.map(x => [x[0], Math.max(0, x[1].avg), days_(x[1].avg) + ' · ' + x[1].n + ' trx'])));
  out.push(note_('Late days = Payment Date − Due Date, rata-rata semua transaksi yang dibayar di bulan ini. Transaksi dengan Invoice Date = Due Date tidak dihitung.'));
  return out;
}

// ================================================================ BP Explorer

/** Daftar entitas (Payment Group & BP) untuk pencarian, dengan open & sales bulan m. */
function bpDirectory_(D, m) {
  const B = bp_(D);
  const dir = {};
  const add = (name, type, f) => {
    const k = nm_(name);
    if (!k) return;
    const e = dir[type + '|' + k] = dir[type + '|' + k] || { name: String(name), type: type, open: 0, sales: 0, od: 0 };
    f(e);
  };
  (B.aging[m] || []).forEach(r => {
    const od = BPA_OD_(r);
    add(r[BPA.pg], 'Payment Group', e => { e.open += Number(r[BPA.open]) || 0; e.od += od; });
    add(r[BPA.name], 'BP', e => { e.open += Number(r[BPA.open]) || 0; e.od += od; e.key = r[BPA.key]; });
  });
  monthRange_(m, -2, 0).forEach(ym => (B.sales[ym] || []).forEach(r => {
    add(r[BPS.pg], 'Payment Group', e => { e.sales += Number(r[BPS.amt]) || 0; });
    add(r[BPS.name], 'BP', e => { e.sales += Number(r[BPS.amt]) || 0; e.key = e.key || r[BPS.key]; });
  }));
  return Object.keys(dir).map(k => dir[k]).sort((a, b) => (b.open + b.sales) - (a.open + a.sales));
}

// ================================================================ narasi otomatis

function trendArr_(D, fn, m, n) { return monthRange_(m, -(n - 1), 0).map(ym => fn(D, ym)); }

/** KPI eksekutif + highlight/watch-out (aturan sederhana & transparan). */
function execSummary_(D, m) {
  const ly = addM_(m, -12);
  const pm = addM_(m, -1);
  const ytd = y => sum_(monthRange_(y + '-01', 0, mIdx_(m)).map(ym => sales_(D, ym)));
  const s = sales_(D, m);
  const sLy = sales_(D, ly);
  const sPm = sales_(D, pm);
  const yCur = ytd(yr_(m));
  const yPrev = ytd(yr_(m) - 1);
  const cp = collPct_(D, m);
  const cpPrev = collPct_(D, pm);
  const open = openAmt_(D, m);
  const openPm = openAmt_(D, pm);
  const od = odRatio_(D, m);
  const odPm = odRatio_(D, pm);
  const ard = arDays_(D, m);
  const ardPm = arDays_(D, pm);
  const late = g_(D, 'late_all', m);
  const latePm = g_(D, 'late_all', pm);
  const pay = g_(D, 'pay_amt', m);
  const kpis = [
    { id: 'sales', label: 'Sales ' + abbr_(m), value: money_(s), delta: growth_(s, sLy), dLabel: 'vs ' + abbr_(ly), good: 'up',
      spark: trendArr_(D, sales_, m, 12) },
    { id: 'ytd', label: 'Sales YTD ' + yr_(m), value: money_(yCur), delta: growth_(yCur, yPrev), dLabel: 'vs YTD ' + (yr_(m) - 1), good: 'up',
      spark: monthRange_(yr_(m) + '-01', 0, mIdx_(m)).map(ym => sales_(D, ym)).map((_, i, a) => sum_(a.slice(0, i + 1))) },
    { id: 'coll', label: 'Collection ' + abbr_(m), value: pc_(cp, 2), delta: cp !== null && cpPrev !== null ? cp - cpPrev : null, dKind: 'pp',
      dLabel: 'vs ' + abbr_(pm), good: 'up', spark: trendArr_(D, collPct_, m, 12) },
    { id: 'open', label: 'Open AR', value: money_(open), delta: growth_(open, openPm), dLabel: 'vs ' + abbr_(pm), good: 'down',
      spark: trendArr_(D, openAmt_, m, 12) },
    { id: 'od', label: 'Overdue / Open', value: pc_(od, 1), delta: od !== null && odPm !== null ? od - odPm : null, dKind: 'pp',
      dLabel: 'vs ' + abbr_(pm), good: 'down', spark: trendArr_(D, odRatio_, m, 12) },
    { id: 'ardays', label: 'AR Days TOP', value: ard === null ? '-' : num_(ard, 1) + ' hari', delta: ard !== null && ardPm !== null ? ard - ardPm : null,
      dKind: 'days', dLabel: 'vs ' + abbr_(pm), good: 'down', spark: trendArr_(D, arDays_, m, 12) },
    { id: 'late', label: 'Avg late days ' + abbr_(m), value: late === null ? '-' : num_(late, 1) + ' hari',
      delta: late !== null && latePm !== null ? late - latePm : null, dKind: 'days', dLabel: late === null ? 'import file payment' : 'vs ' + abbr_(pm),
      good: 'down', spark: trendArr_(D, (d, ym) => g_(d, 'late_all', ym), m, 12) },
    { id: 'pay', label: 'Pembayaran diterima', value: money_(pay), delta: growth_(pay, g_(D, 'pay_amt', pm)),
      dLabel: pay === null ? 'import file payment' : 'vs ' + abbr_(pm), good: 'up', spark: trendArr_(D, (d, ym) => g_(d, 'pay_amt', ym), m, 12) },
  ];

  const hi = [];
  const wo = [];
  const push = (ok, weight, text) => (ok ? hi : wo).push({ w: weight, text: text });
  const gy = growth_(s, sLy);
  if (gy !== null) push(gy >= 0, Math.abs(gy), 'Sales ' + idMonth_(m) + ' ' + money_(s) + ', ' + (gy >= 0 ? 'naik ' : 'turun ') + pc_(Math.abs(gy)) + ' dibanding ' + abbr_(ly) + '.');
  const gm = growth_(s, sPm);
  if (gm !== null && Math.abs(gm) >= 0.05) push(gm >= 0, Math.abs(gm) * 0.8, 'Sales ' + (gm >= 0 ? 'naik ' : 'turun ') + pc_(Math.abs(gm)) + ' dari ' + abbr_(pm) + ' (' + money_(sPm) + ').');
  const gyt = growth_(yCur, yPrev);
  if (gyt !== null) push(gyt >= 0, Math.abs(gyt) * 0.9, 'YTD ' + yr_(m) + ' ' + money_(yCur) + ' (' + sgn_(gyt, x => pc_(x)) + ' YoY).');
  if (cp !== null) push(cp >= 0.95, Math.abs(cp - 0.95) + 0.1, 'Collection ' + abbr_(m) + ' ' + pc_(cp, 2) + ' dari target ' + money_(collNums_(D, m, 'all').t) + '.');
  if (od !== null && odPm !== null) push(od <= odPm, Math.abs(od - odPm) * 5, 'Rasio overdue ' + pc_(od) + ' (' + pp_(od - odPm) + ' dari ' + abbr_(pm) + ').');
  if (ard !== null && ardPm !== null) push(ard <= ardPm, Math.abs(ard - ardPm) / 20, 'AR Days TOP ' + num_(ard, 1) + ' hari (' + sgn_(ard - ardPm, x => num_(x, 1)) + ' hari).');
  if (late !== null) {
    if (latePm !== null) push(late <= latePm, Math.abs(late - latePm) / 5, 'Rata-rata late days ' + num_(late, 1) + ' hari (' + sgn_(late - latePm, x => num_(x, 1)) + ' hari dari ' + abbr_(pm) + ').');
    else push(late <= 3, Math.abs(late) / 10 + 0.05, 'Rata-rata pembayaran ' + (late <= 0 ? num_(Math.abs(late), 1) + ' hari sebelum' : num_(late, 1) + ' hari setelah') +
      ' jatuh tempo (' + grp_(g_(D, 'late_n', m), '.') + ' transaksi ' + abbr_(m) + ').');
  }
  const pp = picPerf_(D, m);
  if (pp && pp.list.length > 1) {
    const worst = pp.list.filter(a => a.open >= 1e9 && a.pic !== '(tanpa PIC)').sort((a, b) => b.odPct - a.odPct)[0];
    if (worst && worst.odPct > 0.15) wo.push({ w: 0.25, text: 'PIC ' + worst.pic + ': overdue ' + pc_(worst.odPct) + ' dari open ' + money_(worst.open) + '.' });
  }
  const dm = dormant_(D, m);
  if (dm && dm.n) wo.push({ w: 0.22, text: dm.n + ' pelanggan tidak bertransaksi > 90 hari masih punya piutang ' + money_(dm.open) + '.' });
  const o90 = g_(D, 'over90', m);
  if (o90) {
    const top = (bp_(D).aging[m] || []).filter(r => Number(r[BPA.b5]) > 0).sort((a, b) => b[BPA.b5] - a[BPA.b5]).slice(0, 2).map(r => r[BPA.name]);
    wo.push({ w: 0.3, text: 'Piutang > 90 hari ' + money_(o90) + (top.length ? '; terbesar: ' + top.join(', ') + '.' : '.') });
  }
  const topRows = (bp_(D).sales[m] || []).filter(r => inScope_(r, 'all'));
  if (topRows.length && s) {
    const t = topSales_(topRows, 1)[0];
    if (t && t[1] / s > 0.06) wo.push({ w: 0.2, text: 'Konsentrasi: ' + t[0] + ' = ' + pc_(t[1] / s) + ' dari sales bulan ini.' });
  }
  const sort = a => a.sort((x, y) => y.w - x.w).slice(0, 3).map(x => x.text);
  return { kpis: kpis, highlights: sort(hi), watchouts: sort(wo) };
}

/** Kalimat judul per slide. */
function headline_(D, m, id) {
  const s = sales_(D, m);
  if (id === 'sales') {
    const g = growth_(s, sales_(D, addM_(m, -12)));
    return 'Sales ' + idMonth_(m) + ' ' + money_(s) + (g === null ? '' : ', ' + (g >= 0 ? 'naik ' : 'turun ') + pc_(Math.abs(g)) + ' YoY');
  }
  if (id === 'mix') {
    const a = [0, 1, 2].map(i => g_(D, 'amt_all:' + i, m));
    const t = sum_(a);
    return t ? 'TOP menyumbang ' + pc_(a[0] / t, 0) + ' sales; CBD ' + pc_(a[2] / t, 0) : 'Komposisi sales per kategori';
  }
  if (id === 'reseller') {
    const bp = sum_([0, 1, 2].map(i => g_(D, 'bp_res:' + i, m)));
    return 'Reseller: ' + grp_(bp, '.') + ' BP aktif, CBD ' + grp_(g_(D, 'bp_res:2', m), '.') + ' BP';
  }
  if (id === 'collection') {
    const x = collNums_(D, m, 'all');
    if (!x.t) return 'Collection vs target';
    return 'Collection ' + pc_(x.a / x.t, 1) + ' dari target ' + money_(x.t) + (x.w ? ' — ' + pc_(x.w / x.t, 1) + ' s/d W' + D.cfg.week : '');
  }
  if (id === 'aging') {
    const r = odRatio_(D, m);
    return r === null ? 'Aging & overdue' : 'Overdue ' + pc_(r) + ' dari open AR ' + money_(g_(D, 'open', m));
  }
  if (id === 'pic') {
    const pp = picPerf_(D, m);
    if (!pp) return 'Kinerja penagihan per PIC AR';
    const top = pp.list.filter(a => a.pic !== '(tanpa PIC)')[0];
    return top ? top.pic + ' memegang ' + pc_(top.open / sum_(pp.list.map(a => a.open)), 0) + ' open AR; overdue tertinggi ' +
      (pp.list.filter(a => a.open >= 1e9).sort((a, b) => b.odPct - a.odPct)[0] || top).pic : 'Kinerja penagihan per PIC AR';
  }
  if (id === 'ar') {
    const r = rollForward_(D, m);
    return r.col === null ? 'Ringkasan piutang' : 'AR ' + money_(r.beg) + ' → ' + money_(r.end) + '; collection ' + money_(r.col);
  }
  return '';
}

if (typeof module !== 'undefined') module.exports = {};
