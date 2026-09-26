/* Slide 1–6. Kontrak: {id, title, desc, render(ctx, el) -> {notes}} ; ctx = {D, m, ui, set(k,v), drill(o)} */

const SLIDES = [];

// ---------------------------------------------------------------- helper tampilan

function sHead_(ctx, n, eyebrow, title, right) {
  return '<div class="s-head"><div><div class="eyebrow">' + String(ctx.num || n).padStart(2, '0') + ' · ' + esc_(eyebrow) + '</div>' +
    '<h1>' + esc_(title) + '</h1></div><div class="right">' + (right || '') + '<span class="pill">' + esc_(idMonth_(ctx.m)) + '</span>' +
    '<img class="logo" src="assets/logo.png" alt=""></div></div>';
}
function sFoot_(ctx, source) {
  return '<div class="s-foot"><span>' + esc_(source) + '</span><span>AR Management Deck · ' + esc_(full_(ctx.m)) + '</span></div>';
}
function delta_(v, kind, good, label) {
  if (v === null || v === undefined || !isFinite(v)) return '<span class="delta flat">–</span>';
  const up = v > 0;
  const cls = Math.abs(v) < 1e-9 ? 'flat' : (up === (good !== 'down') ? 'good' : 'bad');
  const txt = kind === 'pp' ? pp_(v) : kind === 'days' ? sgn_(v, x => num_(x, 1)) + ' hr' : sgn_(v, x => pc_(x));
  return '<span class="delta ' + cls + '">' + (up ? '▲' : v < 0 ? '▼' : '■') + ' ' + txt + '</span>' +
    (label ? '<span class="sub">' + esc_(label) + '</span>' : '');
}
function seg_(name, opts, cur) {
  return '<div class="seg" data-seg="' + name + '">' + opts.map(([v, l]) =>
    '<button data-v="' + v + '" class="' + (v === cur ? 'on' : '') + '">' + esc_(l) + '</button>').join('') + '</div>';
}
function bindSeg_(el, ctx) {
  el.querySelectorAll('.seg').forEach(s => s.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) ctx.set(s.dataset.seg, b.dataset.v);
  }));
}
function on_(el, sel, fn) {
  el.querySelectorAll(sel).forEach(n => n.addEventListener('click', e => fn(n, e)));
}
function kpiCard_(o) {
  return '<div class="card kpi click" data-kpi="' + o.id + '"><div class="label">' + esc_(o.label) + '</div>' +
    '<div class="value num' + (o.lg ? ' lg' : '') + '">' + esc_(o.value) + '</div>' +
    '<div class="row">' + (o.deltaHtml || '') + '</div>' + (o.sub ? '<div class="sub">' + esc_(o.sub) + '</div>' : '') +
    (o.spark ? '<div class="spark" data-spark="' + o.id + '"></div>' : '') + '</div>';
}

// ================================================================ 1. Cover

SLIDES.push({
  id: 'cover', title: 'Cover', desc: 'Periode & status data',
  render(ctx, el) {
    el.classList.add('cover');
    const cov = coverage_(ctx.D, ctx.m);
    el.innerHTML = '<div class="cover-inner">' +
      '<svg class="cover-art" viewBox="0 0 200 200"><g fill="none" stroke="#fff" stroke-width="1.2">' +
      [0, 1, 2, 3, 4, 5].map(i => '<circle cx="100" cy="100" r="' + (20 + i * 16) + '" opacity="' + (1 - i * 0.14) + '"/>').join('') +
      '<path d="M20 150 L60 120 L90 132 L130 80 L180 60" stroke-width="3"/></g></svg>' +
      '<img class="logo-w" src="assets/logo.png" alt="">' +
      '<div class="kicker">Management Presentation · Finance</div>' +
      '<h1>Account Receivable<br>&amp; Sales Review</h1>' +
      '<div class="period">Periode ' + esc_(idMonth_(ctx.m)) + '</div>' +
      '<div class="meta">' + cov.map(c => '<span>' + (c.ok ? '✓ ' : '○ ') + esc_(c.label) +
        (c.ok && c.src && LAYER_LABEL[c.src] ? ' · ' + esc_(LAYER_LABEL[c.src]) : '') + '</span>').join('') + '</div></div>';
    return { notes: ['Pembuka: periode ' + idMonth_(ctx.m) + '. Status kelengkapan data tampil di bawah judul.'] };
  },
});

// ================================================================ 3. Sales performance

SLIDES.push({
  id: 'sales', title: 'Sales Performance', desc: 'FY vs LY, YTD, rata-rata invoice',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const y = yr_(m);
    const s = sales_(D, m);
    const ly = sales_(D, addM_(m, -12));
    const pm = sales_(D, addM_(m, -1));
    const ytd = yy => sum_(monthRange_(yy + '-01', 0, mIdx_(m)).map(ym => sales_(D, ym)));
    const n = invCount_(D, m);
    const nLy = invCount_(D, addM_(m, -12));
    const avg = s && n ? s / n : null;
    const avgLy = ly && nLy ? ly / nLy : null;
    el.innerHTML = sHead_(ctx, 3, 'Sales Performance', headline_(D, m, 'sales')) +
      '<div class="s-body" style="grid-template-columns: 330px 1fr">' +
      '<div style="display:grid;grid-template-rows:repeat(3,1fr);gap:14px">' +
      kpiCard_({ id: 'm', label: 'Sales ' + idMonth_(m), value: money_(s), lg: true,
        deltaHtml: delta_(growth_(s, ly), '', 'up', 'vs ' + abbr_(addM_(m, -12))) + delta_(growth_(s, pm), '', 'up', 'MoM') }) +
      kpiCard_({ id: 'ytd', label: 'YTD ' + y, value: money_(ytd(y)), deltaHtml: delta_(growth_(ytd(y), ytd(y - 1)), '', 'up', 'vs YTD ' + (y - 1)),
        sub: 'YTD ' + (y - 1) + ': ' + money_(ytd(y - 1)) }) +
      kpiCard_({ id: 'avg', label: 'Rata-rata per invoice', value: avg ? jt_(avg) : '-', deltaHtml: delta_(growth_(avg, avgLy), '', 'up', 'vs ' + abbr_(addM_(m, -12))),
        sub: (n ? grp_(n, '.') + ' invoice bulan ini' : '') }) + '</div>' +
      '<div class="card chart-card"><h3>Sales bulanan FY ' + (y - 1) + ' vs FY ' + y + '<span class="hint">klik batang untuk detail bulan</span></h3><div class="chart" id="c-sales"></div></div>' +
      '</div>' + sFoot_(ctx, 'Sales = Invoice Amount TOP + Ex DO + CBD (ALL). Sumber: ' + (LAYER_LABEL[salesSrc_(D, m)] || '-') + '.');

    const months = (yy, cut) => MABBR.map((_, k) => { const ym = yy + '-' + String(k + 1).padStart(2, '0'); return cut && ym > m ? null : sales_(D, ym); });
    const t = Charts.theme();
    const cur = months(y, true);
    Charts.make(el.querySelector('#c-sales'), Charts.base({
      legend: { top: 0, right: 0, textStyle: { color: t.text2 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => money_(v),
        backgroundColor: t.dark ? '#0B1120' : '#fff', borderColor: t.line, textStyle: { color: t.text } },
      xAxis: Charts.catAxis(MABBR.map(x => x.toUpperCase())), yAxis: Charts.valAxis(),
      series: [
        { name: 'FY ' + (y - 1), type: 'bar', data: months(y - 1), itemStyle: { color: Charts.C.LY, borderRadius: [4, 4, 0, 0] }, barGap: '10%' },
        { name: 'FY ' + y, type: 'bar', data: cur.map((v, i) => ({ value: v, itemStyle: { opacity: i === mIdx_(m) ? 1 : 0.78 } })),
          itemStyle: { color: Charts.C.CY, borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', color: t.text2, fontSize: 11, fontWeight: 600, formatter: p => (p.value ? dec_(p.value / 1e9, 1) : '') } },
      ],
    }), p => {
      const ym = (p.seriesIndex === 0 ? y - 1 : y) + '-' + String(p.dataIndex + 1).padStart(2, '0');
      ctx.drill({ key: 'sales|' + ym, eyebrow: 'Sales', title: idMonth_(ym), hero: money_(sales_(D, ym)), sections: drillSalesMonth_(D, ym) });
    });
    on_(el, '[data-kpi]', nd => {
      const id = nd.dataset.kpi;
      const secs = id === 'm' ? drillSalesMonth_(D, m) : id === 'avg' ? [mixTable_(D, 'all', m), mixTable_(D, 'all', addM_(m, -12))]
        : [tb_('YTD per bulan', [{ h: 'Bulan' }, { h: y, align: 'right' }, { h: y - 1, align: 'right' }], monthRange_(y + '-01', 0, mIdx_(m))
          .map(ym => [abbr_(ym).slice(0, 3), money_(sales_(D, ym)), money_(sales_(D, addM_(ym, -12)))]), ['Total', money_(ytd(y)), money_(ytd(y - 1))])];
      ctx.drill({ key: 'sales-kpi|' + id, eyebrow: 'Sales Performance', title: nd.querySelector('.label').textContent,
        hero: nd.querySelector('.value').textContent, sections: secs });
    });
    return { notes: [headline_(D, m, 'sales') + '.', 'YTD ' + y + ' ' + money_(ytd(y)) + ' vs ' + money_(ytd(y - 1)) + ' tahun lalu.'] };
  },
});

// ================================================================ 4. Sales mix (slide 3–5 lama)

SLIDES.push({
  id: 'mix', title: 'Sales Mix', desc: 'TOP · Ex DO · CBD (All/Trad/Reseller)',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const scope = ctx.ui.scope || 'all';
    const metric = ctx.ui.metric || 'amt';
    const months = monthRange_(m, -4, 0);
    const key = (si, ym) => g_(D, metric + '_' + scope + ':' + si, ym);
    const totals = months.map(ym => sum_([0, 1, 2].map(si => key(si, ym))));
    const t = Charts.theme();
    const scopeLbl = { all: 'ALL', trad: 'Traditional', res: 'Reseller' }[scope];
    const A = [0, 1, 2].map(i => g_(D, 'amt_' + scope + ':' + i, m));
    const N = [0, 1, 2].map(i => g_(D, 'cnt_' + scope + ':' + i, m));
    const Ap = [0, 1, 2].map(i => g_(D, 'amt_' + scope + ':' + i, addM_(m, -1)));
    const sa = sum_(A);
    const sap = sum_(Ap);
    el.innerHTML = sHead_(ctx, 4, 'Sales Mix · ' + scopeLbl, headline_(D, m, 'mix'),
      seg_('scope', [['all', 'ALL'], ['trad', 'Traditional'], ['res', 'Reseller']], scope) + seg_('metric', [['amt', 'Amount'], ['cnt', 'Invoice']], metric)) +
      '<div class="s-body" style="grid-template-columns: 1fr 360px">' +
      '<div class="card chart-card"><h3>' + (metric === 'amt' ? 'Invoice Amount' : 'Invoice Count') + ' — komposisi 5 bulan<span class="hint">klik segmen untuk detail & Top BP</span></h3><div class="chart" id="c-mix"></div></div>' +
      '<div class="card" style="display:flex;flex-direction:column"><h3>' + esc_(idMonth_(m)) + ' · ' + scopeLbl + '</h3>' +
      '<table class="t" style="margin-top:6px"><thead><tr><th>Kategori</th><th class="r">Amount</th><th class="r">Share</th><th class="r">Avg/inv</th></tr></thead><tbody>' +
      CATS.map((c, i) => '<tr data-si="' + i + '"><td><span class="dot" style="background:' + Charts.CAT_COLORS[i] + '"></span>' + c + '</td>' +
        '<td class="r num">' + money_(A[i]) + '</td><td class="r num">' + (sa ? pc_((A[i] || 0) / sa, 0) : '-') +
        '<div style="font-size:11px" class="' + ((sa && sap && (A[i] || 0) / sa >= (Ap[i] || 0) / sap) ? 'good' : '') + '">' +
        (sa && sap ? pp_((A[i] || 0) / sa - (Ap[i] || 0) / sap) : '') + '</div></td>' +
        '<td class="r num">' + (A[i] && N[i] ? jt_(A[i] / N[i]) : '-') + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="r num">' + money_(sa) + '</td><td class="r">100%</td><td class="r num">' +
      (sa && sum_(N) ? jt_(sa / sum_(N)) : '-') + '</td></tr></tfoot></table>' +
      '<h3 style="margin-top:18px">Rata-rata per invoice (5 bulan)</h3><div class="chart" id="c-avg" style="min-height:150px"></div></div>' +
      '</div>' + sFoot_(ctx, 'Persentase dibulatkan agar total 100% (metode sama dengan deck). pp = percentage point vs bulan lalu.');

    const pct = months.map((ym, k) => pctLrm_([0, 1, 2].map(si => key(si, ym) || 0)));
    Charts.make(el.querySelector('#c-mix'), Charts.base({
      grid: { left: 8, right: 14, top: 34, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item', formatter: p => esc_(CATS[p.seriesIndex]) + ' · ' + months[p.dataIndex].slice(0, 7) + '<br><b>' +
        (metric === 'amt' ? money_(key(p.seriesIndex, months[p.dataIndex])) : grp_(key(p.seriesIndex, months[p.dataIndex]), '.') + ' invoice') + '</b> (' + p.value + '%)' },
      xAxis: Charts.catAxis(months.map((ym, k) => cat_(ym) + '\n' + (metric === 'amt' ? money_(totals[k]) : grp_(totals[k], '.') + ' inv')),
        { axisLabel: { color: t.text2, fontSize: 12, lineHeight: 18, fontWeight: 600 } }),
      yAxis: Charts.valAxis(v => v + '%', { max: 100 }),
      series: CATS.map((c, si) => ({
        name: c, type: 'bar', stack: 's', barWidth: '46%', data: pct.map(p => p[si]),
        itemStyle: { color: Charts.CAT_COLORS[si], borderRadius: si === 2 ? [6, 6, 0, 0] : 0 },
        label: { show: true, formatter: p => (p.value >= 6 ? p.value + '%' : ''), color: si === 0 ? '#fff' : '#1f2937', fontWeight: 700, fontSize: 13 },
      })),
    }), p => ctx.drill({ key: 'mix|' + scope + '|' + p.seriesIndex + '|' + p.dataIndex, eyebrow: 'Sales Mix · ' + scopeLbl,
      title: CATS[p.seriesIndex] + ' · ' + idMonth_(months[p.dataIndex]), hero: money_(g_(D, 'amt_' + scope + ':' + p.seriesIndex, months[p.dataIndex])),
      sections: drillMix_(D, scope, p.seriesIndex, months[p.dataIndex]) }));

    Charts.make(el.querySelector('#c-avg'), Charts.base({
      grid: { left: 4, right: 10, top: 24, bottom: 4, containLabel: true }, legend: { show: false },
      tooltip: { trigger: 'axis', valueFormatter: v => jt_(v) },
      xAxis: Charts.catAxis(months.map(short_), { axisLabel: { color: t.text3, fontSize: 10 } }),
      yAxis: Charts.valAxis(v => num_(v / 1e6) + ' jt', { splitNumber: 3 }),
      series: CATS.map((c, si) => ({ name: c, type: 'line', smooth: true, symbolSize: 5, lineStyle: { width: 2.5 },
        color: Charts.CAT_COLORS[si], data: months.map(ym => { const a = g_(D, 'amt_' + scope + ':' + si, ym); const n = g_(D, 'cnt_' + scope + ':' + si, ym); return a && n ? a / n : null; }) })),
    }));
    on_(el, 'tr[data-si]', tr => {
      const si = Number(tr.dataset.si);
      ctx.drill({ key: 'mix|' + scope + '|' + si + '|4', eyebrow: 'Sales Mix · ' + scopeLbl, title: CATS[si] + ' · ' + idMonth_(m),
        hero: money_(A[si]), sections: drillMix_(D, scope, si, m) });
    });
    bindSeg_(el, ctx);
    return { notes: [headline_(D, m, 'mix') + '.', 'Gunakan tombol ALL/Traditional/Reseller untuk slide 3–5 versi lama.'] };
  },
});

// ================================================================ 5. Reseller & site (slide 6–7 lama)

SLIDES.push({
  id: 'reseller', title: 'Reseller & Site', desc: 'BP aktif, avg sales/BP, site CBD',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const metric = ctx.ui.site || 'amt';
    const months5 = monthRange_(m, -4, 0);
    const months3 = monthRange_(m, -2, 0);
    const t = Charts.theme();
    const avgBp = ym => { const a = sum_([0, 1, 2].map(i => g_(D, 'amt_res:' + i, ym))); const b = sum_([0, 1, 2].map(i => g_(D, 'bp_res:' + i, ym))); return a && b ? a / b : null; };
    const siteVal = (k, ym) => {
      const a = g_(D, 's7_amt:' + k, ym);
      const n = g_(D, 's7_cnt:' + k, ym);
      const b = g_(D, 's7_bp:' + k, ym);
      return metric === 'amt' ? a : metric === 'cnt' ? n : metric === 'bp' ? b : (a && b ? a / b : null);
    };
    const fmt = v => (metric === 'amt' || metric === 'avg' ? money_(v) : grp_(v, '.'));
    el.innerHTML = sHead_(ctx, 5, 'Reseller & Site', headline_(D, m, 'reseller')) +
      '<div class="s-body" style="grid-template-columns: 1fr 1fr">' +
      '<div class="card chart-card"><h3>BP Reseller aktif per kategori + rata-rata sales/BP<span class="hint">klik untuk BP baru/hilang</span></h3><div class="chart" id="c-bp"></div></div>' +
      '<div class="card chart-card"><h3 style="margin-bottom:8px">Reseller CBD per site (3 bulan)<span class="hint">' +
      seg_('site', [['amt', 'Amount'], ['cnt', 'Invoice'], ['bp', 'BP'], ['avg', 'Avg/BP']], metric) + '</span></h3><div class="chart" id="c-site"></div></div>' +
      '</div>' + sFoot_(ctx, 'BP aktif = distinct BP Key per kategori. Site: Jakarta+Karawang = DKI Jakarta, Margomulyo = Surabaya.');

    Charts.make(el.querySelector('#c-bp'), Charts.base({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 8, right: 8, top: 34, bottom: 8, containLabel: true },
      xAxis: Charts.catAxis(months5.map(cat_)),
      yAxis: [Charts.valAxis(v => v, { name: 'BP', nameTextStyle: { color: t.text3 } }),
        Charts.valAxis(v => num_(v / 1e6) + ' jt', { splitLine: { show: false } })],
      series: CATS.map((c, si) => ({ name: c, type: 'bar', stack: 'bp', barWidth: '42%', data: months5.map(ym => g_(D, 'bp_res:' + si, ym)),
        itemStyle: { color: Charts.CAT_COLORS[si], borderRadius: si === 2 ? [5, 5, 0, 0] : 0 },
        label: { show: true, color: si === 0 ? '#fff' : '#1f2937', fontWeight: 700, formatter: p => (p.value >= 12 ? p.value : '') } }))
        .concat([{ name: 'Avg sales / BP', type: 'line', yAxisIndex: 1, data: months5.map(avgBp), smooth: true, symbolSize: 7, color: Charts.C.LINE2,
          lineStyle: { width: 3 }, label: { show: true, position: 'top', color: t.text2, fontWeight: 600, formatter: p => num_(p.value / 1e6) + ' jt' },
          tooltip: { valueFormatter: v => jt_(v) } }]),
    }), p => {
      const ym = months5[p.dataIndex];
      if (p.seriesIndex > 2) return;
      ctx.drill({ key: 'res|' + p.seriesIndex + '|' + ym, eyebrow: 'Reseller', title: CATS[p.seriesIndex] + ' · ' + idMonth_(ym),
        hero: grp_(p.value, '.') + ' BP', sections: drillReseller_(D, p.seriesIndex, ym) });
    });

    Charts.make(el.querySelector('#c-site'), Charts.base({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: fmt },
      grid: { left: 8, right: 40, top: 34, bottom: 8, containLabel: true },
      yAxis: Charts.catAxis(SITES.slice().reverse(), { axisLabel: { color: t.text2, fontWeight: 600 } }),
      xAxis: Charts.valAxis(metric === 'amt' || metric === 'avg' ? Charts.axisMoney : v => v),
      series: months3.map((ym, i) => ({ name: cat_(ym), type: 'bar', barGap: '8%', data: SITES.map((_, k) => siteVal(k, ym)).reverse(),
        itemStyle: { color: Charts.C.M[i], borderRadius: [0, 4, 4, 0] },
        label: { show: i === 2, position: 'right', color: t.text2, fontSize: 11, fontWeight: 600,
          formatter: p => (metric === 'amt' || metric === 'avg' ? num_(p.value / 1e6) + ' jt' : p.value) } })),
    }), p => {
      const k = SITES.length - 1 - p.dataIndex;
      const ym = months3[p.seriesIndex];
      ctx.drill({ key: 'site|' + k + '|' + ym, eyebrow: 'Reseller CBD per site', title: SITES[k] + ' · ' + idMonth_(ym),
        hero: money_(g_(D, 's7_amt:' + k, ym)), sections: drillSite_(D, k, ym) });
    });
    bindSeg_(el, ctx);
    return { notes: [headline_(D, m, 'reseller') + '.', 'Rata-rata sales per BP ' + jt_(avgBp(m)) + ' (' + sgn_(growth_(avgBp(m), avgBp(addM_(m, -1))), x => pc_(x)) + ' MoM).'] };
  },
});

// ================================================================ 6. Collection (slide 8, 14, 19, 20 lama)

SLIDES.push({
  id: 'collection', title: 'Collection', desc: 'Target vs actual, TOP 5, Top Unpaid',
  render(ctx, el) {
    const D = ctx.D;
    const m = ctx.m;
    const w = D.cfg.week;
    const scope = ctx.ui.coll || 'all';
    const x = collNums_(D, m, scope);
    const p = (a, b) => (a !== null && b ? a / b : null);
    const wTxt = 'W' + w + ' ' + abbr_(addM_(m, 1));
    const U = manualRows_(D, 'Top Unpaid W', m);
    const unpaid = U.rows;
    const maxU = Math.max.apply(null, unpaid.map(r => Number(r['Unpaid (Rp)']) || 0).concat([1]));
    const t = Charts.theme();
    const bar = (v, tgt) => '<div class="progress" style="margin-top:10px"><span style="width:' + Math.min(100, (p(v, tgt) || 0) * 100).toFixed(1) + '%"></span></div>';
    el.innerHTML = sHead_(ctx, 6, 'Collection', headline_(D, m, 'collection'),
      seg_('coll', [['all', 'All'], ['top5', 'TOP 5'], ['wo5', 'w/o TOP 5']], scope)) +
      '<div class="s-body" style="grid-template-rows: 150px 1fr; grid-template-columns: 1fr 1fr 1fr">' +
      '<div class="card kpi click" data-k="t"><div class="label">Target collection ' + esc_(abbr_(m)) + '</div><div class="value lg num">' + money_(x.t) + '</div>' +
      '<div class="sub">Target bulan depan: ' + money_(scope === 'all' ? sumN_([0, 1, 2, 3, 4].map(i => g_(D, 'tgt_next:' + i, m))) : null) + '</div></div>' +
      '<div class="card kpi click" data-k="a"><div class="label">Collected s/d ' + lastDay_(m) + ' ' + esc_(abbr_(m)) + '</div><div class="value num">' + money_(x.a) +
      ' <span style="font-size:20px;color:var(--brand)">' + pc_(p(x.a, x.t), 2) + '</span></div>' + bar(x.a, x.t) +
      '<div class="sub">Belum tertagih ' + money_(x.t !== null && x.a !== null ? x.t - x.a : null) + '</div></div>' +
      '<div class="card kpi click" data-k="w"><div class="label">Collected s/d ' + esc_(wTxt) + '</div>' + (x.w === null
        ? '<div class="value" style="font-size:20px;color:var(--text-3);margin-top:14px">Belum diinput</div><div class="sub">Isi di Data Center › Input manual</div></div>'
        : '<div class="value num">' + money_(x.w) + ' <span style="font-size:20px;color:var(--accent)">' + pc_(p(x.w, x.t), 2) + '</span></div>' + bar(x.w, x.t) +
          '<div class="sub">Belum tertagih ' + money_(x.t !== null ? x.t - x.w : null) + '</div></div>') +
      '<div class="card chart-card" style="grid-column: span 2"><h3>' + (scope === 'all' ? 'Per Marketing Group — target vs actual vs ' + esc_(wTxt) : 'All vs TOP 5 vs w/o TOP 5') +
      '<span class="hint">klik untuk detail group</span></h3><div class="chart" id="c-coll"></div></div>' +
      '<div class="card" style="display:flex;flex-direction:column"><h3>Top Unpaid ' + esc_(wTxt) + '<span class="hint">' + (U.stale ? 'data per ' + esc_(idMonth_(U.ym)) : 'klik untuk profil') + '</span></h3>' +
      (unpaid.length ? '<div class="scroll"><table class="t"><thead><tr><th>Payment Group</th><th class="r">Unpaid</th></tr></thead><tbody>' +
        unpaid.map((r, i) => '<tr data-pg="' + i + '"><td>' + esc_(r['Payment Group']) + '</td><td class="r num bar-in" style="width:130px">' +
          '<i style="width:' + ((Number(r['Unpaid (Rp)']) || 0) / maxU * 100).toFixed(0) + '%"></i><span>' + money_(Number(r['Unpaid (Rp)'])) + '</span></td></tr>').join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="r num">' + money_(sum_(unpaid.map(r => Number(r['Unpaid (Rp)'])))) + '</td></tr></tfoot></table></div>'
        : '<div class="empty-note">Belum ada data Top Unpaid untuk ' + esc_(abbr_(m)) + '. Isi lewat Data Center › template manual.</div>') + '</div>' +
      '</div>' + sFoot_(ctx, 'Target, actual, dan collection s/d minggu W = input manual (Data Center). Top Unpaid = tabel manual.');

    const el2 = el.querySelector('#c-coll');
    if (scope === 'all') {
      const T = GROUPS.map((_, i) => g_(D, 'coll_tgt:' + i, m));
      const A = GROUPS.map((_, i) => g_(D, 'coll_act:' + i, m));
      const W = GROUPS.map((_, i) => g_(D, 'coll_w:' + i, m));
      Charts.make(el2, Charts.base({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => money_(v) },
        grid: { left: 8, right: 70, top: 30, bottom: 8, containLabel: true },
        yAxis: Charts.catAxis(GROUPS.slice().reverse(), { axisLabel: { color: t.text2, fontWeight: 600 } }),
        xAxis: Charts.valAxis(),
        series: [
          { name: 'Target', type: 'bar', data: T.slice().reverse(), barWidth: 22, itemStyle: { color: t.dark ? '#26344d' : '#E3EAF5', borderRadius: 6 }, z: 1 },
          { name: 'Actual akhir bulan', type: 'bar', data: A.slice().reverse(), barWidth: 12, barGap: '-77%', itemStyle: { color: Charts.C.CY, borderRadius: 6 }, z: 3,
            label: { show: true, position: 'right', distance: 32, color: t.text, fontWeight: 700, formatter: q => pc_(q.value / T[GROUPS.length - 1 - q.dataIndex], 1) } },
          { name: 's/d ' + wTxt, type: 'scatter', data: W.slice().reverse(), symbol: 'rect', symbolSize: [4, 26], itemStyle: { color: Charts.C.LINE2 }, z: 4 },
        ],
      }), q => {
        const i = GROUPS.length - 1 - q.dataIndex;
        ctx.drill({ key: 'coll|' + i, eyebrow: 'Collection', title: GROUPS[i], hero: pc_(A[i] / T[i], 2), sections: drillCollGroup_(D, i, m, w) });
      });
    } else {
      const sc = ['all', 'top5', 'wo5'];
      const vals = sc.map(s => collNums_(D, m, s));
      Charts.make(el2, Charts.base({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => money_(v) },
        xAxis: Charts.catAxis(['All', 'TOP 5', 'w/o TOP 5']), yAxis: Charts.valAxis(),
        series: [['Target', 't', t.dark ? '#33445f' : '#CBD5E1'], ['Actual', 'a', Charts.C.CY], ['s/d ' + wTxt, 'w', Charts.C.LINE2]].map(([nm, k, c]) => ({
          name: nm, type: 'bar', data: vals.map(v => v[k]), itemStyle: { color: c, borderRadius: [5, 5, 0, 0] },
          label: { show: k !== 't', position: 'top', color: t.text2, fontWeight: 600, formatter: q => pc_(q.value / vals[q.dataIndex].t, 1) } })),
      }), q => ctx.drill({ key: 'coll-sc|' + q.dataIndex, eyebrow: 'Collection', title: ['All', 'TOP 5', 'w/o TOP 5'][q.dataIndex],
        sections: [kv_('Angka', [['Target', money_(vals[q.dataIndex].t)], ['Actual', money_(vals[q.dataIndex].a)], ['s/d ' + wTxt, money_(vals[q.dataIndex].w)]])] }));
    }
    on_(el, '[data-k]', () => ctx.drill({ key: 'coll-kpi|' + scope, eyebrow: 'Collection', title: 'Ringkasan ' + abbr_(m),
      hero: pc_(p(x.a, x.t), 2), sections: collectionSections_(D, m).concat([kv_('AR', [['Open amount', money_(g_(D, 'open', m))], ['AR Days TOP', days_(arDays_(D, m))]])]) }));
    on_(el, 'tr[data-pg]', tr => {
      const r = unpaid[Number(tr.dataset.pg)];
      ctx.drill({ key: 'unpaid|' + tr.dataset.pg, eyebrow: 'Top Unpaid · profil', title: r['Payment Group'], hero: money_(Number(r['Unpaid (Rp)'])),
        sections: profile_(D, [r['Payment Group']], m) });
    });
    bindSeg_(el, ctx);
    return { notes: [headline_(D, m, 'collection') + '.'] };
  },
});
