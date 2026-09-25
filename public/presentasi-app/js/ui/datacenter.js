/* Data Center: import, kelengkapan, rekonsiliasi, input manual, export, riwayat. */

const DataCenter = (() => {
  const TABS = [['import', 'Import'], ['coverage', 'Kelengkapan'], ['recon', 'Rekonsiliasi'], ['manual', 'Input manual'],
    ['export', 'Export & reset'], ['history', 'Riwayat']];
  let tab = 'import';
  let results = [];
  let manualMonth = null;
  const $ = id => document.getElementById(id);
  const KIND = { invoice: 'Invoice (sales)', payment: 'Invoice Payment Date', aging: 'Aging mentah', bpmaster: 'Master Business Partner',
    excel: 'Excel Input', manual: 'Template manual', snapshot: 'Snapshot' };

  function open(t) {
    if (t) tab = t;
    $('dc').classList.add('open');
    render();
  }
  function close() { $('dc').classList.remove('open'); }
  function isOpen() { return $('dc').classList.contains('open'); }

  function render() {
    const st = App.state();
    $('dcState').textContent = st.demo ? 'Data demo bawaan' :
      'Tersimpan di server · ' + (st.savedAt ? new Date(st.savedAt).toLocaleString('id-ID') : '-');
    $('dcTabs').innerHTML = TABS.map(([k, l]) => '<button data-tab="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + l + '</button>').join('');
    $('dcTabs').querySelectorAll('button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    const body = $('dcBody');
    body.innerHTML = ({ import: vImport, coverage: vCoverage, recon: vRecon, manual: vManual, export: vExport, history: vHistory })[tab]();
    bind(body);
  }

  // ---------------------------------------------------------------- import

  function vImport() {
    return '<div class="drop" id="drop"><b>Seret file ke sini</b> atau klik untuk memilih' +
      '<p>Bisa beberapa file sekaligus: <b>Invoice*.xls</b> (per tanggal invoice), <b>Invoice payment date*.xls</b> (per tanggal bayar → late days), ' +
      '<b>Aging*.xls</b>, <b>Business Partner.xlsx</b> (±1 menit, file besar), <b>Data Finance Presentation.xlsm</b>, template input manual, atau snapshot <b>.json</b>.<br>' +
      'Jenis file dikenali otomatis dari isinya. Diproses di browser — tidak ada data yang dikirim ke server.</p></div>' +
      '<div class="filelist">' + results.map(r => '<div class="fileitem"><div class="top"><span class="kind' + (r.error ? ' err' : '') + '">' +
        esc_(r.error ? 'Gagal' : r.done ? KIND[r.kind] || r.kind : 'Memproses…') + '</span><b>' + esc_(r.file) + '</b>' +
        (r.ms ? '<small style="margin-left:auto">' + (r.ms / 1000).toFixed(1) + ' dtk</small>' : '') + '</div>' +
        (r.error ? '<small style="color:var(--bad)">' + esc_(r.error) + '</small>' : '') +
        (r.done ? '<small>Bulan: ' + esc_((r.months || []).map(abbr_).join(', ') || '-') + ' · ' +
          esc_(Object.keys(r.stats || {}).map(k => k + ': ' + r.stats[k]).join(' · ')) + '</small>' : '') +
        (r.check && r.check.length ? '<small>' + r.check.map(esc_).join('<br>') + '</small>' : '') + '</div>').join('') + '</div>' +
      '<div class="help" style="margin-top:18px"><b>Late days</b> — dari file Invoice Payment Date: Payment Date − Due Date, rata-rata semua transaksi di bulan ' +
      '<b>pembayaran</b>; transaksi dengan Invoice Date = Due Date dibuang. File Invoice dan Payment adalah laporan yang sama — jenisnya dikenali dari filter tanggalnya.<br>' +
      '<b>Alur data</b> — file mentah Invoice & Aging langsung menghasilkan angka Sales, Aging, dan detail per BP ' +
      '(tanpa macro Excel). File Excel (.xlsm) melengkapi bulan historis dan input manual. Prioritas angka: <span class="src manual">M</span> input manual › ' +
      '<span class="src raw">R</span> file mentah › <span class="src excel">E</span> Excel.</div>';
  }

  async function importFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    tab = 'import';
    let st = App.state();
    let changed = false;
    for (const f of list) {
      const r = { file: f.name };
      results.unshift(r);
      render();
      const t0 = performance.now();
      try {
        const res = await Store.parseFile(f);
        const b = Store.bridge();
        if (b && b.shareFile && ['invoice', 'payment', 'aging', 'bpmaster'].indexOf(res.kind) >= 0) {
          // AR Workspace: laporan mentah disimpan sekali ke database bersama, deck dihitung ulang darinya.
          const before = buildModel_(st);
          r.shared = await b.shareFile(f);
          st = await b.load(window);
          r.check = [r.shared].concat(checkAgainst_(before, res));
          Object.assign(r, { done: true, kind: res.kind, months: res.months, stats: res.stats, ms: performance.now() - t0 });
          changed = true;
          render();
          continue;
        }
        if (res.kind === 'snapshot') {
          if (!confirm('Ganti seluruh data dengan snapshot "' + f.name + '"?')) { r.error = 'Dibatalkan'; render(); continue; }
          st = res.state;
        } else {
          const before = buildModel_(st);
          st = applyImport_(st, res);
          r.check = checkAgainst_(before, res);
        }
        Object.assign(r, { done: true, kind: res.kind, months: res.months, stats: res.stats, ms: performance.now() - t0 });
        changed = true;
      } catch (err) {
        r.error = err && err.message ? err.message : String(err);
      }
      render();
    }
    if (changed) {
      st.demo = false;
      await App.setState(st, 'Data diperbarui dari ' + list.length + ' file');
      render();
    }
  }

  /** Ringkas: angka baru vs angka sebelumnya (Excel) untuk bulan yang diimpor. */
  function checkAgainst_(before, res) {
    const out = [];
    if (res.kind !== 'invoice' && res.kind !== 'aging') return out;
    res.months.forEach(ym => {
      const keys = res.kind === 'invoice' ? [['amt_all:0', 'TOP'], ['amt_all:1', 'Ex DO'], ['amt_all:2', 'CBD']] : [['open', 'Open amount'], ['over90', '> 90 hari']];
      keys.forEach(([k, l]) => {
        const nv = (res.series[k] || {})[ym];
        const ov = g_(before, k, ym);
        if (ov === null) out.push(abbr_(ym) + ' ' + l + ': ' + money_(nv) + ' (baru)');
        else out.push(abbr_(ym) + ' ' + l + ': ' + money_(nv) + (Math.abs(nv - ov) < 1 ? ' — sama dengan data sebelumnya' : ' — sebelumnya ' + money_(ov)));
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- kelengkapan

  function vCoverage() {
    const D = App.model();
    const months = availableMonths_(D).slice(-14).reverse();
    const badge = (ok, src) => (ok ? '<span class="src ' + (src || 'none') + '">' + ({ raw: 'R', excel: 'E', manual: 'M' }[src] || '✓') + '</span>' : '<span class="src none">–</span>');
    const heads = months.length ? coverage_(D, months[0]).map(c => c.label) : [];
    const mi = D.bpMasterInfo;
    return '<p class="help">Asal angka per bulan: <span class="src raw">R</span> file mentah · <span class="src excel">E</span> Excel · <span class="src manual">M</span> input manual. ' +
      'Master Business Partner: ' + (mi ? '<b>' + esc_(mi.file) + '</b> · ' + grp_(mi.count, '.') + ' BP · diimpor ' + esc_(new Date(mi.at).toLocaleString('id-ID')) : '<b>belum diimpor</b>') + '.</p>' +
      '<table class="t matrix"><thead><tr><th>Bulan</th>' + heads.map(h => '<th>' + esc_(h) + '</th>').join('') + '<th class="r">Sales</th><th class="r">Open AR</th><th class="r">Late days</th></tr></thead><tbody>' +
      months.map(ym => {
        const c = coverage_(D, ym);
        return '<tr><td><b>' + esc_(full_(ym)) + '</b></td>' + c.map(x => '<td>' + badge(x.ok, x.src) + '</td>').join('') +
          '<td class="r num">' + money_(sales_(D, ym)) + '</td><td class="r num">' + money_(openAmt_(D, ym)) + '</td><td class="r num">' + days_(g_(D, 'late_all', ym)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ---------------------------------------------------------------- rekonsiliasi

  function vRecon() {
    const D = App.model();
    const rows = D.recon.filter(r => Math.abs(r.diff) >= 1);
    const same = D.recon.length - rows.length;
    return '<p class="help">Membandingkan angka dari <b>file mentah</b> dengan angka di <b>Excel (.xlsm)</b> untuk bulan & metrik yang sama. ' +
      'Web app memakai file mentah. <b>' + same + '</b> angka identik; <b>' + rows.length + '</b> berbeda:</p>' +
      (rows.length ? '<table class="t"><thead><tr><th>Bulan</th><th>Metrik</th><th class="r">File mentah</th><th class="r">Excel</th><th class="r">Selisih</th></tr></thead><tbody>' +
        rows.map(r => '<tr><td>' + esc_(full_(r.ym)) + '</td><td>' + esc_(r.label) + ' <small style="color:var(--text-3)">' + esc_(r.key) + '</small></td>' +
          '<td class="r num">' + grp_(r.raw) + '</td><td class="r num">' + grp_(r.excel) + '</td><td class="r num" style="color:var(--bad)">' + sgn_(r.diff, x => grp_(x)) +
          '</td></tr>').join('') + '</tbody></table>' : '<div class="empty-note">Tidak ada selisih.</div>');
  }

  // ---------------------------------------------------------------- input manual

  function vManual() {
    const D = App.model();
    const months = availableMonths_(D);
    manualMonth = manualMonth && months.indexOf(manualMonth) >= 0 ? manualMonth : App.month();
    const opts = months.concat([addM_(months[months.length - 1], 1)]).reverse();
    return '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><b>Bulan</b><select class="select" id="mm">' +
      opts.map(ym => '<option value="' + ym + '"' + (ym === manualMonth ? ' selected' : '') + '>' + esc_(full_(ym)) + '</option>').join('') + '</select>' +
      '<span class="help">Nilai Rupiah penuh. Collection % dalam desimal (0,9654). Kosongkan untuk memakai angka Excel.</span><div class="tb-spacer"></div>' +
      '<button class="btn primary" data-dc="save-manual">Simpan</button></div>' +
      '<table class="t grid-input"><thead><tr><th>Item</th><th>Sumber saat ini</th><th class="r">Nilai</th></tr></thead><tbody>' +
      manualKeyList_().map(([k, l]) => {
        const v = g_(D, k, manualMonth);
        const src = src_(D, k, manualMonth);
        return '<tr><td>' + esc_(l) + '<br><small style="color:var(--text-3)">' + esc_(k) + '</small></td><td>' +
          (src ? '<span class="src ' + src + '">' + esc_(LAYER_LABEL[src]) + '</span>' : '<span class="src none">kosong</span>') +
          '</td><td class="r"><input data-key="' + k + '" value="' + (v === null ? '' : (k === 'collpct:0' ? String(v).replace('.', ',') : grp_(v))) + '"></td></tr>';
      }).join('') + '</tbody></table>';
  }

  async function saveManual(body) {
    const st = App.state();
    const L = st.layers.manual;
    let n = 0;
    body.querySelectorAll('input[data-key]').forEach(inp => {
      if (!inp.classList.contains('changed')) return;
      const k = inp.dataset.key;
      const raw = inp.value.trim();
      if (!raw) {
        if (L[k]) delete L[k][manualMonth];
      } else {
        const v = k === 'collpct:0' ? Number(raw.replace(/\./g, '').replace(',', '.')) : rawNum_(raw);
        (L[k] = L[k] || {})[manualMonth] = v;
      }
      n++;
    });
    if (!n) { App.toast('Tidak ada perubahan'); return; }
    st.imports.unshift({ file: 'Input manual (Data Center)', kind: 'manual', at: new Date().toISOString(), months: [manualMonth], stats: { nilai: n } });
    st.demo = false;
    await App.setState(st, n + ' nilai input manual disimpan');
    render();
  }

  // ---------------------------------------------------------------- export & riwayat

  function vExport() {
    return '<div class="cards3">' +
      '<div class="action"><b>Snapshot data (.json)</b><p>Seluruh data (termasuk detail BP & input manual) dalam satu file. Import di laptop lain untuk presentasi yang sama persis.</p><button class="btn" data-act="export-json">Download snapshot</button></div>' +
      '<div class="action"><b>Excel lengkap</b><p>Ringkasan metrik, seri per bulan + sumber angka, BP Sales, BP Aging, dan tabel manual.</p><button class="btn" data-act="export-xlsx">Download Excel</button></div>' +
      '<div class="action"><b>Template input manual</b><p>Excel berisi item manual 3 bulan terakhir + bulan depan dan tabel manual bulan laporan. Isi, lalu seret kembali ke Import.</p><button class="btn" data-act="export-template">Download template</button></div>' +
      '<div class="action"><b>PDF presentasi</b><p>Semua slide, satu halaman per slide (16:9) lewat dialog cetak browser.</p><button class="btn" data-act="export-pdf">Cetak / PDF</button></div>' +
      '<div class="action"><b>Teks yang diedit</b><p>' + App.textCount() + ' teks diedit untuk ' + esc_(idMonth_(App.month())) +
      '. Edit langsung di slide lewat tombol <b>Edit teks</b> (E).</p><button class="btn" data-dc="reset-texts"' + (App.textCount() ? '' : ' disabled') + '>Kembalikan semua teks otomatis</button></div>' +
      '<div class="action"><b>Mulai dari kosong</b><p>Hapus semua data deck di server (untuk semua pengguna). Lalu import file atau snapshot .json.</p><button class="btn" data-dc="empty">Kosongkan data</button></div></div>';
  }
  function vHistory() {
    const st = App.state();
    return (st.imports || []).length ? '<table class="t"><thead><tr><th>Waktu</th><th>Jenis</th><th>File</th><th>Bulan</th><th>Info</th></tr></thead><tbody>' +
      st.imports.map(i => '<tr><td>' + esc_(new Date(i.at).toLocaleString('id-ID')) + '</td><td>' + esc_(KIND[i.kind] || i.kind) + '</td><td>' + esc_(i.file) + '</td><td>' +
        esc_((i.months || []).map(abbr_).join(', ')) + '</td><td><small>' + esc_(Object.keys(i.stats || {}).map(k => k + ': ' + i.stats[k]).join(' · ')) + '</small></td></tr>').join('') +
      '</tbody></table>' : '<div class="empty-note">Belum ada riwayat.</div>';
  }

  // ---------------------------------------------------------------- event

  function bind(body) {
    const drop = body.querySelector('#drop');
    if (drop) {
      drop.onclick = () => $('fileInput').click();
      ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', e => importFiles(e.dataTransfer.files));
    }
    const mm = body.querySelector('#mm');
    if (mm) mm.onchange = () => { manualMonth = mm.value; render(); };
    body.querySelectorAll('input[data-key]').forEach(inp => {
      inp.addEventListener('input', () => inp.classList.add('changed'));
      inp.addEventListener('keydown', e => e.stopPropagation());
      inp.addEventListener('blur', () => {
        if (inp.dataset.key !== 'collpct:0' && inp.value.trim()) inp.value = grp_(rawNum_(inp.value));
      });
    });
    body.querySelectorAll('[data-dc]').forEach(b => b.onclick = async () => {
      const a = b.dataset.dc;
      if (a === 'save-manual') saveManual(body);
      if (a === 'reset' && confirm('Hapus data di browser ini dan kembali ke data demo?')) { await App.resetDemo(); render(); }
      if (a === 'reset-texts' && confirm('Kembalikan semua teks ' + idMonth_(App.month()) + ' ke teks otomatis?')) { await App.resetTexts(); render(); }
      if (a === 'empty' && confirm('Kosongkan semua data? Anda perlu import file lagi.')) { await App.setState(newState_(), 'Data dikosongkan'); render(); }
    });
  }

  return { open, close, isOpen, render, importFiles };
})();
