/* Slide 7–12. */

function lateChip_(v) {
  if (v === '' || v === null || v === undefined || v === 'No Data') return '<span class="chip na">–</span>';
  const n = Number(v);
  const cls = n <= 3 ? 'ok' : n <= 14 ? 'mid' : 'hi';
  return '<span class="chip ' + cls + '">' + esc_(n) + '</span>';
}
/** Late days sel Watchlist: otomatis dari file payment bila ada, jika tidak pakai nilai manual. */
function lateCell_(D, pg, ym, manual) {
  const L = STANDALONE_ ? null : lateByName_(D, [pg], ym);
  if (L && L.n) return { v: Math.round(L.avg * 10) / 10, src: 'auto', title: 'Otomatis dari file payment ' + abbr_(ym) + ': ' + L.n + ' transaksi' };
  if (manual !== '' && manual !== null && manual !== undefined && manual !== 'No Data') {
    return { v: manual, src: STANDALONE_ ? 'tpl' : 'manual', title: 'Late days ' + abbr_(ym) + ' (template, tabel Uncollected)' };
  }
  return { v: null, src: 'na', title: 'Late days ' + abbr_(ym) + ' belum diisi di template' };
}
function lateChipC_(c) {
  if (c.v === null) return '<span class="chip na" title="' + esc_(c.title) + '">–</span>';
  const n = Number(c.v);
  const cls = n <= 3 ? 'ok' : n <= 14 ? 'mid' : 'hi';
  return '<span class="chip ' + cls + (c.src === 'manual' ? ' man' : '') + '" title="' + esc_(c.title) + '">' + esc_(num_(n, Number.isInteger(n) ? 0 : 1)) + '</span>';
}

function catBadge_(c) {
  const s = String(c || '');
  if (!s) return '';
  return '<span class="badge ' + (/^behav/i.test(s) ? 'behav' : /^admin/i.test(s) ? 'admin' : 'muted') + '">' + esc_(s) + '</span>';
}
function topAgingBars_(D, m, colFn, title) {
  if (STANDALONE_) return []; // tanpa data per BP
  const rows = (bp_(D).aging[m] || []).map(r => [r[BPA.name], colFn(r)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return rows.length ? [bars_(title, rows.map(x => [x[0], x[1], money_(x[1])]))] : [note_(NO_BP)];
}

// ================================================================ 7. Uncollected watchlist (slide 9–13 lama)

SLIDES.push({
  id: 'watch', title: 'Uncollected Watchlist', desc: 'Per segmen, late days, kategori',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const W0 = manualRows_(D, 'Uncollected', m);
    const all = W0.rows;
    const segs = [];
    all.forEach(r => { const s = String(r.Tabel || '').trim(); if (s && segs.indexOf(s) < 0) segs.push(s); });
    const seg = segs.indexOf(ctx.ui.seg) >= 0 ? ctx.ui.seg : segs[0];
    const rows = all.filter(r => String(r.Tabel).trim() === seg);
    const tot = s => sum_(all.filter(r => String(r.Tabel).trim() === s).map(r => Number(r['Unpaid This Month (Rp)'])));
    const maxU = Math.max.apply(null, rows.map(r => Number(r['Unpaid This Month (Rp)']) || 0).concat([1]));
    const mmYm = [0, -1, -2].map(k => addM_(W0.ym, k));
    const mm = mmYm.map(ym => MABBR[mIdx_(ym)]);
    const manualCols = ['Late Days Bulan Ini', 'Late Days Bulan -1', 'Late Days Bulan -2'];
    const cells = rows.map(r => mmYm.map((ym, i) => lateCell_(D, r['Payment Group'], ym, r[manualCols[i]])));
    const autoN = [].concat.apply([], cells).filter(c => c.src === 'auto').length;
    const monthTot = sum_(all.filter(r => !/^W\d/.test(String(r.Tabel))).map(r => Number(r['Unpaid This Month (Rp)'])));
    const behav = all.filter(r => /^behav/i.test(String(r.Category))).length;
    const head = monthTot ? 'Uncollected ' + money_(monthTot) + ' di ' + all.filter(r => !/^W\d/.test(String(r.Tabel))).length +
      ' payment group; ' + behav + ' karena perilaku bayar' : 'Uncollected watchlist';
    el.innerHTML = sHead_(ctx, 7, 'Uncollected Watchlist', head, stalePill_(W0)) +
      (segs.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' + segs.map(s =>
        '<button class="btn' + (s === seg ? ' primary' : '') + '" data-seg-btn="' + esc_(s) + '" style="height:32px">' + esc_(s) +
        ' <span style="opacity:.75;font-weight:500">' + money_(tot(s)) + '</span></button>').join('') + '</div>' : '') +
      '<div class="s-body" style="grid-template-columns: 1fr"><div class="card scroll" style="padding:6px 8px">' +
      (rows.length ? '<table class="t"><thead><tr><th style="width:34px">No</th><th>Payment Group</th><th class="r" style="width:150px">Unpaid</th><th class="r">TOP</th>' +
        '<th>Late days ' + mm.join(' / ') + '</th><th>Kategori</th><th>Keterangan</th></tr></thead><tbody>' +
        rows.map((r, i) => '<tr data-row="' + i + '" class="' + (/^behav/i.test(String(r.Category)) ? '' : '') + '"><td>' + esc_(r.No) + '</td><td><b>' + esc_(r['Payment Group']) + '</b></td>' +
          '<td class="r num bar-in"><i style="width:' + ((Number(r['Unpaid This Month (Rp)']) || 0) / maxU * 100).toFixed(0) + '%"></i><span>' +
          money_(Number(r['Unpaid This Month (Rp)'])) + '</span></td><td class="r">' + esc_(r['T.O.P']) + '</td>' +
          '<td><div class="chips">' + cells[i].map(lateChipC_).join('') + '</div></td>' +
          '<td>' + catBadge_(r.Category) + '</td><td><div class="clip" title="' + esc_(r.Keterangan) + '">' + esc_(r.Keterangan) + '</div></td></tr>').join('') +
        '</tbody><tfoot><tr><td></td><td>Total ' + esc_(seg) + '</td><td class="r num">' + money_(tot(seg)) + '</td><td colspan="4"></td></tr></tfoot></table>'
        : '<div class="empty-note">Belum ada data Uncollected untuk ' + esc_(idMonth_(m)) + '. Isi lewat template manual di Data Center.</div>') +
      '</div></div>' + sFoot_(ctx, 'Late days dari template (sheet Uncollected Watchlist). Hijau ≤ 3 hari, kuning ≤ 14, merah > 14.' + (autoN ? '' : ''));
    on_(el, '[data-seg-btn]', b => ctx.set('seg', b.dataset.segBtn));
    on_(el, 'tr[data-row]', tr => {
      const r = rows[Number(tr.dataset.row)];
      ctx.drill({ key: 'watch|' + seg + '|' + tr.dataset.row, eyebrow: 'Uncollected · ' + seg, title: r['Payment Group'],
        hero: money_(Number(r['Unpaid This Month (Rp)'])), sub: r.Keterangan,
        sections: [kv_('Late days', [['T.O.P', r['T.O.P'] + ' hari']].concat(mmYm.map((ym, i) => {
          const c = cells[Number(tr.dataset.row)][i];
          return ['Late days ' + abbr_(ym), c.v === null ? '-' : num_(Number(c.v), 1) + ' hari'];
        })).concat([['Kategori', r.Category || '-']]))]
          .concat(profile_(D, [r['Payment Group']], m)) });
    });
    return { notes: [head + '.'] };
  },
});

// ================================================================ 8. Aging & overdue (slide 15–16 lama)

SLIDES.push({
  id: 'aging', title: 'Aging & Overdue', desc: 'Bucket umur, rasio, target bulan depan',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const t = Charts.theme();
    const open = openAmt_(D, m);
    const od = overdue_(D, m);
    const r = odRatio_(D, m);
    const rp = odRatio_(D, addM_(m, -1));
    const d120 = g_(D, 'due120', m);
    const tgt = sumN_([0, 1, 2, 3, 4].map(i => g_(D, 'tgt_next:' + i, m)));
    const months5 = monthRange_(m, -4, 0);
    const months13 = monthRange_(m, -12, 0);
    const names = ['Due 1-15', 'Due 16-30', 'Due 31-60', 'Due 61-90', 'Due >90', 'Bad Debt'];
    el.innerHTML = sHead_(ctx, 8, 'Aging & Overdue', headline_(D, m, 'aging')) +
      '<div class="s-body" style="grid-template-rows: 128px 1fr; grid-template-columns: repeat(4, 1fr)">' +
      kpiCard_({ id: 'open', label: 'Open amount', value: money_(open), deltaHtml: delta_(growth_(open, openAmt_(D, addM_(m, -1))), '', 'down', 'MoM') }) +
      kpiCard_({ id: 'od', label: 'Overdue · rasio', value: money_(od) + ' · ' + pc_(r), deltaHtml: delta_(r !== null && rp !== null ? r - rp : null, 'pp', 'down', 'vs ' + abbr_(addM_(m, -1))) }) +
      kpiCard_({ id: 'd120', label: 'Invoice due > 120 hari', value: money_(d120), sub: open ? pc_(d120 / open, 2) + ' dari open' : '' }) +
      kpiCard_({ id: 'tgt', label: 'Target collection ' + abbr_(addM_(m, 1)), value: money_(tgt),
        sub: open && tgt ? 'Not due setelahnya ' + money_(open - tgt - (d120 || 0)) : 'Belum diinput (Data Center)' }) +
      '<div class="card chart-card" style="grid-column: span 2"><h3>Overdue per bucket (5 bulan)<span class="hint">klik untuk rincian</span></h3><div class="chart" id="c-age"></div></div>' +
      '<div class="card chart-card" style="grid-column: span 2"><h3>Rasio overdue / open amount (13 bulan)</h3><div class="chart" id="c-ratio"></div></div>' +
      '</div>' + sFoot_(ctx, 'Bucket = hari lewat jatuh tempo per akhir bulan (template, sheet Aging & Overdue). Due >90 = total >90 − Bad Debt.');

    Charts.make(el.querySelector('#c-age'), Charts.base({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => money_(v) },
      grid: { left: 8, right: 8, top: 34, bottom: 8, containLabel: true },
      xAxis: Charts.catAxis(months5.map(cat_)), yAxis: Charts.valAxis(),
      series: names.map((nm, i) => ({ name: nm, type: 'bar', stack: 'a', barWidth: '48%', data: months5.map(ym => agingVal_(D, i, ym)),
        itemStyle: { color: Charts.C.AGING[i], borderRadius: i === 5 ? [5, 5, 0, 0] : 0 },
        label: { show: i === 0, color: '#14532d', fontWeight: 700, formatter: p => (p.value ? dec_(p.value / 1e9, 1) : '') } })),
    }), p => ctx.drill({ key: 'age|' + p.seriesIndex + '|' + p.dataIndex, eyebrow: 'Aging', title: names[p.seriesIndex] + ' · ' + idMonth_(months5[p.dataIndex]),
      hero: money_(p.value), sections: drillAgingBucket_(D, p.seriesIndex, months5[p.dataIndex]) }));

    const rr = months13.map(ym => odRatio_(D, ym));
    Charts.make(el.querySelector('#c-ratio'), Charts.base({
      legend: { show: false }, tooltip: { trigger: 'axis', valueFormatter: v => pc_(v, 2) },
      grid: { left: 8, right: 20, top: 30, bottom: 8, containLabel: true },
      xAxis: Charts.catAxis(months13.map(short_), { boundaryGap: false, axisLabel: { color: t.text3, fontSize: 11 } }),
      yAxis: Charts.valAxis(v => pc_(v, 0), { scale: true }),
      series: [{ type: 'line', data: rr, smooth: true, symbolSize: 7, color: Charts.C.CBD, lineStyle: { width: 3 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: Charts.C.CBD + '44' }, { offset: 1, color: Charts.C.CBD + '00' }]) },
        label: { show: true, position: 'top', color: t.text2, fontSize: 11, fontWeight: 600, formatter: p => pc_(p.value) },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: t.text3, type: 'dashed' }, label: { color: t.text3, formatter: 'rata-rata', position: 'insideStartTop' },
          data: [{ type: 'average' }] } }],
    }), p => ctx.drill({ key: 'ratio|' + p.dataIndex, eyebrow: 'Overdue', title: idMonth_(months13[p.dataIndex]), hero: pc_(p.value, 2),
      sections: drillOverdueMonth_(D, months13[p.dataIndex]) }));

    on_(el, '[data-kpi]', n => {
      const id = n.dataset.kpi;
      const secs = id === 'open' || id === 'od' || id === 'd120' ? drillOverdueMonth_(D, m)
            : [tb_('Target ' + abbr_(addM_(m, 1)) + ' per group', [{ h: 'Group' }, { h: 'Target', align: 'right' }, { h: 'Bad debt', align: 'right' }],
              GROUPS.map((g, i) => [g, money_(g_(D, 'tgt_next:' + i, m)), money_(g_(D, 'baddebt:' + i, m))]),
              ['Total', money_(tgt), money_(sum_([0, 1, 2, 3, 4].map(i => g_(D, 'baddebt:' + i, m))))])];
      ctx.drill({ key: 'aging-kpi|' + id, eyebrow: 'Aging & Overdue', title: n.querySelector('.label').textContent, hero: n.querySelector('.value').textContent, sections: secs });
    });
    return { notes: [headline_(D, m, 'aging') + '.', 'Invoice > 120 hari ' + money_(d120) + '.'] };
  },
});

// ================================================================ 9. AR summary (slide 17 lama)

SLIDES.push({
  id: 'ar', title: 'AR Summary', desc: 'Roll-forward, AR Days, Collection %',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const t = Charts.theme();
    const rf = rollForward_(D, m);
    const months6 = monthRange_(m, -5, 0);
    const months12 = monthRange_(m, -11, 0);
    const payAmt = g_(D, 'pay_amt', m);
    el.innerHTML = sHead_(ctx, 9, 'AR Summary', headline_(D, m, 'ar'),
      payAmt === null ? '' : '<span class="pill" title="Total pembayaran di file Invoice Payment Date">Pembayaran diterima ' + money_(payAmt) + '</span>') +
      '<div class="s-body" style="grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr">' +
      '<div class="card chart-card"><h3>Roll-forward ' + esc_(abbr_(m)) + '<span class="hint">klik untuk rincian</span></h3><div class="chart" id="c-wf"></div></div>' +
      '<div class="card chart-card"><h3>AR Days TOP (12 bulan)</h3><div class="chart" id="c-ard"></div></div>' +
      '<div class="card scroll" style="padding:8px 10px"><table class="t"><thead><tr><th>Bulan</th><th class="r">Awal</th><th class="r">+ Invoice</th>' +
      '<th class="r">− Collection</th><th class="r">Akhir</th></tr></thead><tbody>' +
      months6.map(ym => { const r = rollForward_(D, ym); return '<tr data-ym="' + ym + '" class="' + (ym === m ? 'sel' : '') + '"><td><b>' + esc_(idMonth_(ym)) + '</b></td>' +
        [r.beg, r.inv, r.col, r.end].map(v => '<td class="r num">' + money_(v) + '</td>').join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="card chart-card"><h3>Collection % (12 bulan)</h3><div class="chart" id="c-cp"></div></div>' +
      '</div>' + sFoot_(ctx, 'Awal = Akhir bulan lalu; Invoice = Sales; Akhir = Open amount; Collection = Awal + Invoice − Akhir. AR Days = Open ÷ rata-rata TOP 3 bulan × 30.');

    const vals = [rf.beg, rf.inv, rf.col, rf.end];
    const base = [0, rf.beg, rf.end, 0];
    Charts.make(el.querySelector('#c-wf'), Charts.base({
      legend: { show: false }, tooltip: { trigger: 'item', formatter: p => (p.seriesIndex ? esc_(p.name) + '<br><b>' + money_(vals[p.dataIndex]) + '</b>' : '') },
      grid: { left: 8, right: 8, top: 30, bottom: 8, containLabel: true },
      xAxis: Charts.catAxis(['A/R awal', '+ Invoice', '− Collection', 'A/R akhir']), yAxis: Charts.valAxis(),
      series: [
        { type: 'bar', stack: 'w', data: base, itemStyle: { color: 'transparent' }, silent: true, barWidth: '50%' },
        { type: 'bar', stack: 'w', data: vals.map((v, i) => ({ value: v, itemStyle: { color: [Charts.C.LY, Charts.C.CY, Charts.C.GOOD, '#1E3A8A'][i], borderRadius: 6 } })),
          label: { show: true, position: 'top', color: t.text, fontWeight: 700, formatter: p => money_(p.value) } },
      ],
    }), () => ctx.drill({ key: 'wf|' + m, eyebrow: 'AR Summary', title: 'Roll-forward ' + idMonth_(m), hero: money_(rf.end), sections: drillRoll_(D, m) }));

    const ard = months12.map(ym => arDays_(D, ym));
    Charts.make(el.querySelector('#c-ard'), Charts.base({
      legend: { show: false }, tooltip: { trigger: 'axis', valueFormatter: v => days_(v) },
      grid: { left: 8, right: 20, top: 26, bottom: 8, containLabel: true },
      xAxis: Charts.catAxis(months12.map(short_), { boundaryGap: false, axisLabel: { color: t.text3, fontSize: 10 } }),
      yAxis: Charts.valAxis(v => v, { scale: true }),
      series: [{ type: 'line', data: ard, smooth: true, symbolSize: 7, color: Charts.C.CY, lineStyle: { width: 3 },
        label: { show: true, position: 'top', color: t.text2, fontSize: 11, fontWeight: 600, formatter: p => num_(p.value, 0) } }],
    }), p => ctx.drill({ key: 'ard|' + p.dataIndex, eyebrow: 'AR Days TOP', title: idMonth_(months12[p.dataIndex]), hero: days_(p.value),
      sections: drillArDays_(D, months12[p.dataIndex]) }));

    const cp = months12.map(ym => g_(D, 'collpct:0', ym));
    Charts.make(el.querySelector('#c-cp'), Charts.base({
      legend: { show: false }, tooltip: { trigger: 'axis', valueFormatter: v => pc_(v, 2) },
      grid: { left: 8, right: 26, top: 26, bottom: 8, containLabel: true },
      xAxis: Charts.catAxis(months12.map(short_), { boundaryGap: false, axisLabel: { color: t.text3, fontSize: 10 } }),
      yAxis: Charts.valAxis(v => pc_(v, 0), { scale: true }),
      series: [{ type: 'line', data: cp, smooth: true, symbolSize: 7, color: Charts.C.LINE2, lineStyle: { width: 3 }, connectNulls: true,
        label: { show: true, position: 'top', color: t.text2, fontSize: 11, fontWeight: 600, formatter: p => pc_(p.value, 1) } }],
    }), p => ctx.drill({ key: 'cp|' + p.dataIndex, eyebrow: 'Collection %', title: idMonth_(months12[p.dataIndex]), hero: pc_(p.value, 2),
      sections: drillRoll_(D, months12[p.dataIndex]) }));
    on_(el, 'tr[data-ym]', tr => ctx.drill({ key: 'rf|' + tr.dataset.ym, eyebrow: 'AR Summary', title: 'Roll-forward ' + idMonth_(tr.dataset.ym),
      hero: money_(rollForward_(D, tr.dataset.ym).end), sections: drillRoll_(D, tr.dataset.ym) }));
    return { notes: [headline_(D, m, 'ar') + '.', 'AR Days TOP ' + days_(arDays_(D, m)) + '.'] };
  },
});

// ================================================================ 10. Risk (slide 21–26 lama)

SLIDES.push({
  id: 'risk', title: 'Risiko Piutang', desc: 'Due >90, Bad Debt, Unallocated',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const tab = ctx.ui.risk || 'due90';
    const pickO = t => manualRows_(D, t, m);
    const pick = t => pickO(t).rows;
    const n = v => Number(v) || 0;
    const tbl = (cols, rows, foot, id) => '<table class="t"><thead><tr>' + cols.map(c => '<th' + (c.r ? ' class="r"' : '') + '>' + esc_(c.h) + '</th>').join('') +
      '</tr></thead><tbody>' + rows.map((r, i) => '<tr data-' + id + '="' + i + '">' + r.map((v, j) => '<td' + (cols[j].r ? ' class="r num"' : '') + '>' +
        (cols[j].html ? v : esc_(v)) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
      (foot ? '<tfoot><tr>' + foot.map((v, j) => '<td' + (cols[j].r ? ' class="r num"' : '') + '>' + esc_(v) + '</td>').join('') + '</tr></tfoot>' : '') + '</table>';
    let body = '';
    let head = 'Risiko piutang';
    const o90 = g_(D, 'over90', m);
    const bd = g_(D, 'aging:5', m);
    if (tab === 'due90') {
      const sum = pick('Due90 Summary');
      const cic = pick('Due90 Cicil');
      const tIn = sum_(sum.filter(r => r.Jenis === 'Internal').map(r => n(r['Nominal (Rp)'])));
      const tEx = sum_(sum.filter(r => r.Jenis === 'Eksternal').map(r => n(r['Nominal (Rp)'])));
      head = 'Piutang > 90 hari ' + money_(o90) + '; ' + cic.length + ' BP masih mencicil';
      body = '<div class="s-body" style="grid-template-columns: 300px 1fr">' +
        '<div style="display:grid;gap:14px;grid-template-rows:auto auto 1fr">' +
        kpiCard_({ id: 'o90', label: 'Total > 90 hari (Aging)', value: money_(o90), sub: 'Bad debt tercatat ' + money_(bd) }) +
        kpiCard_({ id: 'sum', label: 'Masih cicil: Internal / Eksternal', value: money_(tIn + tEx), sub: money_(tIn) + ' / ' + money_(tEx) }) +
        '</div>' +
        '<div class="card scroll" style="padding:6px 8px">' + (cic.length ? tbl([{ h: 'Business Partner' }, { h: 'Group' }, { h: 'Region' },
          { h: 'Bulan lalu', r: 1 }, { h: 'Bayar', r: 1 }, { h: 'Sisa', r: 1 }, { h: 'Keterangan', html: 1 }],
        cic.map(r => [r['Business Partner'], r['Marketing Group'], r.Region, money_(n(r['Amount Bulan Lalu (Rp)'])), money_(n(r['Payment (Rp)'])),
          money_(n(r['Amount Bulan Ini (Rp)'])), '<div class="clip" style="max-width:300px" title="' + esc_(r.Keterangan) + '">' + esc_(r.Keterangan) + '</div>']),
        ['Total', '', '', money_(sum_(cic.map(r => n(r['Amount Bulan Lalu (Rp)'])))), money_(sum_(cic.map(r => n(r['Payment (Rp)'])))),
          money_(sum_(cic.map(r => n(r['Amount Bulan Ini (Rp)'])))), ''], 'cic') : '<div class="empty-note">Belum ada data Due90 Cicil bulan ini.</div>') + '</div></div>';
    } else if (tab === 'bad') {
      const s = pick('Bad Debt Summary');
      const d = pick('Bad Debt Detail');
      head = 'Bad debt ' + money_(sum_(d.map(r => n(r['Amount (Rp)'])))) + ' dari ' + d.length + ' BP';
      body = '<div class="s-body" style="grid-template-columns: 380px 1fr">' +
        '<div class="card scroll" style="padding:6px 8px">' + (s.length ? tbl([{ h: 'Ringkasan' }, { h: 'Nominal', r: 1 }],
          s.map(r => [r.Keterangan + (r.Catatan ? ' · ' + r.Catatan : ''), money_(n(r['Nominal (Rp)']))]), ['Total', money_(sum_(s.map(r => n(r['Nominal (Rp)']))))], 'bs')
          : '<div class="empty-note">Belum ada ringkasan.</div>') + '</div>' +
        '<div class="card scroll" style="padding:6px 8px">' + (d.length ? tbl([{ h: 'Business Partner' }, { h: 'Group' }, { h: 'Region' }, { h: 'Amount', r: 1 },
          { h: 'Informasi', html: 1 }], d.map(r => [r['Business Partner'], r['Marketing Group'], r.Region, money_(n(r['Amount (Rp)'])),
          '<div class="clip" style="max-width:280px" title="' + esc_(r.Information) + '">' + esc_(r.Information) + '</div>']),
        ['Total', '', '', money_(sum_(d.map(r => n(r['Amount (Rp)'])))), ''], 'bd') : '<div class="empty-note">Belum ada detail bad debt.</div>') + '</div></div>';
    } else {
      const u = pick('Unallocated');
      const part = kind => {
        const rows = u.filter(r => r.Jenis === kind);
        return '<div class="card scroll" style="padding:6px 8px"><h3 style="padding:6px 4px">To be ' + esc_(kind) + '</h3>' + (rows.length ? tbl([{ h: 'Keterangan' }, { h: 'Group' }, { h: 'Total', r: 1 }],
          rows.map(r => [r.Keterangan || '', r['Marketing Group'], money_(n(r['Total (Rp)']))]), ['Total', '', money_(sum_(rows.map(r => n(r['Total (Rp)']))))], 'un-' + kind)
          : '<div class="empty-note">Tidak ada data.</div>') + '</div>';
      };
      head = 'Unallocated payment ' + money_(sum_(u.map(r => n(r['Total (Rp)'])))) + ' (cut off ' + abbr_(addM_(m, -2)) + ')';
      body = '<div class="s-body" style="grid-template-columns: 1fr 1fr">' + part('Write-Off') + part('Confirmed') + '</div>';
    }
    const staleT = { due90: 'Due90 Cicil', bad: 'Bad Debt Detail', unalloc: 'Unallocated' }[tab];
    el.innerHTML = sHead_(ctx, 10, 'Risiko Piutang', head, (staleT ? stalePill_(pickO(staleT)) : '') +
      seg_('risk', [['due90', 'Due > 90'], ['bad', 'Bad Debt'], ['unalloc', 'Unallocated']], tab)) + body +
      sFoot_(ctx, 'Sumber: template (sheet Risiko Piutang & Aging & Overdue).');
    on_(el, '[data-kpi]', () => ctx.drill({ key: 'risk-kpi', eyebrow: 'Risiko', title: 'Piutang > 90 hari', hero: money_(o90),
      sections: drillAgingBucket_(D, 4, m) }));
    bindSeg_(el, ctx);
    return { notes: [head + '.'] };
  },
});

// ================================================================ 12. Penutup

SLIDES.push({
  id: 'close', title: 'Penutup', desc: 'Kesimpulan & tindak lanjut',
  render(ctx, el) {
    const ex = execSummary_(ctx.D, ctx.m);
    el.classList.add('cover');
    el.innerHTML = '<div class="cover-inner"><img class="logo-w" src="assets/logo.png" alt="">' +
      '<div class="kicker" style="margin-top:36px">Kesimpulan · ' + esc_(idMonth_(ctx.m)) + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:22px">' +
      '<div><h2 style="margin:0 0 12px;font-size:22px">Yang berjalan baik</h2><ul class="list">' +
      ex.highlights.map(t => '<li><span class="ic good">✓</span><span style="color:#E2E8F0">' + esc_(t) + '</span></li>').join('') + '</ul></div>' +
      '<div><h2 style="margin:0 0 12px;font-size:22px">Tindak lanjut</h2><ul class="list">' +
      ex.watchouts.map(t => '<li><span class="ic bad">!</span><span style="color:#E2E8F0">' + esc_(t) + '</span></li>').join('') + '</ul></div></div>' +
      '<h1 style="margin-top:auto;font-size:72px">Terima kasih</h1><div class="period" style="font-size:20px">Tanya-jawab</div></div>';
    return { notes: ['Tutup dengan tindak lanjut dan buka sesi tanya-jawab.'] };
  },
});
