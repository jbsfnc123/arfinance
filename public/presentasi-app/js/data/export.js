/* Export: snapshot JSON, workbook Excel lengkap, template input manual. */

const Exporter = (() => {
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

  function json(state) {
    download('AR-Deck-snapshot-' + stamp() + '.json', new Blob([JSON.stringify(state)], { type: 'application/json' }));
  }

  function writeBook(wb, name) {
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(name, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  function sheet(rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
    return ws;
  }

  /** Semua data: ringkasan metrik, seri + sumber, detail BP, tabel manual. */
  function xlsx(state, D) {
    const wb = XLSX.utils.book_new();
    const months = availableMonths_(D);
    const sum = [['Metrik'].concat(months.map(full_))];
    [['Sales', ym => sales_(D, ym)], ['Invoice count', ym => invCount_(D, ym)], ['Open AR', ym => openAmt_(D, ym)],
      ['Overdue', ym => overdue_(D, ym)], ['Rasio overdue', ym => odRatio_(D, ym)], ['AR Days TOP', ym => arDays_(D, ym)],
      ['Collection target', ym => collNums_(D, ym, 'all').t], ['Collection actual', ym => collNums_(D, ym, 'all').a],
      ['Collection %', ym => collPct_(D, ym)]]
      .forEach(([nm, fn]) => sum.push([nm].concat(months.map(ym => { const v = fn(ym); return v === null ? '' : v; }))));
    XLSX.utils.book_append_sheet(wb, sheet(sum, [22].concat(months.map(() => 16))), 'Ringkasan');

    const keys = Object.keys(D.map).sort();
    const ser = [['Key', 'Label'].concat(months)];
    const src = [['Key', 'Label'].concat(months)];
    keys.forEach(k => {
      ser.push([k, D.map[k].label].concat(months.map(ym => (D.map[k].vals[ym] === undefined ? '' : D.map[k].vals[ym]))));
      src.push([k, D.map[k].label].concat(months.map(ym => D.map[k].src[ym] || '')));
    });
    XLSX.utils.book_append_sheet(wb, sheet(ser, [16, 34]), 'Seri');
    XLSX.utils.book_append_sheet(wb, sheet(src, [16, 34]), 'Sumber angka');
    // Presentasi berdiri sendiri: tidak ada sheet data per BP.
    const tx = [];
    Object.keys(D.texts || {}).sort().forEach(ym => Object.keys(D.texts[ym]).forEach(k => tx.push([ym, k, D.texts[ym][k]])));
    if (tx.length) XLSX.utils.book_append_sheet(wb, sheet([['Bulan', 'Kunci', 'Teks']].concat(tx), [10, 40, 80]), 'Teks');
    MANUAL_TABLES.forEach(t => {
      const rows = D.manual[t] || [];
      if (!rows.length) return;
      const head = Object.keys(rows[0]).filter(h => h !== 'Bulan');
      XLSX.utils.book_append_sheet(wb, sheet([['Bulan'].concat(head)].concat(rows.map(r => [r.Bulan].concat(head.map(h => r[h]))))), t.slice(0, 31));
    });
    writeBook(wb, 'AR-Deck-data-' + stamp() + '.xlsx');
  }

  /** Template input manual: kunci manual x (3 bulan terakhir + bulan depan) + tabel manual bulan laporan. */
  function template(state, D, m) {
    const wb = XLSX.utils.book_new();
    const months = monthRange_(m, -2, 1);
    const rows = [['Key', 'Keterangan'].concat(months.map(full_))];
    manualKeyList_().forEach(([k, lbl]) => rows.push([k, lbl].concat(months.map(ym => {
      const v = g_(D, k, ym);
      return v === null ? '' : v;
    }))));
    const ws = sheet(rows, [14, 46, 18, 18, 18, 18]);
    XLSX.utils.book_append_sheet(wb, ws, 'Input Manual');
    MANUAL_TABLES.forEach(t => {
      const cur = (D.manual[t] || []).filter(r => r.Bulan === m);
      const any = (D.manual[t] || [])[0];
      if (!any) return;
      const cols = Object.keys(any).filter(h => h !== 'Bulan');
      const body = cur.length ? cur.map(r => [full_(m)].concat(cols.map(h => r[h]))) : [[full_(m)]];
      XLSX.utils.book_append_sheet(wb, sheet([['Bulan'].concat(cols)].concat(body)), t.slice(0, 31));
    });
    XLSX.utils.book_append_sheet(wb, sheet([
      ['Cara pakai'],
      ['1. Isi nilai dalam Rupiah penuh (bukan juta). Collection % diisi desimal, mis. 0,9654.'],
      ['2. Tabel manual: satu baris per data; kolom pertama = bulan (mis. "September 2026").'],
      ['3. Simpan, lalu seret file ini ke Data Center > Import. Baris bulan yang sama akan diganti.'],
    ], [100]), 'Petunjuk');
    writeBook(wb, 'Template-Input-Manual-' + m + '.xlsx');
  }

  return { json, xlsx, template };
})();

/** Daftar kunci input manual [key, label]. */
function manualKeyList_() {
  const out = [];
  MANUAL_KEYS.forEach(([base, n, lbl]) => {
    if (n) { for (let i = 0; i < n; i++) out.push([base + ':' + i, lbl + ' – ' + GROUPS[i]]); }
    else out.push([base, lbl || defaultLabel_(base) || base]);
  });
  return out.map(([k, l]) => [k, k === 'top5_tgt' ? 'TOP 5 – Collection Target' : k === 'top5_act' ? 'TOP 5 – Actual akhir bulan'
    : k === 'top5_w' ? 'TOP 5 – s/d minggu W' : k === 'wo5_tgt' ? 'w/o TOP 5 – Collection Target' : k === 'wo5_act' ? 'w/o TOP 5 – Actual akhir bulan'
      : k === 'wo5_w' ? 'w/o TOP 5 – s/d minggu W' : l]);
}
