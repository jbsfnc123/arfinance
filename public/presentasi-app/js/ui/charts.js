/* Helper ECharts: warna sesuai tema, gaya sumbu, klik -> drill-down. */

const Charts = (() => {
  const C = {
    TOP: '#2F6FD6', EXDO: '#F2C230', CBD: '#F08A24',
    CY: '#2F6FD6', LY: '#A8B6CC',
    M: ['#F2C230', '#16B7A6', '#2F6FD6'],
    AGING: ['#22C55E', '#A3D93A', '#FACC15', '#FB923C', '#EF4444', '#475569'],
    LINE: '#2F6FD6', LINE2: '#10B6A6', GOOD: '#16A34A', BAD: '#DC2626',
  };
  const CAT_COLORS = [C.TOP, C.EXDO, C.CBD];
  let list = [];

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function theme() {
    return { text: css('--text'), text2: css('--text-2'), text3: css('--text-3'), line: css('--card-line'), card: css('--card'),
      dark: document.documentElement.dataset.theme === 'dark' };
  }

  /** Label sumbu Rupiah ringkas. */
  function axisMoney(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' B';
    if (a >= 1e6) return (v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' jt';
    return v.toLocaleString('id-ID');
  }

  function base(extra) {
    const t = theme();
    return Object.assign({
      animationDuration: 500,
      textStyle: { fontFamily: 'Inter, Segoe UI, sans-serif', color: t.text2 },
      grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item', backgroundColor: t.dark ? '#0B1120' : '#fff', borderColor: t.line, textStyle: { color: t.text, fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);',
      },
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: t.text2, fontSize: 12 } },
    }, extra || {});
  }

  function catAxis(data, extra) {
    const t = theme();
    return Object.assign({ type: 'category', data: data, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false },
      axisLabel: { color: t.text2, fontSize: 12, fontWeight: 500 } }, extra || {});
  }
  function valAxis(fmt, extra) {
    const t = theme();
    return Object.assign({ type: 'value', splitLine: { lineStyle: { color: t.line, type: 'dashed' } },
      axisLabel: { color: t.text3, fontSize: 11, formatter: fmt || axisMoney } }, extra || {});
  }

  /** Buat chart; onClick(params) dipanggil saat elemen data diklik. */
  function make(el, option, onClick) {
    const inst = echarts.init(el, null, { renderer: 'canvas' });
    inst.setOption(option);
    if (onClick) {
      inst._onClick = onClick;
      inst.on('click', p => onClick(p));
      inst.getZr().on('mousemove', e => { el.style.cursor = e.target ? 'pointer' : 'default'; });
    }
    list.push(inst);
    return inst;
  }

  function spark(el, data, color, opts) {
    const t = theme();
    const vals = data.map(v => (v === null || v === undefined ? null : v));
    return make(el, {
      animation: false, grid: { left: 2, right: 2, top: 4, bottom: 2 },
      xAxis: { type: 'category', show: false, data: vals.map((_, i) => i), boundaryGap: false },
      yAxis: { type: 'value', show: false, scale: true },
      series: [{ type: opts && opts.bar ? 'bar' : 'line', data: vals, smooth: 0.3, symbol: 'none', connectNulls: true,
        lineStyle: { width: 2, color: color || C.LINE }, itemStyle: { color: color || C.LINE, borderRadius: 2 },
        areaStyle: opts && opts.bar ? undefined : { color: new echarts.graphic.LinearGradient(0, 0, 0, 1,
          [{ offset: 0, color: (color || C.LINE) + '55' }, { offset: 1, color: (color || C.LINE) + '00' }]) } }],
      tooltip: { show: false },
    });
  }

  function disposeAll() {
    list.forEach(i => { try { i.dispose(); } catch (e) { /* sudah dibuang */ } });
    list = [];
  }
  function resizeAll() { list.forEach(i => { try { i.resize(); } catch (e) { /* abaikan */ } }); }

  /** Uji otomatis: simulasikan klik elemen data pada chart ke-i. */
  function simulate(i, si, di) {
    const inst = list.filter(x => x._onClick)[i];
    if (!inst) return;
    const s = inst.getOption().series[si];
    const v = s && s.data ? s.data[di] : null;
    inst._onClick({ seriesIndex: si, dataIndex: di, value: v && typeof v === 'object' ? v.value : v, name: '' });
  }

  return { C, CAT_COLORS, theme, base, catAxis, valAxis, axisMoney, make, spark, disposeAll, resizeAll, simulate };
})();
