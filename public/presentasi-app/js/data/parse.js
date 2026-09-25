/*
 * Parser file (dipakai di Web Worker, main thread, dan Node build-snapshot).
 * Butuh: util.js dan global XLSX (SheetJS).
 *
 * Jenis file dideteksi otomatis:
 *   invoice : sheet pertama berisi header "Invoice No."   -> BP Sales + seri Sales (menggantikan macro Import Data Sales)
 *   aging   : sheet pertama berisi header "Open Amt"      -> BP Aging + seri Aging (menggantikan macro Update Aging)
 *   payment : laporan yang sama dengan invoice, tetapi difilter per Payment Date -> late days per bulan PAYMENT
 *   bpmaster: master Business Partner (Search Key, PIC AR, ...)  -> profil BP, PIC AR, pelanggan tidak aktif
 *   excel   : workbook berisi sheet "Input" (Data Finance Presentation.xlsm) -> seri historis + input manual
 *   manual  : template dari aplikasi (sheet "Input Manual" / tabel manual)
 */

const BPS = { ym: 0, key: 1, name: 2, pg: 3, grp: 4, branch: 5, site: 6, cat: 7, amt: 8, cnt: 9, paid: 10, ln: 11, lavg: 12, lmax: 13 };
const BPA = { ym: 0, pg: 1, key: 2, name: 3, grp: 4, sales: 5, coll: 6, branch: 7, open: 8, notdue: 9, b1: 10, b2: 11, b3: 12,
  b4: 13, b5: 14, d120: 15, maxd: 16, fu: 17 };
const BPS_HEAD = ['Bulan', 'BP Key', 'BP Name', 'Payment Group', 'Marketing Group', 'Branch', 'Site', 'Kategori',
  'Invoice Amount (Rp)', 'Invoice Count', 'Invoice Dibayar', 'Late Days n', 'Avg Late Days', 'Max Late Days'];
const BPA_HEAD = ['Bulan', 'Payment Group', 'BP Key', 'Business Partner', 'Marketing Group', 'Sales Name', 'Collection Name',
  'Branch', 'Open Amt (Rp)', 'Not Due (Rp)', 'Due 1-15 (Rp)', 'Due 16-30 (Rp)', 'Due 31-60 (Rp)', 'Due 61-90 (Rp)',
  'Due >90 (Rp)', 'Due >120 (Rp)', 'Max Days', 'Follow Up'];
/** Pembayaran per BP per bulan payment (late days = rata-rata per transaksi = sum / n). */
const BPP = { ym: 0, key: 1, name: 2, pg: 3, grp: 4, cat: 5, n: 6, sum: 7, max: 8, amt: 9, ex: 10 };
const BPP_HEAD = ['Bulan Payment', 'BP Key', 'BP Name', 'BP Group', 'Marketing Group', 'Kategori', 'Transaksi (late days)',
  'Total Late Days', 'Max Late Days', 'Payment Amount (Rp)', 'Transaksi Invoice Date = Due Date (dibuang)'];
/** Master BP: keyNo -> array. */
const BPM = { key: 0, name: 1, pg: 2, pic: 3, sales: 4, term: 5, grp: 6, type: 7, limit: 8, status: 9, region: 10, branch: 11, desc: 12,
  first: 13, last: 14 };
const BPM_HEAD = ['Search Key', 'Name', 'Payment Group', 'PIC AR', 'Sales / Agent', 'Payment Term', 'Marketing Groups', 'TypeOfCustomer',
  'Credit Limit', 'Credit Status', 'Sales Region', 'Branch', 'Description', 'First Sale', 'Last Sale'];
const CATS = ['TOP', 'Ex DO', 'CBD'];
const SITES = ['Banjarmasin', 'DKI Jakarta', 'Makassar', 'Palembang', 'Pontianak', 'Surabaya'];
const MANUAL_TABLES = ['AR Historis', 'Top Unpaid W', 'Uncollected', 'Unallocated', 'Due90 Summary', 'Due90 Cicil',
  'Bad Debt Summary', 'Bad Debt Detail'];
/** Kunci seri yang diisi manual (bukan dari file mentah). */
const MANUAL_KEYS = [
  ['coll_tgt', 5, 'Collection Target'], ['coll_act', 5, 'Actual Collection akhir bulan'], ['coll_w', 5, 'Collection s/d minggu W'],
  ['tgt_next', 5, 'Target Collection bulan berikutnya'],
  ['top5_tgt'], ['top5_act'], ['top5_w'], ['wo5_tgt'], ['wo5_act'], ['wo5_w'],
  ['aging:5', 0, 'Bad Debt (manual)'], ['collpct:0', 0, 'Collection %'],
];
const GROUPS = ['Traditional', 'Reseller', 'Modern Market Nasional', 'Modern Market', 'End User - Project'];

// ---------------------------------------------------------------- aturan (ImportSales.bas / ImportAging.bas)

function rawCategory_(grp, term) {
  if (grp === 'E Commerce') return 'CBD';
  if ((term === 'Net 3 Days - With Tolerance Days' || term === 'Net 7 Days - With Tolerance Days') &&
      (grp === 'Traditional' || grp === 'Reseller')) return 'Ex DO';
  const p = term.split(' ');
  if (p.length >= 3 && p[0] === 'Net' && p[1] !== '' && isFinite(Number(p[1])) && p[2] === 'Days') return 'TOP';
  return 'CBD';
}
function rawExcluded_(grp) {
  return ['Internal Group', 'Technical Support', 'Value Added Reseller', 'null', ''].indexOf(grp) >= 0;
}
function rawSite_(branch) {
  if (branch === 'Jakarta' || branch === 'Karawang') return 'DKI Jakarta';
  if (branch === 'Margomulyo') return 'Surabaya';
  return SITES.indexOf(branch) >= 0 ? branch : '';
}
function rawGroup_(s) {                  // "01-Traditional" -> "Traditional"
  let t = String(s || '').trim();
  const p = t.indexOf('-');
  if (p > 0 && p <= 3 && /^\d+$/.test(t.slice(0, p))) t = t.slice(p + 1);
  return t.trim();
}
/** Marketing group -> indeks baris baddebt/coll (0..4) atau -1. */
function groupIdx_(g) {
  const s = String(g || '').toLowerCase().trim();
  if (s === 'traditional') return 0;
  if (s === 'reseller') return 1;
  if (s === 'modern market national' || s === 'modern market nasional') return 2;
  if (s === 'modern market') return 3;
  if (s === 'proyek' || s === 'project' || s.indexOf('end user') === 0) return 4;
  return -1;
}

// ---------------------------------------------------------------- helper sheet

function sheetRows_(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
}
function findHeader_(values, name) {
  for (let r = 0; r < Math.min(25, values.length); r++) {
    if ((values[r] || []).some(x => String(x).trim() === name)) return r;
  }
  return -1;
}
function colsOf_(row, names) {
  const hdr = row.map(x => String(x).trim());
  const out = {};
  Object.keys(names).forEach(k => { out[k] = hdr.indexOf(names[k]); });
  return out;
}
function put_(series, key, ym, v) {
  (series[key] = series[key] || {})[ym] = v;
}

// ---------------------------------------------------------------- deteksi

/** Nomor Key BP tanpa akhiran: '1000258-PKP' / '1000480 (Via Medan)' -> '1000258' / '1000480'. */
function keyNo_(s) { return String(s === null || s === undefined ? '' : s).trim().split(/[-\s(]/)[0].trim(); }

function detectKind_(wb, first) {
  const names = wb.SheetNames;
  if (names.indexOf('Input') >= 0 && names.indexOf('Config') >= 0) return 'excel';
  if (names.indexOf('Input Manual') >= 0 || names.some(n => MANUAL_TABLES.indexOf(n) >= 0)) return 'manual';
  const top = first.slice(0, 25);
  if (findHeader_(top, 'Search Key') >= 0 && findHeader_(top, 'PIC AR') >= 0) return 'bpmaster';
  if (findHeader_(top, 'Invoice No.') >= 0) return invoiceOrPayment_(first);
  if (findHeader_(top, 'Open Amt') >= 0) return 'aging';
  return '';
}

/** Periode laporan dari baris "Date : awal / akhir". */
function reportRange_(values) {
  for (let r = 0; r < Math.min(12, values.length); r++) {
    if (!/^date/i.test(String(values[r][0]).trim())) continue;
    const nums = values[r].filter(x => typeof x === 'number' && x > 30000);
    if (nums.length >= 2) return [rawDate_(nums[0]), rawDate_(nums[1])];
  }
  return null;
}

/**
 * Laporan "Invoice and Payment Date Comparison" dipakai dua kali:
 *   difilter per tanggal INVOICE -> file Invoice (sales)     : Invoice Date semua dalam periode
 *   difilter per tanggal PAYMENT -> file Payment (late days) : Payment Date semua dalam periode
 */
function invoiceOrPayment_(values) {
  const h = findHeader_(values, 'Invoice No.');
  const c = colsOf_(values[h], { idate: 'Invoice Date', pay: 'Payment Date', inv: 'Invoice No.' });
  const range = reportRange_(values);
  if (!range || c.pay < 0) return 'invoice';
  const within = d => d && d >= range[0] && d <= range[1];
  let n = 0;
  let inInv = 0;
  let inPay = 0;
  for (let r = h + 1; r < values.length; r++) {
    if (!String(values[r][c.inv]).trim()) continue;
    n++;
    if (within(rawDate_(values[r][c.idate]))) inInv++;
    if (within(rawDate_(values[r][c.pay]))) inPay++;
  }
  return n && inPay / n > 0.98 && inInv / n < 0.98 ? 'payment' : 'invoice';
}

/** Titik masuk: ArrayBuffer/Uint8Array file -> hasil parse terstruktur. */
function parseWorkbook_(data, fileName) {
  const wb = XLSX.read(data, { type: 'array', cellDates: false, dense: false });
  const first = sheetRows_(wb.Sheets[wb.SheetNames[0]]);
  const kind = detectKind_(wb, first);
  if (!kind) throw new Error('Jenis file "' + fileName + '" tidak dikenali (bukan Invoice, Payment, Aging, Business Partner, Excel Input, atau template manual).');
  let res;
  if (kind === 'invoice') res = parseInvoice_(first);
  else if (kind === 'payment') res = parsePayment_(first);
  else if (kind === 'aging') res = parseAging_(first);
  else if (kind === 'bpmaster') res = parseBpMaster_(first);
  else if (kind === 'excel') res = parseExcel_(wb);
  else res = parseManual_(wb);
  res.kind = kind;
  res.file = fileName;
  return res;
}

// ---------------------------------------------------------------- invoice mentah

function parseInvoice_(values) {
  const h = findHeader_(values, 'Invoice No.');
  const c = colsOf_(values[h], {
    key: 'BP Key', name: 'BP Name', pg: 'BP Group', grp: 'Marketing Group', branch: 'Branch', term: 'Payment Term',
    inv: 'Invoice No.', amt: 'Invoice Amount', idate: 'Invoice Date', due: 'Due Date', pay: 'Payment Date',
  });
  ['key', 'grp', 'term', 'inv', 'amt', 'idate'].forEach(k => {
    if (c[k] < 0) throw new Error('Kolom wajib tidak ditemukan di file invoice: ' + k);
  });
  const inv = {};
  const order = [];
  let dup = 0;
  let noDate = 0;
  for (let r = h + 1; r < values.length; r++) {
    const row = values[r];
    const no = String(row[c.inv]).trim();
    if (!no) continue;
    const pay = c.pay >= 0 ? rawDate_(row[c.pay]) : null;
    if (inv[no]) {                                   // baris berulang = pembayaran berikutnya
      dup++;
      if (pay && (!inv[no].pay || pay > inv[no].pay)) inv[no].pay = pay;
      continue;
    }
    const idate = rawDate_(row[c.idate]);
    if (!idate) { noDate++; continue; }
    inv[no] = {
      key: String(row[c.key]).trim(), name: c.name >= 0 ? String(row[c.name]).trim() : '',
      pg: c.pg >= 0 ? String(row[c.pg]).trim().replace(/\s*-\s*$/, '') : '',
      grp: String(row[c.grp]).trim(), branch: c.branch >= 0 ? String(row[c.branch]).trim() : '',
      term: String(row[c.term]).trim(), amt: rawNum_(row[c.amt]), idate: idate,
      due: c.due >= 0 ? rawDate_(row[c.due]) : null, pay: pay,
    };
    order.push(no);
  }

  const agg = {};
  const months = {};
  const series = {};
  const distinct = {};           // kunci seri bp -> {bpKey:1}
  let lateInv = 0;
  let sameDay = 0;
  const addS = (key, ym, v) => put_(series, key, ym, ((series[key] || {})[ym] || 0) + v);
  const addBp = (key, ym, bp) => { const k = key + '|' + ym; (distinct[k] = distinct[k] || {})[bp] = 1; };

  order.forEach(no => {
    const x = inv[no];
    const ym = ymOf_(x.idate);
    months[ym] = (months[ym] || 0) + 1;
    const cat = rawCategory_(x.grp, x.term);
    const ci = CATS.indexOf(cat);
    const scopes = [];
    if (!rawExcluded_(x.grp)) scopes.push('all');
    if (x.grp === 'Traditional') scopes.push('trad');
    if (x.grp === 'Reseller') scopes.push('res');
    scopes.forEach(sc => {
      addS('amt_' + sc + ':' + ci, ym, x.amt);
      addS('cnt_' + sc + ':' + ci, ym, 1);
      addBp('bp_' + sc + ':' + ci, ym, x.key);
    });
    const site = x.grp === 'Reseller' && cat === 'CBD' ? rawSite_(x.branch) : '';
    if (site) {
      const si = SITES.indexOf(site);
      addS('s7_amt:' + si, ym, x.amt);
      addS('s7_cnt:' + si, ym, 1);
      addBp('s7_bp:' + si, ym, x.key);
    }
    const k = ym + '|' + x.key + '|' + cat;
    let a = agg[k];
    if (!a) {
      a = agg[k] = { ym: ym, key: x.key, name: x.name, pg: x.pg, grp: x.grp, branch: x.branch, site: site, cat: cat,
        amt: 0, cnt: 0, paid: 0, ln: 0, lsum: 0, lmax: null };
    }
    a.amt += x.amt;
    a.cnt += 1;
    if (x.pay) a.paid += 1;
    if (x.pay && x.due) {
      if (dayDiff_(x.due, x.idate) === 0) {
        sameDay++;
      } else {
        const late = dayDiff_(x.pay, x.due);
        a.ln += 1;
        a.lsum += late;
        a.lmax = a.lmax === null ? late : Math.max(a.lmax, late);
        lateInv++;
      }
    }
  });
  Object.keys(distinct).forEach(k => {
    const p = k.split('|');
    put_(series, p[0], p[1], Object.keys(distinct[k]).length);
  });
  // bulan yang ada di file: kategori/site tanpa transaksi = 0 (bukan kosong)
  Object.keys(months).forEach(ym => {
    ['all', 'trad', 'res'].forEach(sc => [0, 1, 2].forEach(ci => ['amt_', 'cnt_', 'bp_'].forEach(p => {
      if (!series[p + sc + ':' + ci] || series[p + sc + ':' + ci][ym] === undefined) put_(series, p + sc + ':' + ci, ym, 0);
    })));
    SITES.forEach((_, si) => ['s7_amt:', 's7_cnt:', 's7_bp:'].forEach(p => {
      if (!series[p + si] || series[p + si][ym] === undefined) put_(series, p + si, ym, 0);
    }));
  });

  const bp = {};
  Object.keys(agg).forEach(k => {
    const a = agg[k];
    (bp[a.ym] = bp[a.ym] || []).push([a.ym, a.key, a.name, a.pg, a.grp, a.branch, a.site, a.cat, a.amt, a.cnt, a.paid, a.ln,
      a.ln ? Math.round(a.lsum / a.ln * 100) / 100 : '', a.lmax === null ? '' : a.lmax]);
  });
  Object.keys(bp).forEach(ym => bp[ym].sort((x, y) => y[BPS.amt] - x[BPS.amt]));
  const ms = Object.keys(months).sort();
  return {
    months: ms, series: series, bp: bp,
    stats: { invoice: order.length, barisPembayaranBerulang: dup, tanpaTanggal: noDate, invoiceLateDays: lateInv,
      invoiceDateSamaDueDiabaikan: sameDay, barisBP: Object.keys(agg).length },
  };
}

// ---------------------------------------------------------------- invoice payment (late days per bulan PAYMENT)

function parsePayment_(values) {
  const h = findHeader_(values, 'Invoice No.');
  const c = colsOf_(values[h], {
    key: 'BP Key', name: 'BP Name', pg: 'BP Group', grp: 'Marketing Group', term: 'Payment Term', inv: 'Invoice No.',
    idate: 'Invoice Date', due: 'Due Date', pdoc: 'Payment Document', pamt: 'Payment Amount', pay: 'Payment Date',
  });
  ['key', 'inv', 'idate', 'due', 'pay'].forEach(k => {
    if (c[k] < 0) throw new Error('Kolom wajib tidak ditemukan di file payment: ' + k);
  });
  const seen = {};
  const agg = {};
  const tot = {};
  let rowsN = 0;
  let dup = 0;
  let ex = 0;
  let noPay = 0;
  for (let r = h + 1; r < values.length; r++) {
    const row = values[r];
    const no = String(row[c.inv]).trim();
    if (!no) continue;
    const pay = rawDate_(row[c.pay]);
    if (!pay) { noPay++; continue; }
    const id = no + '|' + (c.pdoc >= 0 ? String(row[c.pdoc]).trim() : r);
    if (seen[id]) { dup++; continue; }
    seen[id] = 1;
    rowsN++;
    const ym = ymOf_(pay);
    const grp = String(row[c.grp] === undefined ? '' : row[c.grp]).trim();
    const cat = rawCategory_(grp, c.term >= 0 ? String(row[c.term]).trim() : '');
    const key = String(row[c.key]).trim();
    const k = ym + '|' + key + '|' + cat;
    let a = agg[k];
    if (!a) {
      a = agg[k] = [ym, key, c.name >= 0 ? String(row[c.name]).trim() : '', c.pg >= 0 ? String(row[c.pg]).trim().replace(/\s*-\s*$/, '') : '',
        grp, cat, 0, 0, null, 0, 0];
    }
    const amt = c.pamt >= 0 ? rawNum_(row[c.pamt]) : 0;
    a[BPP.amt] += amt;
    const T = tot[ym] = tot[ym] || { n: 0, sum: 0, amt: 0, ex: 0, cat: [[0, 0], [0, 0], [0, 0]] };
    T.amt += amt;
    const idate = rawDate_(row[c.idate]);
    const due = rawDate_(row[c.due]);
    if (!idate || !due || dayDiff_(due, idate) === 0) {           // Invoice Date = Due Date -> dibuang
      a[BPP.ex] += 1;
      T.ex += 1;
      ex++;
      continue;
    }
    const late = dayDiff_(pay, due);
    a[BPP.n] += 1;
    a[BPP.sum] += late;
    a[BPP.max] = a[BPP.max] === null ? late : Math.max(a[BPP.max], late);
    T.n += 1;
    T.sum += late;
    const ci = CATS.indexOf(cat);
    T.cat[ci][0] += 1;
    T.cat[ci][1] += late;
  }
  const series = {};
  const bp = {};
  Object.keys(tot).forEach(ym => {
    const T = tot[ym];
    put_(series, 'late_all', ym, T.n ? T.sum / T.n : null);
    put_(series, 'late_n', ym, T.n);
    put_(series, 'pay_amt', ym, T.amt);
    T.cat.forEach((x, i) => { if (x[0]) put_(series, 'late_all:' + i, ym, x[1] / x[0]); });
    bp[ym] = [];
  });
  Object.keys(agg).forEach(k => { const a = agg[k]; if (a[BPP.max] === null) a[BPP.max] = ''; bp[a[0]].push(a); });
  Object.keys(bp).forEach(ym => bp[ym].sort((x, y) => y[BPP.amt] - x[BPP.amt]));
  const ms = Object.keys(tot).sort();
  return {
    months: ms, series: series, bp: bp,
    stats: { transaksi: rowsN, dipakaiLateDays: rowsN - ex, invoiceDateSamaDueDiabaikan: ex, duplikat: dup, tanpaPaymentDate: noPay,
      rataLateDays: ms.map(ym => abbr_(ym) + ' ' + (tot[ym].n ? (tot[ym].sum / tot[ym].n).toFixed(2) : '-')).join(', ') },
  };
}

// ---------------------------------------------------------------- master Business Partner

function parseBpMaster_(values) {
  const h = findHeader_(values, 'Search Key');
  const c = colsOf_(values[h], {
    key: 'Search Key', name: 'Name', pg: 'Payment Group', pic: 'PIC AR', sales: 'Sales / Agent', term: 'Payment Term', grp: 'Marketing Groups',
    type: 'TypeOfCustomer', limit: 'Credit Limit', status: 'Credit Status', region: 'Sales Region', branch: 'Branch', desc: 'Description',
    first: 'First Sale', last: 'LastSale', cust: 'Customer',
  });
  const iso = v => { const d = rawDate_(v); return d ? ymOf_(d) + '-' + String(d.getDate()).padStart(2, '0') : ''; };
  const g = (row, k) => (c[k] >= 0 && row[c[k]] !== null && row[c[k]] !== undefined ? String(row[c[k]]).trim() : '');
  const master = {};
  let total = 0;
  let skipped = 0;
  for (let r = h + 1; r < values.length; r++) {
    const row = values[r];
    const key = g(row, 'key');
    if (!key) continue;
    total++;
    if (g(row, 'grp') === 'E Commerce' || (c.cust >= 0 && g(row, 'cust') === 'No')) { skipped++; continue; }
    master[keyNo_(key)] = [key, g(row, 'name'), g(row, 'pg'), g(row, 'pic'), g(row, 'sales'), g(row, 'term'), g(row, 'grp'), g(row, 'type'),
      rawNum_(row[c.limit]), g(row, 'status'), g(row, 'region'), g(row, 'branch'), g(row, 'desc').replace(/\s+/g, ' ').slice(0, 240),
      iso(row[c.first]), iso(row[c.last])];
  }
  return { months: [], master: master,
    stats: { bpDibaca: total, disimpan: Object.keys(master).length, eCommerceDilewati: skipped } };
}

// ---------------------------------------------------------------- aging mentah

function parseAging_(values) {
  const h = findHeader_(values, 'Open Amt');
  const c = colsOf_(values[h], {
    pg: 'Payment Group', grp: 'Marketing', coll: 'Collection Name', sales: 'Sales Name', key: 'Value',
    name: 'Business Partner', idate: 'Invoice Date', due: 'Due Date', open: 'Open Amt', branch: 'Branch', fu: 'Follow Up',
  });
  ['grp', 'idate', 'due', 'open'].forEach(k => {
    if (c[k] < 0) throw new Error('Kolom wajib tidak ditemukan di file aging: ' + k);
  });
  let maxInv = null;
  for (let r = h + 1; r < values.length; r++) {
    const d = rawDate_(values[r][c.idate]);
    if (d && (!maxInv || d > maxInv)) maxInv = d;
  }
  if (!maxInv) throw new Error('Kolom Invoice Date tidak berisi tanggal yang bisa dibaca.');
  const cutoff = new Date(maxInv.getFullYear(), maxInv.getMonth() + 1, 0);
  const ym = ymOf_(cutoff);
  const g = (row, k) => (c[k] >= 0 ? String(row[c[k]] === null ? '' : row[c[k]]).trim() : '');

  const agg = {};
  const tot = { open: 0, notdue: 0, b: [0, 0, 0, 0, 0], d120: 0, grp90: [0, 0, 0, 0, 0] };
  let used = 0;
  let skipped = 0;
  for (let r = h + 1; r < values.length; r++) {
    const row = values[r];
    const v = rawNum_(row[c.open]);
    const due = rawDate_(row[c.due]);
    if (!v && !due) continue;
    if (!due) { skipped++; continue; }
    used++;
    const key = g(row, 'key') || g(row, 'name');
    let a = agg[key];
    if (!a) {
      a = agg[key] = { pg: g(row, 'pg'), key: g(row, 'key'), name: g(row, 'name'), grp: rawGroup_(g(row, 'grp')),
        sales: g(row, 'sales'), coll: g(row, 'coll'), branch: g(row, 'branch'),
        open: 0, notdue: 0, b: [0, 0, 0, 0, 0], d120: 0, maxd: 0, fu: [] };
    }
    a.open += v;
    tot.open += v;
    const days = dayDiff_(cutoff, due);
    if (days >= 1) {
      const bi = days <= 15 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
      a.b[bi] += v;
      tot.b[bi] += v;
      if (days > 90) {
        const gi = groupIdx_(rawGroup_(g(row, 'grp')));
        if (gi >= 0) tot.grp90[gi] += v;
      }
      if (days > 120) { a.d120 += v; tot.d120 += v; }
      if (v > 0 && days > a.maxd) a.maxd = days;
    } else {
      a.notdue += v;
      tot.notdue += v;
    }
    const fu = g(row, 'fu');
    if (fu && a.fu.indexOf(fu) < 0 && a.fu.join(' | ').length < 300) a.fu.push(fu);
  }
  const series = {};
  put_(series, 'open', ym, tot.open);
  [0, 1, 2, 3].forEach(i => put_(series, 'aging:' + i, ym, tot.b[i]));
  put_(series, 'over90', ym, tot.b[4]);
  put_(series, 'due120', ym, tot.d120);
  tot.grp90.forEach((v, i) => put_(series, 'baddebt:' + i, ym, v));
  const rows = Object.keys(agg).map(k => {
    const a = agg[k];
    return [ym, a.pg, a.key, a.name, a.grp, a.sales, a.coll, a.branch, a.open, a.notdue,
      a.b[0], a.b[1], a.b[2], a.b[3], a.b[4], a.d120, a.maxd || '', a.fu.join(' | ')];
  }).sort((x, y) => y[BPA.open] - x[BPA.open]);
  return {
    months: [ym], series: series, bp: { [ym]: rows },
    stats: { cutoff: cutoff.getDate() + ' ' + abbr_(ym), barisDipakai: used, tanpaDueDate: skipped, barisBP: rows.length },
  };
}

// ---------------------------------------------------------------- Excel (Data Finance Presentation.xlsm)

function parseExcel_(wb) {
  const v = sheetRows_(wb.Sheets.Input);
  let hr = v.findIndex(r => String(r[0]).trim() === 'Blok');
  if (hr < 0) hr = 2;
  const hdr = v[hr] || [];
  const cols = [];
  hdr.forEach((x, i) => {
    if (i >= 3 && typeof x === 'number' && x > 30000) cols.push([i, ymOf_(rawDate_(x))]);
    else if (i >= 3 && x instanceof Date) cols.push([i, ymOf_(x)]);
  });
  const series = {};
  const labels = {};
  const sources = {};
  for (let r = hr + 1; r < v.length; r++) {
    const key = String(v[r][0] || '').trim();
    if (!/^[a-z0-9_]+(:\d+)?$/.test(key)) continue;     // hanya baris data (lewati judul blok)
    labels[key] = String(v[r][1] || '').trim();
    sources[key] = String(v[r][2] || '').trim();
    cols.forEach(([i, ym]) => {
      const x = v[r][i];
      if (typeof x === 'number' && isFinite(x)) put_(series, key, ym, x);
    });
  }
  const cell = a => (wb.Sheets.Config[a] ? wb.Sheets.Config[a].v : '');
  const b5 = cell('B5');
  const b6 = cell('B6');
  const month = b5 ? monthKey_(b5) : '';
  return {
    months: cols.map(c => c[1]), series: series, labels: labels, sources: sources,
    config: { month: month, week: Number(b6) || 2 },
    stats: { baris: Object.keys(labels).length, kolomBulan: cols.length, bulanLaporan: month ? full_(month) : '-' },
  };
}

// ---------------------------------------------------------------- template manual (dibuat oleh aplikasi)

function parseManual_(wb) {
  const out = { series: {}, manual: {}, months: [], stats: {} };
  const ms = {};
  if (wb.Sheets['Input Manual']) {
    const v = sheetRows_(wb.Sheets['Input Manual']);
    const hdr = v[0] || [];
    let n = 0;
    for (let r = 1; r < v.length; r++) {
      const key = String(v[r][0] || '').trim();
      if (!key) continue;
      hdr.forEach((hd, i) => {
        if (i < 2) return;
        const ym = monthKey_(hd);
        const x = v[r][i];
        if (ym && x !== '' && x !== null && isFinite(Number(x))) { put_(out.series, key, ym, Number(x)); ms[ym] = 1; n++; }
      });
    }
    out.stats['Input Manual'] = n + ' nilai';
  }
  MANUAL_TABLES.forEach(name => {
    const ws = wb.Sheets[name];
    if (!ws) return;
    const v = sheetRows_(ws);
    const head = (v[0] || []).map(h => String(h).trim());
    const rows = v.slice(1).filter(r => r.some(x => x !== '' && x !== null)).map(r => {
      const o = {};
      head.forEach((h, i) => { o[h] = r[i]; });
      o.Bulan = monthKey_(r[0]);
      if (o.Bulan) ms[o.Bulan] = 1;
      return o;
    }).filter(o => o.Bulan);
    out.manual[name] = rows;
    out.stats[name] = rows.length + ' baris';
  });
  out.months = Object.keys(ms).sort();
  return out;
}

if (typeof module !== 'undefined') module.exports = {};
