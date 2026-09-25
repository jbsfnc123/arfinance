/* Util bersama (browser, Web Worker, Node build-snapshot). Script klasik: fungsi global. */

const MFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const MABBR = MFULL.map(m => m.slice(0, 3));
const MID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
  'September', 'Oktober', 'November', 'Desember'];
const JT = 1e6;

// ---------------------------------------------------------------- bulan 'YYYY-MM'

function ymOf_(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function addM_(ym, k) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + k;
  return (y + Math.floor(m / 12)) + '-' + String(((m % 12) + 12) % 12 + 1).padStart(2, '0');
}
function mIdx_(ym) { return Number(ym.slice(5, 7)) - 1; }
function yr_(ym) { return Number(ym.slice(0, 4)); }
function abbr_(ym) { return MABBR[mIdx_(ym)] + ' ' + yr_(ym); }                 // Aug 2026
function full_(ym) { return MFULL[mIdx_(ym)] + ' ' + yr_(ym); }                 // August 2026
function idMonth_(ym) { return MID[mIdx_(ym)] + ' ' + yr_(ym); }                // Agustus 2026
function cat_(ym) { return MABBR[mIdx_(ym)].toUpperCase() + ' ' + String(yr_(ym)).slice(2); }  // AUG 26
function short_(ym) { return MABBR[mIdx_(ym)] + " '" + String(yr_(ym)).slice(2); }             // Aug '26
function lastDay_(ym) { return new Date(yr_(ym), mIdx_(ym) + 1, 0).getDate(); }
function monthRange_(ym, from, to) { const o = []; for (let k = from; k <= to; k++) o.push(addM_(ym, k)); return o; }

/** Date | serial Excel | 'dd/mm/yyyy' | '19 Sep , 2026' | 'YYYY-MM-DD' -> Date lokal tengah malam, atau null. */
function rawDate_(v) {
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number') {
    if (v < 1000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v === null || v === undefined ? '' : v).trim();
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s*,?\s*(\d{4})$/.exec(s);
  if (m) {
    const i = MABBR.findIndex(a => a.toLowerCase() === m[2].toLowerCase());
    if (i >= 0) return new Date(Number(m[3]), i, Number(m[1]));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

/** Nilai kolom Bulan (Date / serial / 'YYYY-MM' / 'Aug 2026') -> 'YYYY-MM' atau ''. */
function monthKey_(v) {
  if (v instanceof Date || typeof v === 'number') {
    const d = rawDate_(v);
    return d ? ymOf_(d) : '';
  }
  const s = String(v === null || v === undefined ? '' : v).trim();
  let m = /^(\d{4})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0');
  m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(s);
  if (m) {
    const i = MABBR.findIndex(a => a.toLowerCase() === m[1].toLowerCase());
    if (i >= 0) return m[2] + '-' + String(i + 1).padStart(2, '0');
  }
  const d = rawDate_(s);
  return d ? ymOf_(d) : '';
}

function dayDiff_(a, b) {
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
    Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5);
}

function rawNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v === null || v === undefined ? '' : v).trim().replace(/\s/g, '');
  if (!s || s === '-') return 0;
  if (/,\d{0,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------- format angka (gaya Indonesia)

function isNum_(x) { return x !== null && x !== undefined && x !== '' && isFinite(x); }

/** 874861 -> '874.861' (sep default '.') */
function grp_(x, sep) {
  if (!isNum_(x)) return '-';
  const n = Math.round(x);
  return (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep || '.');
}
function dec_(x, n, sep) {
  if (!isNum_(x)) return '-';
  const r = Math.abs(x).toFixed(n);
  return (sep || ',') === ',' ? r.replace('.', ',') : r;
}
function num_(x, n) {                               // bertanda, ribuan '.', desimal ','
  if (!isNum_(x)) return '-';
  const f = Math.abs(x).toFixed(n || 0).split('.');
  return (x < 0 ? '−' : '') + f[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f[1] ? ',' + f[1] : '');
}
function rp_(x) { return isNum_(x) ? 'Rp ' + grp_(x, '.') : '-'; }
function jt_(v) { return isNum_(v) ? num_(v / JT) + ' jt' : '-'; }
/** Rupiah ringkas: 115.561.075.635 -> 'Rp115,6 B' ; 845 jt -> 'Rp845 jt' */
function money_(v, d) {
  if (!isNum_(v)) return '-';
  const a = Math.abs(v);
  if (a >= 1e12) return (v < 0 ? '−' : '') + 'Rp' + dec_(a / 1e12, d === undefined ? 2 : d) + ' T';
  if (a >= 1e9) return (v < 0 ? '−' : '') + 'Rp' + dec_(a / 1e9, d === undefined ? 1 : d) + ' B';
  if (a >= 1e6) return (v < 0 ? '−' : '') + 'Rp' + num_(a / 1e6) + ' jt';
  return (v < 0 ? '−' : '') + 'Rp' + num_(a);
}
function billion_(rp) { return dec_(rp / 1e9, 1) + ' B'; }
function pc_(v, n) { return isNum_(v) ? (v < 0 ? '−' : '') + dec_(v * 100, n === undefined ? 1 : n) + '%' : '-'; }
function pp_(v, n) { return isNum_(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + dec_(v * 100, n === undefined ? 1 : n) + ' pp' : '-'; }
function sgn_(v, fmt) {
  if (!isNum_(v)) return '-';
  return (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
}
function growth_(cur, prev) { return isNum_(cur) && isNum_(prev) && prev ? cur / prev - 1 : null; }
function chg_(cur, prev) {
  const g = growth_(cur, prev);
  return g === null ? '-' : sgn_(cur - prev, x => money_(x)) + ' (' + sgn_(g, x => pc_(x)) + ')';
}
function days_(v) { return isNum_(v) ? num_(v, 1) + ' hari' : '-'; }

function esc_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

if (typeof module !== 'undefined') module.exports = {};
