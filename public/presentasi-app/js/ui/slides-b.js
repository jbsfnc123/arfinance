/* Slide 7–12. */

function lateChip_(v) {
  if (v === '' || v === null || v === undefined || v === 'No Data') return '<span class="chip na">–</span>';
  const n = Number(v);
  const cls = n <= 3 ? 'ok' : n <= 14 ? 'mid' : 'hi';
  return '<span class="chip ' + cls + '">' + esc_(n) + '</span>';
}
/** Late days sel Watchlist: otomatis dari file payment bila ada, jika tidak pakai nilai manual. */
function lateCell_(D, pg, ym, manual) {
  const L = lateByName_(D, [pg], ym);
  if (L && L.n) return { v: Math.round(L.avg * 10) / 10, src: 'auto', title: 'Otomatis dari file payment ' + abbr_(ym) + ': ' + L.n + ' transaksi' };
  if (manual !== '' && manual !== null && manual !== undefined && manual !== 'No Data') {
    return { v: manual, src: 'manual', title: 'Nilai manual (tabel Uncollected)' + (L ? '; tidak ada transaksi di file payment' : '; file payment ' + abbr_(ym) + ' belum diimpor') };
  }
  return { v: null, src: L ? 'none' : 'na', title: L ? 'Tidak ada pembayaran di ' + abbr_(ym) : 'File payment ' + abbr_(ym) + ' belum diimpor' };
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
      '</div></div>' + sFoot_(ctx, 'Late days = Payment Date − Due Date (rata-rata per bulan pembayaran; ' + autoN + ' sel otomatis dari file payment, sel bergaris = manual). ' +
        'Hijau ≤ 3 hari, kuning ≤ 14, merah > 14.');
    on_(el, '[data-seg-btn]', b => ctx.set('seg', b.dataset.segBtn));
    on_(el, 'tr[data-row]', tr => {
      const r = rows[Number(tr.dataset.row)];
      ctx.drill({ key: 'watch|' + seg + '|' + tr.dataset.row, eyebrow: 'Uncollected · ' + seg, title: r['Payment Group'],
        hero: money_(Number(r['Unpaid This Month (Rp)'])), sub: r.Keterangan,
        sections: [kv_('Late days (otomatis / manual)', [['T.O.P', r['T.O.P'] + ' hari']].concat(mmYm.map((ym, i) => {
          const c = cells[Number(tr.dataset.row)][i];
          return ['Late days ' + abbr_(ym), c.v === null ? '-' : num_(Number(c.v), 1) + ' hari · ' + (c.src === 'auto' ? 'otomatis' : 'manual')];
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
      '<div class="card chart-card" style="grid-column: span 2"><h3>Overdue per bucket (5 bulan)<span class="hint">klik untuk Top 10 BP</span></h3><div class="chart" id="c-age"></div></div>' +
      '<div class="card chart-card" style="grid-column: span 2"><h3>Rasio overdue / open amount (13 bulan)</h3><div class="chart" id="c-ratio"></div></div>' +
      '</div>' + sFoot_(ctx, 'Bucket = hari lewat jatuh tempo per akhir bulan (file Aging). Due >90 = total >90 − Bad Debt manual.');

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
      const secs = id === 'open' ? topAgingBars_(D, m, r0 => Number(r0[BPA.open]), 'Top 10 BP open amount')
        : id === 'od' ? drillOverdueMonth_(D, m).concat(topAgingBars_(D, m, BPA_OD_, 'Top 10 BP overdue'))
          : id === 'd120' ? topAgingBars_(D, m, r0 => Number(r0[BPA.d120]), 'Top 10 BP > 120 hari')
            : [tb_('Target ' + abbr_(addM_(m, 1)) + ' per group', [{ h: 'Group' }, { h: 'Target', align: 'right' }, { h: 'Bad debt', align: 'right' }],
              GROUPS.map((g, i) => [g, money_(g_(D, 'tgt_next:' + i, m)), money_(g_(D, 'baddebt:' + i, m))]),
              ['Total', money_(tgt), money_(sum_([0, 1, 2, 3, 4].map(i => g_(D, 'baddebt:' + i, m))))])];
      ctx.drill({ key: 'aging-kpi|' + id, eyebrow: 'Aging & Overdue', title: n.querySelector('.label').textContent, hero: n.querySelector('.value').textContent, sections: secs });
    });
    return { notes: [headline_(D, m, 'aging') + '.', 'Invoice > 120 hari ' + money_(d120) + '.'] };
  },
});

// ================================================================ Kinerja PIC AR (baru, dari master Business Partner)

SLIDES.push({
  id: 'pic', title: 'Kinerja PIC AR', desc: 'Open, overdue & late days per PIC',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const t = Charts.theme();
    const pp = picPerf_(D, m);
    if (!pp) {
      el.innerHTML = sHead_(ctx, 9, 'Kinerja PIC AR', 'Kinerja penagihan per PIC AR') +
        '<div class="empty-note" style="margin:auto">' + esc_(NO_BP) + '</div>' + sFoot_(ctx, '');
      return { notes: [] };
    }
    const list = pp.list.slice(0, 9);
    const tot = sum_(pp.list.map(a => a.open));
    const rev = list.slice().reverse();
    el.innerHTML = sHead_(ctx, 9, 'Kinerja PIC AR', headline_(D, m, 'pic'), pp.hasMaster ? '' : '<span class="pill">PIC dari file Aging</span>') +
      '<div class="s-body" style="grid-template-columns: 1.15fr 1fr">' +
      '<div class="card chart-card"><h3>Open AR per PIC — belum jatuh tempo vs overdue<span class="hint">klik untuk Top BP</span></h3><div class="chart" id="c-pic"></div></div>' +
      '<div class="card scroll" style="padding:6px 8px"><table class="t"><thead><tr><th>PIC AR</th><th class="r">BP</th><th class="r">Open</th>' +
      '<th class="r">% Overdue</th><th class="r">&gt; 90 hari</th><th class="r">Late days</th></tr></thead><tbody>' +
      list.map((a, i) => '<tr data-pic="' + i + '"><td><b>' + esc_(a.pic) + '</b><div style="font-size:11px;color:var(--text-3)">' +
        pc_(a.open / tot, 1) + ' dari total open</div></td><td class="r num">' + grp_(a.bp, '.') + '</td><td class="r num">' + money_(a.open) +
        '</td><td class="r num"><span class="chip ' + (a.odPct > 0.2 ? 'hi' : a.odPct > 0.1 ? 'mid' : 'ok') + '">' + pc_(a.odPct, 1) + '</span></td>' +
        '<td class="r num">' + money_(a.o90) + '</td><td class="r num">' + (a.late && a.late.n ? days_(a.late.avg) : '–') + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="r num">' + grp_(sum_(pp.list.map(a => a.bp)), '.') + '</td><td class="r num">' + money_(tot) +
      '</td><td class="r num">' + pc_(sum_(pp.list.map(a => a.od)) / tot, 1) + '</td><td class="r num">' + money_(sum_(pp.list.map(a => a.o90))) +
      '</td><td class="r num">' + days_(g_(D, 'late_all', m)) + '</td></tr></tfoot></table></div>' +
      '</div>' + sFoot_(ctx, 'PIC AR dari master Business Partner (fallback: Collection Name di file Aging). Late days = pembayaran ' + abbr_(m) +
        (pp.hasPay ? '' : ' (file payment belum diimpor)') + '.');
    Charts.make(el.querySelector('#c-pic'), Charts.base({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => money_(v) },
      grid: { left: 8, right: 60, top: 34, bottom: 8, containLabel: true },
      yAxis: Charts.catAxis(rev.map(a => a.pic), { axisLabel: { color: t.text2, fontWeight: 600 } }),
      xAxis: Charts.valAxis(),
      series: [
        { name: 'Belum jatuh tempo', type: 'bar', stack: 'p', barWidth: '58%', data: rev.map(a => a.notdue), itemStyle: { color: t.dark ? '#33445f' : '#CBD5E1' } },
        { name: 'Overdue ≤ 30', type: 'bar', stack: 'p', data: rev.map(a => a.b[0] + a.b[1]), itemStyle: { color: Charts.C.AGING[2] } },
        { name: 'Overdue 31–90', type: 'bar', stack: 'p', data: rev.map(a => a.b[2] + a.b[3]), itemStyle: { color: Charts.C.AGING[3] } },
        { name: '> 90 hari', type: 'bar', stack: 'p', data: rev.map(a => a.b[4]), itemStyle: { color: Charts.C.AGING[4], borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: t.text2, fontWeight: 700, formatter: q => pc_(rev[q.dataIndex].odPct, 0) } },
      ],
    }), q => {
      const a = rev[q.dataIndex];
      ctx.drill({ key: 'pic|' + a.pic, eyebrow: 'Kinerja PIC AR', title: a.pic, hero: money_(a.open), sections: drillPic_(D, m, a) });
    });
    on_(el, 'tr[data-pic]', tr => {
      const a = list[Number(tr.dataset.pic)];
      ctx.drill({ key: 'pic|' + a.pic, eyebrow: 'Kinerja PIC AR', title: a.pic, hero: money_(a.open), sections: drillPic_(D, m, a) });
    });
    return { notes: [headline_(D, m, 'pic') + '.'] };
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
        '<div class="card"><h3>Top 5 BP > 90 hari</h3><div id="top90"></div></div></div>' +
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
    } else if (tab === 'dormant') {
      const dm = dormant_(D, m);
      if (!dm) {
        head = 'Pelanggan tidak aktif dengan piutang';
        body = '<div class="s-body"><div class="card"><div class="empty-note">Import file <b>Business Partner</b> (master) dan Aging bulan ini di Data Center.</div></div></div>';
      } else {
        head = dm.n + ' pelanggan tidak bertransaksi > 90 hari, piutang ' + money_(dm.open);
        const L = dm.list.slice(0, 60);
        body = '<div class="s-body" style="grid-template-columns: 300px 1fr">' +
          '<div style="display:grid;gap:14px;grid-template-rows:auto auto 1fr">' +
          kpiCard_({ id: 'dm', label: 'Piutang pelanggan tidak aktif', value: money_(dm.open), sub: dm.n + ' BP · ' + pc_(dm.open / (openAmt_(D, m) || 1), 1) + ' dari open AR' }) +
          kpiCard_({ id: 'dm90', label: 'Di antaranya > 90 hari', value: money_(dm.o90), sub: 'Tidak aktif = Last Sale > 90 hari sebelum ' + lastDay_(m) + ' ' + abbr_(m) }) +
          '<div class="card"><h3>Per PIC AR</h3><div id="dmPic"></div></div></div>' +
          '<div class="card scroll" style="padding:6px 8px">' + tbl([{ h: 'Business Partner' }, { h: 'PIC AR' }, { h: 'Transaksi terakhir' },
            { h: 'Tidak aktif', r: 1 }, { h: 'Open', r: 1 }, { h: '> 90 hari', r: 1 }],
          L.map(x => [x.r[BPA.name], x.ms[BPM.pic] || x.r[BPA.coll] || '-', x.ms[BPM.last], grp_(x.days, '.') + ' hari', money_(x.open), money_(x.o90)]), null, 'dm') + '</div></div>';
      }
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
      seg_('risk', [['due90', 'Due > 90'], ['bad', 'Bad Debt'], ['unalloc', 'Unallocated'], ['dormant', 'Tidak aktif']], tab)) + body +
      sFoot_(ctx, tab === 'dormant' ? 'Sumber: master Business Partner (Last Sale, PIC AR) + file Aging.' : 'Sumber: tabel manual (Due90, Bad Debt, Unallocated) + file Aging untuk profil BP.');
    const dmPic = el.querySelector('#dmPic');
    if (dmPic) {
      const dm = dormant_(D, m);
      const byPic = {};
      dm.list.forEach(x => { const p = x.ms[BPM.pic] || x.r[BPA.coll] || '-'; byPic[p] = (byPic[p] || 0) + x.open; });
      dmPic.innerHTML = Drawer.sections([bars_('', Object.keys(byPic).map(k => [k, byPic[k], money_(byPic[k])]).sort((a, b) => b[1] - a[1]).slice(0, 6))]);
    }
    const top = el.querySelector('#top90');
    if (top) top.innerHTML = Drawer.sections(topAgingBars_(D, m, r => Number(r[BPA.b5]), '').map(s => Object.assign(s, { title: '' })).map(s => {
      if (s.t === 'bars') s.rows = s.rows.slice(0, 5);
      return s;
    }));
    const prof = (names, title, hero, sub) => ctx.drill({ key: 'risk|' + title, eyebrow: 'Risiko · profil', title: title, hero: hero, sub: sub,
      sections: profile_(D, names.filter(Boolean).map(String), m) });
    on_(el, 'tr[data-cic]', tr => { const r = pick('Due90 Cicil')[Number(tr.dataset.cic)]; prof([r['Business Partner'], r['Key BP'], r['Payment Group']], r['Business Partner'], money_(n(r['Amount Bulan Ini (Rp)'])), r.Keterangan); });
    on_(el, 'tr[data-dm]', tr => {
      const x = dormant_(D, m).list[Number(tr.dataset.dm)];
      prof([x.r[BPA.name], x.r[BPA.key]], x.r[BPA.name], money_(x.open), 'Transaksi terakhir ' + x.ms[BPM.last] + ' (' + grp_(x.days, '.') + ' hari)');
    });
    on_(el, 'tr[data-bd]', tr => { const r = pick('Bad Debt Detail')[Number(tr.dataset.bd)]; prof([r['Business Partner'], r['Key BP']], r['Business Partner'], money_(n(r['Amount (Rp)'])), r.Information); });
    on_(el, '[data-kpi]', () => ctx.drill({ key: 'risk-kpi', eyebrow: 'Risiko', title: 'Top 10 BP > 90 hari', hero: money_(o90),
      sections: topAgingBars_(D, m, r => Number(r[BPA.b5]), 'Top 10 BP > 90 hari') }));
    bindSeg_(el, ctx);
    return { notes: [head + '.'] };
  },
});

// ================================================================ 11. BP Explorer (baru)

SLIDES.push({
  id: 'explorer', title: 'BP Explorer', desc: 'Cari BP / Payment Group saat tanya-jawab',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const dir = bpDirectory_(D, m);
    el.innerHTML = sHead_(ctx, 11, 'BP Explorer', 'Cari Payment Group atau BP untuk profil lengkap') +
      '<div class="s-body" style="grid-template-columns: 380px 1fr">' +
      '<div class="card" style="display:flex;flex-direction:column;gap:10px"><input class="search" id="q" placeholder="Ketik nama BP / Payment Group / Key BP…" value="' + esc_(ctx.ui.q || '') + '">' +
      '<div class="scroll" id="elist" style="flex:1"></div></div>' +
      '<div class="card scroll" id="eprof" style="padding:18px 22px"></div></div>' +
      sFoot_(ctx, dir.length ? grp_(dir.length, '.') + ' entitas dari file Invoice (3 bulan) & Aging ' + abbr_(m) + '.' : NO_BP);
    const list = el.querySelector('#elist');
    const prof = el.querySelector('#eprof');
    const show = e => {
      ctx.ui.sel = e ? e.type + '|' + e.name : null;
      if (!e) { prof.innerHTML = '<div class="empty-note">' + esc_(dir.length ? 'Pilih entitas di kiri.' : NO_BP) + '</div>'; return; }
      prof.innerHTML = '<div class="eyebrow" style="font-size:11px;color:var(--text-3);font-weight:700;letter-spacing:.08em;text-transform:uppercase">' + esc_(e.type) +
        (e.key ? ' · ' + esc_(e.key) : '') + '</div><h2 style="margin:4px 0 0;font-size:24px">' + esc_(e.name) + '</h2>' +
        '<div style="display:flex;gap:10px;margin-top:10px"><span class="pill">Open ' + money_(e.open) + '</span><span class="pill">Overdue ' + money_(e.od) +
        '</span><span class="pill">Sales 3 bln ' + money_(e.sales) + '</span></div>' +
        '<div style="columns:2;column-gap:26px">' + Drawer.sections(profile_(D, [e.name, e.key].filter(Boolean), m)) + '</div>';
      list.querySelectorAll('.ent').forEach(n => n.classList.toggle('on', n.dataset.k === ctx.ui.sel));
    };
    const draw = () => {
      const q = nm_(ctx.ui.q || '');
      const hits = (q ? dir.filter(e => nm_(e.name).indexOf(q) >= 0 || String(e.key || '').indexOf(ctx.ui.q) >= 0) : dir).slice(0, 60);
      list.innerHTML = hits.map(e => '<div class="ent" data-k="' + esc_(e.type + '|' + e.name) + '"><div style="min-width:0"><div class="nm">' + esc_(e.name) +
        '</div><div class="ty">' + esc_(e.type) + '</div></div><div class="val">' + money_(e.open) + '<br><span style="color:var(--text-3)">sales ' + money_(e.sales) +
        '</span></div></div>').join('') || '<div class="empty-note">Tidak ditemukan.</div>';
      on_(list, '.ent', n => show(hits.find(e => e.type + '|' + e.name === n.dataset.k)));
      const cur = hits.find(e => e.type + '|' + e.name === ctx.ui.sel) || hits[0];
      show(cur);
    };
    const inp = el.querySelector('#q');
    inp.addEventListener('input', () => { ctx.ui.q = inp.value; draw(); });
    inp.addEventListener('keydown', e => e.stopPropagation());
    draw();
    return { notes: ['Gunakan saat tanya-jawab: ketik nama BP untuk melihat sales, late days, dan umur piutang.'] };
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
      '<h1 style="margin-top:auto;font-size:72px">Terima kasih</h1><div class="period" style="font-size:20px">Tanya-jawab · gunakan BP Explorer untuk detail per pelanggan</div></div>';
    return { notes: ['Tutup dengan tindak lanjut; buka BP Explorer untuk pertanyaan spesifik.'] };
  },
});
