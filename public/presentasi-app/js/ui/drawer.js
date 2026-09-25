/* Drawer detail kanan. Klik data yang sama untuk kedua kali menutup drawer. */

const Drawer = (() => {
  let key = null;
  const el = () => document.getElementById('drawer');

  function sections(secs) {
    if (!secs || !secs.length) return '';
    return secs.map(sc => {
      if (!sc) return '';
      const head = sc.title ? '<h4>' + esc_(sc.title) + '</h4>' : '';
      if (sc.t === 'note') return '<div class="note-s">' + esc_(sc.text) + '</div>';
      if (sc.t === 'html') return '<div class="sec">' + head + sc.html + '</div>';
      if (sc.t === 'kv') {
        return '<div class="sec">' + head + '<table class="kvt">' +
          sc.rows.map(r => '<tr><td class="k">' + esc_(r[0]) + '</td><td class="v">' + esc_(r[1]) + '</td></tr>').join('') + '</table></div>';
      }
      if (sc.t === 'table') {
        const al = i => (sc.cols[i] && sc.cols[i].align === 'right' ? ' class="n"' : '');
        return '<div class="sec">' + head + '<table><tr>' + sc.cols.map((c, i) => '<th' + al(i) + '>' + esc_(c.h) + '</th>').join('') + '</tr>' +
          sc.rows.map((r, ri) => '<tr' + (sc.sel === ri ? ' class="sel"' : '') + '>' + r.map((v, i) => '<td' + al(i) + '>' + esc_(v) + '</td>').join('') + '</tr>').join('') +
          (sc.foot ? '<tfoot><tr>' + sc.foot.map((v, i) => '<td' + al(i) + '>' + esc_(v) + '</td>').join('') + '</tr></tfoot>' : '') + '</table></div>';
      }
      if (sc.t === 'bars') {
        const max = Math.max.apply(null, sc.rows.map(r => Math.abs(r[1]) || 0).concat([1]));
        return '<div class="sec bars">' + head + sc.rows.map(r =>
          '<div class="row"><div class="lbl"><span title="' + esc_(r[0]) + '">' + esc_(r[0]) + '</span><span>' + esc_(r[2]) + '</span></div>' +
          '<div class="track"><div class="fill" style="width:' + (Math.abs(r[1]) / max * 100).toFixed(1) + '%"></div></div></div>').join('') + '</div>';
      }
      return '';
    }).join('');
  }

  /** open({key, eyebrow, title, hero, sub, sections}) — key sama & drawer terbuka => tutup. */
  function open(o) {
    if (o.key && o.key === key && isOpen()) { close(); return false; }
    key = o.key || null;
    document.getElementById('drawerEyebrow').textContent = o.eyebrow || 'Detail';
    document.getElementById('drawerTitle').textContent = o.title || '';
    const body = document.getElementById('drawerBody');
    body.innerHTML = (o.hero ? '<div class="hero num">' + esc_(o.hero) + '</div>' : '') +
      (o.sub ? '<div class="note-s" style="margin-top:0">' + esc_(o.sub) + '</div>' : '') + sections(o.sections);
    body.scrollTop = 0;
    el().classList.add('open');
    App.refit();
    return true;
  }
  function close() {
    key = null;
    el().classList.remove('open');
    App.refit();
  }
  function isOpen() { return el().classList.contains('open'); }

  return { open, close, isOpen, sections };
})();
