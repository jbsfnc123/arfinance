/* Orkestrator aplikasi: state, render slide, skala, presentasi, keyboard, export. */

/** Data Center: di AR Workspace dibuka di halaman induk (bridge); tanpa bridge memakai modal lama. */
function openDataCenter_() {
  try { const b = window.parent !== window ? window.parent.ARDeckBridge : null; if (b && b.openDataCenter) { b.openDataCenter(); return; } } catch (e) { /* lintas origin */ }
  DataCenter.open();
}

const App = (() => {
  let state = null;
  let D = null;
  let months = [];
  let m = '';
  let cur = 0;
  const ui = {};                 // state UI per slide (toggle, tab, pencarian)
  let notes = [];
  let timerStart = 0;
  let timerId = null;
  let editing = false;
  const $ = id => document.getElementById(id);
  const ls = {
    get: k => { try { return localStorage.getItem('ar-deck:' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('ar-deck:' + k, v); } catch (e) { /* abaikan */ } },
  };

  // ---------------------------------------------------------------- data

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function rebuild() {
    D = buildModel_(state);
    months = availableMonths_(D);
    const want = m || ls.get('month') || D.cfg.month;
    m = months.indexOf(want) >= 0 ? want : (months.indexOf(D.cfg.month) >= 0 ? D.cfg.month : months[months.length - 1] || '');
    $('month').innerHTML = months.slice().reverse().map(ym => '<option value="' + ym + '"' + (ym === m ? ' selected' : '') + '>' +
      esc_(idMonth_(ym)) + (ym === D.cfg.month ? ' · laporan' : '') + '</option>').join('');
    const cov = m ? coverage_(D, m) : [];
    const ok = cov.length && cov.every(c => c.ok);
    $('dataStatus').innerHTML = '<span class="status-dot' + (ok ? '' : ' warn') + '"></span><span>' +
      (state.demo ? 'Data demo' : 'Data server') + (m ? ' · ' + cov.filter(c => c.ok).length + '/' + cov.length + ' lengkap' : ' · kosong') + '</span>';
  }

  async function setState(st, msg) {
    state = st;
    const saved = await Store.save(state);
    rebuild();
    render();
    if (msg) toast(msg + (saved ? '' : ' (GAGAL tersimpan ke server)'));
  }

  async function resetDemo() {
    await Store.clear();
    m = '';
    await setState(clone(window.DEMO_SNAPSHOT || newState_()), 'Data dikosongkan');
  }

  // ---------------------------------------------------------------- render

  function renderRail() {
    $('rail').innerHTML = '<h6>Alur presentasi</h6>' + SLIDES.map((s, i) =>
      '<div class="rail-item' + (i === cur ? ' active' : '') + '" data-i="' + i + '"><span class="n">' + (i + 1) + '</span><div><div class="t">' +
      esc_(s.title) + '</div><div class="d">' + esc_(s.desc) + '</div></div></div>').join('');
    $('rail').querySelectorAll('.rail-item').forEach(n => n.onclick = () => go(Number(n.dataset.i)));
  }

  function render() {
    Charts.disposeAll();
    const stage = $('stage');
    stage.innerHTML = '';
    const el = document.createElement('section');
    el.className = 'slide';
    stage.appendChild(el);
    const s = SLIDES[cur];
    if (!m) {
      el.innerHTML = '<div class="empty-note" style="margin:auto;font-size:18px">Belum ada data.<br><br><button class="btn primary" data-act="datacenter">Buka Data Center: unduh &amp; upload template bulanan</button></div>';
      notes = [];
    } else {
      const ctx = {
        D: D, m: m, num: cur + 1, ui: ui[s.id] = ui[s.id] || {},
        set: (k, v) => { ui[s.id][k] = v; render(); },
        drill: o => { if (!editing) Drawer.open(o); },
      };
      try {
        const r = s.render(ctx, el) || {};
        notes = r.notes || [];
        applyTexts(el, s.id, editing);
      } catch (err) {
        console.error(err);
        el.innerHTML = '<div class="empty-note" style="margin:auto">Slide gagal ditampilkan: ' + esc_(err.message) + '</div>';
        notes = [];
      }
    }
    $('notes').innerHTML = notes.length ? '<b>Catatan pembicara</b> — ' + notes.map(esc_).join(' ') : '';
    $('counter').textContent = (cur + 1) + ' / ' + SLIDES.length + ' · ' + s.title;
    $('phudCount').textContent = (cur + 1) + ' / ' + SLIDES.length;
    $('pbar').style.width = ((cur + 1) / SLIDES.length * 100) + '%';
    renderRail();
    fit();
  }

  function go(i) {
    const n = Math.max(0, Math.min(SLIDES.length - 1, i));
    if (n === cur) return;
    cur = n;
    ls.set('slide', String(cur));
    if (Drawer.isOpen()) Drawer.close();
    render();
  }

  function fit() {
    const wrap = $('stageWrap');
    const presenting = document.body.classList.contains('presenting');
    const pad = presenting ? 0 : 40;
    const sc = Math.max(0.2, Math.min((wrap.clientWidth - pad) / 1280, (wrap.clientHeight - pad) / 720));
    const stage = $('stage');
    stage.style.width = 1280 * sc + 'px';
    stage.style.height = 720 * sc + 'px';
    stage.querySelectorAll('.slide').forEach(s => { s.style.transform = 'scale(' + sc + ')'; });
  }
  function refit() {
    if (document.body.classList.contains('presenting')) fit();
    else setTimeout(fit, 220);
  }

  // ---------------------------------------------------------------- presentasi

  function present() {
    if (editing) setEditing(false);
    document.body.classList.add('presenting');
    const r = document.documentElement.requestFullscreen;
    if (r) r.call(document.documentElement).catch(() => {});
    timerStart = Date.now();
    clearInterval(timerId);
    timerId = setInterval(() => {
      const s = Math.floor((Date.now() - timerStart) / 1000);
      $('phudTime').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
    hud();
    setTimeout(() => { fit(); Charts.resizeAll(); }, 150);
  }
  function exitPresent() {
    document.body.classList.remove('presenting', 'show-notes');
    clearInterval(timerId);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    setTimeout(() => { fit(); Charts.resizeAll(); }, 150);
  }
  function hud() {
    const h = $('phud');
    h.classList.add('show');
    clearTimeout(h._t);
    h._t = setTimeout(() => h.classList.remove('show'), 2200);
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('presenting')) exitPresent();
  });

  function theme(t) {
    const next = t || (document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    document.documentElement.dataset.theme = next;
    ls.set('theme', next);
    if (D) render();
  }

  // ---------------------------------------------------------------- edit teks di layar (disimpan per bulan)

  const EDIT_SEL = [
    ['.s-head .eyebrow', 'eyebrow'], ['.s-head h1', 'title'], ['.s-foot > span:first-child', 'foot'],
    ['.card > h3', 'h3'], ['.kpi .label', 'label'], ['.list li > span:last-child', 'li'],
    ['.cover-inner .kicker', 'kicker'], ['.cover-inner h1', 'ctitle'], ['.cover-inner .period', 'period'], ['.cover-inner h2', 'h2'],
  ];

  /** Identitas tampilan (toggle/tab aktif) supaya teks per tampilan tidak tertukar. */
  function viewSuffix(el) {
    const parts = [];
    el.querySelectorAll('.seg').forEach(s => { const on = s.querySelector('button.on'); if (on) parts.push(s.dataset.seg + '=' + on.dataset.v); });
    const segBtn = el.querySelector('[data-seg-btn].primary');
    if (segBtn) parts.push('seg=' + segBtn.dataset.segBtn);
    return parts.length ? '[' + parts.join(',') + ']' : '';
  }

  function applyTexts(el, sid, edit) {
    const T = (state.texts && state.texts[m]) || {};
    const pre = sid + viewSuffix(el);
    EDIT_SEL.forEach(([sel, name]) => el.querySelectorAll(sel).forEach((n, i) => {
      let target = n;
      if (name === 'h3') {                                   // judul kartu: hanya teks, bukan hint di dalamnya
        const tn = Array.from(n.childNodes).find(c => c.nodeType === 3 && c.textContent.trim());
        if (!tn) return;
        target = document.createElement('span');
        target.textContent = tn.textContent;
        n.replaceChild(target, tn);
      }
      const key = pre + '.' + name + '.' + i;
      target.dataset.edit = key;
      target.dataset.def = target.innerText;
      if (T[key] !== undefined) { target.innerText = T[key]; target.classList.add('edited'); }
    }));
    const note = T[pre + '.note'];
    const box = document.createElement('div');
    box.className = 'mnote' + (note ? '' : ' empty');
    box.dataset.edit = pre + '.note';
    box.dataset.def = '';
    box.innerText = note || '';
    el.appendChild(box);
    if (edit) el.querySelectorAll('[data-edit]').forEach(n => { n.contentEditable = 'true'; n.spellcheck = false; });
  }

  function saveText(n) {
    const key = n.dataset.edit;
    const v = n.innerText.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    const def = (n.dataset.def || '').trim();
    const T = (state.texts = state.texts || {})[m] = (state.texts[m] || {});
    const before = T[key];
    if (!v && !/\.note$/.test(key)) { delete T[key]; n.innerText = def; }
    else if (v === def || (!v && /\.note$/.test(key))) delete T[key];
    else T[key] = v;
    n.classList.toggle('edited', T[key] !== undefined);
    if (n.classList.contains('mnote')) n.classList.toggle('empty', !T[key]);
    if (before !== T[key]) Store.save(state);
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    if (on && Drawer.isOpen()) Drawer.close();
    render();
    toast(on ? 'Mode edit teks: klik teks pada slide untuk mengubah · Enter simpan · E selesai' : 'Mode edit selesai — teks tersimpan untuk ' + idMonth_(m));
  }

  function resetText(n) {
    const T = (state.texts || {})[m] || {};
    delete T[n.dataset.edit];
    n.innerText = n.dataset.def || '';
    n.classList.remove('edited');
    if (n.classList.contains('mnote')) n.classList.add('empty');
    Store.save(state);
  }

  /** Tombol kecil "Kembalikan otomatis" saat teks yang sudah diedit sedang difokus. */
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn reset-text';
  resetBtn.textContent = '↺ Kembalikan teks otomatis';
  document.body.appendChild(resetBtn);
  let resetTarget = null;
  resetBtn.addEventListener('mousedown', e => { e.preventDefault(); if (resetTarget) resetText(resetTarget); resetBtn.style.display = 'none'; });
  document.addEventListener('focusin', e => {
    const n = e.target.closest && e.target.closest('[data-edit]');
    if (!editing || !n) return;
    resetTarget = n;
    if (!n.classList.contains('edited')) { resetBtn.style.display = 'none'; return; }
    const r = n.getBoundingClientRect();
    resetBtn.style.left = Math.max(8, r.left) + 'px';
    resetBtn.style.top = Math.max(8, r.top - 34) + 'px';
    resetBtn.style.display = 'inline-flex';
  });
  document.addEventListener('focusout', e => {
    const n = e.target.closest && e.target.closest('[data-edit]');
    if (!n || !editing) return;
    saveText(n);
    setTimeout(() => { if (!document.activeElement || !document.activeElement.closest('[data-edit]')) resetBtn.style.display = 'none'; }, 50);
  });

  function textCount(ym) { return Object.keys(((state.texts || {})[ym || m]) || {}).length; }
  async function resetTexts(ym) {
    if (state.texts) delete state.texts[ym || m];
    await Store.save(state);
    render();
  }

  // ---------------------------------------------------------------- export PDF

  async function exportPdf(noPrint) {
    const root = $('printRoot');
    Charts.disposeAll();
    root.innerHTML = '';
    const light = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'light';
    SLIDES.forEach((s, i) => {
      const el = document.createElement('section');
      el.className = 'slide';
      root.appendChild(el);
      try {
        s.render({ D: D, m: m, num: i + 1, ui: Object.assign({}, ui[s.id] || {}), set: () => {}, drill: () => {} }, el);
        applyTexts(el, s.id, false);
      } catch (err) { el.textContent = err.message; }
    });
    root.style.display = 'block';
    root.style.position = 'fixed';
    root.style.left = '-99999px';
    Charts.resizeAll();
    await new Promise(r => setTimeout(r, 900));
    root.style.position = '';
    root.style.left = '';
    root.style.display = '';
    if (noPrint) { window.__printReady = true; return; }   // mode uji: biarkan untuk --print-to-pdf
    window.print();
    root.innerHTML = '';
    document.documentElement.dataset.theme = light;
    render();
  }

  // ---------------------------------------------------------------- aksi & keyboard

  const ACT = {
    prev: () => go(cur - 1), next: () => go(cur + 1), present: present, theme: () => theme(), edit: () => setEditing(!editing),
    notes: () => {
      if (document.body.classList.contains('presenting')) document.body.classList.toggle('show-notes');
      else $('notes').classList.toggle('show');
      setTimeout(fit, 30);
    },
    datacenter: () => openDataCenter_(), 'dc-close': () => DataCenter.close(), 'drawer-close': () => Drawer.close(),
    'export-menu': () => $('exportMenu').classList.toggle('open'),
    'export-pdf': () => { DataCenter.close(); exportPdf(); },
    'export-xlsx': () => Exporter.xlsx(state, D),
    'export-json': () => Exporter.json(state),
    'export-template': () => Exporter.template(state, D, m),
  };

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a || a.closest('.menu') !== $('exportMenu') || a.dataset.act !== 'export-menu') $('exportMenu').classList.remove('open');
    if (a && ACT[a.dataset.act]) { ACT[a.dataset.act](); return; }
    if (!editing && document.body.classList.contains('presenting') && e.target.closest('.slide') &&
        !e.target.closest('canvas, .click, tr, button, input, .ent, .seg, [data-seg-btn]')) go(cur + 1);
  });
  document.addEventListener('mousemove', () => { if (document.body.classList.contains('presenting')) hud(); });

  document.addEventListener('keydown', e => {
    if (DataCenter.isOpen()) { if (e.key === 'Escape') DataCenter.close(); return; }
    if (e.target.isContentEditable) {
      const multi = /\.(note|ctitle)$/.test(e.target.dataset.edit || '');
      if (e.key === 'Escape' || (e.key === 'Enter' && !multi && !e.shiftKey)) { e.preventDefault(); e.target.blur(); }
      return;
    }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && document.body.classList.contains('presenting'))) { go(cur + 1); e.preventDefault(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { go(cur - 1); e.preventDefault(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(SLIDES.length - 1);
    else if (k === 'Escape') { if (Drawer.isOpen()) Drawer.close(); else if (document.body.classList.contains('presenting')) exitPresent(); }
    else if (k === 'd' || k === 'D') { if (Drawer.isOpen()) Drawer.close(); }
    else if (k === 't' || k === 'T') theme();
    else if (k === 'e' || k === 'E') setEditing(!editing);
    else if (k === 'n' || k === 'N') ACT.notes();
    else if (k === 'p' || k === 'P' || (k === 'Enter' && (e.ctrlKey || e.metaKey))) present();
  });

  $('month').addEventListener('change', e => { m = e.target.value; ls.set('month', m); if (Drawer.isOpen()) Drawer.close(); rebuild(); render(); });
  $('fileInput').addEventListener('change', e => { e.target.value = ''; openDataCenter_(); });
  window.addEventListener('resize', () => { fit(); Charts.resizeAll(); });
  $('drawer').addEventListener('transitionend', e => { if (e.propertyName === 'width') fit(); });
  // seret file ke mana saja -> Data Center
  window.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); } });
  window.addEventListener('drop', e => e.preventDefault());

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ---------------------------------------------------------------- boot

  async function boot() {
    const th = ls.get('theme');
    if (th) document.documentElement.dataset.theme = th;
    const saved = await Store.load();
    state = saved || clone(window.DEMO_SNAPSHOT || newState_());
    const q = new URLSearchParams(location.search);
    cur = Math.max(0, Math.min(SLIDES.length - 1, Number(q.get('s') ? Number(q.get('s')) - 1 : ls.get('slide') || 0)));
    if (q.get('m')) m = q.get('m');
    if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme');
    rebuild();
    // parameter uji: ?text=<kunci>::<teks> (simulasi teks yang sudah diedit, tidak disimpan) dan ?edit=1
    q.getAll('text').forEach(t => { const i = t.indexOf('::'); ((state.texts = state.texts || {})[m] = state.texts[m] || {})[t.slice(0, i)] = t.slice(i + 2); });
    if (q.get('edit')) { editing = true; document.body.classList.add('editing'); }
    if (q.get('notrans')) document.body.classList.add('notrans');
    render();
    if (q.get('present')) present();
    if (q.get('dc')) openDataCenter_();
    if (q.get('selftest')) selfTest();
    if (q.get('printall')) exportPdf(true);
    // parameter uji otomatis (screenshot): ?click=<selector>&chartclick=i,seri,index
    setTimeout(() => {
      if (q.get('click')) { const n = document.querySelector(q.get('click')); if (n) n.click(); }
      if (q.get('chartclick')) { const a = q.get('chartclick').split(',').map(Number); Charts.simulate(a[0], a[1], a[2]); }
      if (q.get('again') && q.get('click')) { const n = document.querySelector(q.get('click')); if (n) n.click(); }
    }, 700);
    window.__ready = true;
  }

  /** Uji pipeline import (Worker + parser) dengan file Invoice sintetis; hasil di judul tab & toast. */
  async function selfTest() {
    const aoa = [['Laporan'], [], ['BP Key', 'BP Name', 'BP Location', '', '', 'BP Group', 'Marketing Group', 'Branch', 'Credit Limit', 'Group Credit Limit',
      'Payment Term', 'Invoice No.', 'Invoice Amount', 'Invoice Date', 'Due Date', 'Payment Document', 'Payment Bank Account', 'Payment Amount', 'Payment Date']];
    const d = (y, mo, da) => (Date.UTC(y, mo - 1, da) - Date.UTC(1899, 11, 30)) / 864e5;
    aoa.push(['1', 'A', '', '', '', 'A', 'Traditional', 'Jakarta', 0, 0, 'Net 30 Days', 'X1', 1000000, d(2030, 1, 5), d(2030, 2, 4), '', '', 1000000, d(2030, 2, 9)]);
    aoa.push(['2', 'B', '', '', '', 'B', 'Reseller', 'Surabaya', 0, 0, 'C B D', 'X2', 500000, d(2030, 1, 6), d(2030, 1, 6), '', '', 500000, d(2030, 1, 6)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S');
    const file = new File([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], 'selftest.xlsx');
    const t0 = performance.now();
    try {
      const r = await Store.parseFile(file);
      const ok = r.kind === 'invoice' && r.series['amt_all:0']['2030-01'] === 1000000 && r.series['s7_amt:5']['2030-01'] === 500000 &&
        r.bp['2030-01'].find(x => x[1] === '1')[12] === 5;
      document.title = (ok ? 'SELFTEST OK' : 'SELFTEST FAIL') + ' worker=' + (location.protocol !== 'file:');
      stamp(document.title + ' · ' + Math.round(performance.now() - t0) + ' ms');
    } catch (err) {
      document.title = 'SELFTEST ERROR ' + err.message;
      stamp(document.title);
    }
    function stamp(t) {
      const n = document.createElement('div');
      n.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99;background:#111;color:#0f0;padding:8px 12px;border-radius:8px;font:13px monospace';
      n.textContent = t;
      console.log(t);
      document.body.appendChild(n);
    }
  }

  return {
    boot, refit, toast, setState, resetDemo, go, textCount, resetTexts, isEditing: () => editing,
    state: () => state, model: () => D, month: () => m, slide: () => cur,
  };
})();

window.addEventListener('error', e => App.toast('Galat: ' + (e.message || e.error)));
window.addEventListener('unhandledrejection', e => App.toast('Galat: ' + (e.reason && e.reason.message || e.reason)));
App.boot();
