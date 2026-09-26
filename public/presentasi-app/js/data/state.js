/*
 * State aplikasi (disimpan utuh di IndexedDB / snapshot JSON) dan model hasil resolusi.
 *
 * state = {
 *   version, savedAt,
 *   config:  { month:'YYYY-MM', week },
 *   layers:  { manual:{key:{ym:v}}, raw:{...}, excel:{...} }   prioritas: manual > raw > excel
 *   labels:  { key: label },
 *   bpSales: { ym: [baris BPS] },  bpAging: { ym: [baris BPA] },  payments: { ymPayment: [baris BPP] },
 *   bpMaster: { keyNo: [baris BPM] }, bpMasterInfo: { file, at, count },
 *   texts:   { ym: { 'slideId.field': teks } }                   (hasil edit teks di layar)
 *   manual:  { namaTabel: [ {kolom: nilai, Bulan:'YYYY-MM'} ] },
 *   imports: [ { file, kind, at, months, stats } ]
 * }
 */
const LAYERS = ['manual', 'raw', 'excel'];
const LAYER_LABEL = { manual: 'Template Excel', raw: 'File mentah', excel: 'Excel (.xlsm)' };

function newState_() {
  return { version: 2, savedAt: null, config: { month: '', week: 2 }, layers: { manual: {}, raw: {}, excel: {} },
    labels: {}, bpSales: {}, bpAging: {}, payments: {}, bpMaster: {}, bpMasterInfo: null, manual: {}, texts: {}, imports: [] };
}

function mergeSeries_(dst, src) {
  Object.keys(src || {}).forEach(k => {
    const d = dst[k] = dst[k] || {};
    Object.keys(src[k]).forEach(ym => { d[ym] = src[k][ym]; });
  });
}

/** Gabungkan hasil parseWorkbook_ ke state. Bulan yang sama diganti. */
function applyImport_(state, res) {
  if (res.kind === 'invoice' || res.kind === 'aging' || res.kind === 'payment') {
    mergeSeries_(state.layers.raw, res.series);
    const bag = res.kind === 'invoice' ? state.bpSales : res.kind === 'aging' ? state.bpAging : (state.payments = state.payments || {});
    Object.keys(res.bp).forEach(ym => { bag[ym] = res.bp[ym]; });
  } else if (res.kind === 'bpmaster') {
    state.bpMaster = res.master;
    state.bpMasterInfo = { file: res.file, at: new Date().toISOString(), count: Object.keys(res.master).length };
  } else if (res.kind === 'excel') {
    state.layers.excel = res.series;
    Object.assign(state.labels, res.labels);
    if (res.config.month) state.config = res.config;
  } else if (res.kind === 'manual') {
    mergeSeries_(state.layers.manual, res.series);
    Object.keys(res.manual).forEach(t => {
      const months = {};
      res.manual[t].forEach(r => { months[r.Bulan] = 1; });
      state.manual[t] = (state.manual[t] || []).filter(r => !months[r.Bulan]).concat(res.manual[t]);
    });
  } else if (res.kind === 'snapshot') {
    return res.state;
  }
  state.imports.unshift({ file: res.file, kind: res.kind, at: new Date().toISOString(), months: res.months, stats: res.stats });
  state.imports = state.imports.slice(0, 40);
  return state;
}

/** Seed tabel manual (format webapp/Seed.js: {header, rows}). */
function applySeed_(state, SEED) {
  Object.keys(SEED).forEach(name => {
    const t = SEED[name];
    state.manual[name] = t.rows.map(r => {
      const o = {};
      t.header.forEach((h, i) => { o[h] = r[i]; });
      o.Bulan = monthKey_(r[0]);
      return o;
    });
  });
}

// ---------------------------------------------------------------- model (dipakai engine & UI)

/** Resolusi lapisan -> D { map:{key:{label, vals, src}}, months, cfg, manual, bpSales[], bpAging[], recon[] } */
function buildModel_(state) {
  const map = {};
  const keys = {};
  LAYERS.forEach(L => Object.keys(state.layers[L] || {}).forEach(k => { keys[k] = 1; }));
  Object.keys(keys).forEach(k => {
    const vals = {};
    const src = {};
    for (let i = LAYERS.length - 1; i >= 0; i--) {        // lapisan prioritas tinggi menimpa
      const L = LAYERS[i];
      const s = (state.layers[L] || {})[k];
      if (!s) continue;
      Object.keys(s).forEach(ym => {
        if (isNum_(s[ym])) { vals[ym] = Number(s[ym]); src[ym] = L; }
      });
    }
    map[k] = { label: state.labels[k] || defaultLabel_(k), vals: vals, src: src };
  });
  const months = {};
  Object.keys(map).forEach(k => Object.keys(map[k].vals).forEach(ym => { months[ym] = 1; }));
  const flat = bag => [].concat.apply([], Object.keys(bag || {}).sort().map(ym => bag[ym]));
  const D = {
    map: map, months: Object.keys(months).sort(), cfg: Object.assign({ month: '', week: 2 }, state.config),
    manual: state.manual || {}, bpSales: flat(state.bpSales), bpAging: flat(state.bpAging), payments: flat(state.payments),
    bpMonths: { sales: Object.keys(state.bpSales || {}).sort(), aging: Object.keys(state.bpAging || {}).sort(),
      pay: Object.keys(state.payments || {}).sort() },
    bpMaster: state.bpMaster || {}, bpMasterInfo: state.bpMasterInfo || null, texts: state.texts || {},
    imports: state.imports || [], recon: recon_(state),
  };
  if (!D.cfg.month) D.cfg.month = D.months.filter(ym => isNum_((map['open'] || { vals: {} }).vals[ym])).pop() || D.months[D.months.length - 1];
  return D;
}

/** Selisih file mentah vs Excel pada bulan & kunci yang sama. */
function recon_(state) {
  const out = [];
  const raw = state.layers.raw || {};
  const ex = state.layers.excel || {};
  Object.keys(raw).forEach(k => {
    if (!ex[k]) return;
    Object.keys(raw[k]).forEach(ym => {
      const a = raw[k][ym];
      const b = ex[k][ym];
      if (!isNum_(b)) return;
      out.push({ key: k, label: state.labels[k] || defaultLabel_(k), ym: ym, raw: a, excel: b, diff: a - b });
    });
  });
  return out.sort((x, y) => (x.ym < y.ym ? 1 : x.ym > y.ym ? -1 : Math.abs(y.diff) - Math.abs(x.diff)));
}

function defaultLabel_(k) {
  const p = k.split(':');
  const i = Number(p[1]);
  const base = {
    amt_all: 'Invoice Amount ALL', cnt_all: 'Invoice Count ALL', bp_all: 'BP aktif ALL', amt_trad: 'Invoice Amount Traditional',
    cnt_trad: 'Invoice Count Traditional', bp_trad: 'BP aktif Traditional', amt_res: 'Invoice Amount Reseller',
    cnt_res: 'Invoice Count Reseller', bp_res: 'BP aktif Reseller', s7_amt: 'Site Amount', s7_cnt: 'Site Count', s7_bp: 'Site BP',
    aging: 'Aging', baddebt: 'Bad Debt >90', coll_tgt: 'Collection Target', coll_act: 'Actual Collection', coll_w: 'Collection s/d W',
    tgt_next: 'Target bulan depan', open: 'Open Amount', over90: '> 90 hari', due120: '> 120 hari', collpct: 'Collection %',
    late_all: 'Avg late days (payment)', late_n: 'Transaksi late days', pay_amt: 'Pembayaran diterima',
  }[p[0]] || p[0];
  if (p.length < 2) return base;
  if (/^(amt|cnt|bp)_/.test(p[0])) return base + ' – ' + CATS[i];
  if (/^s7_/.test(p[0])) return base + ' – ' + SITES[i];
  if (p[0] === 'aging') return ['Due 1-15', 'Due 16-30', 'Due 31-60', 'Due 61-90', 'Due >90', 'Bad Debt'][i] || base;
  if (/^(coll_|tgt_next|baddebt)/.test(p[0])) return base + ' – ' + (GROUPS[i] || i);
  return base;
}

if (typeof module !== 'undefined') module.exports = {};
