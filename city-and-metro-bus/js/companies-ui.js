'use strict';
// 多公司面板：玩家总揽全局，把线网拆成若干家公司分别经营。
(function (CM) {
  const U = CM.U, R = CM.Companies;
  const UI = {};

  // 分公司账本：按线路归属汇总客流与票款（票款按 D.fare 与 routeBoard 比例摊到公司）
  UI.ledger = function (g) {
    R.ensure(g);
    const out = {};
    g.companies.forEach(function (c) { out[c.id] = { lines: 0, boards: 0, len: 0, name: c.name, color: c.color, income: 0, outcome: 0 }; });
    const daily = g.model && g.model.dailyFor ? g.model.dailyFor(g.model.dayType) : (g.model && g.model.daily);
    const sd = g.model && g.model.stDaily;
    const boards = sd && sd.routeBoard ? sd.routeBoard : null;
    const fareWan = daily && daily.ready ? daily.fare / 10000 : 0;
    for (const lid in g.net.lines) {
      const L = g.net.lines[lid]; if (!L) continue;
      const co = R.lineCo(L); if (!out[co]) continue;
      out[co].lines++;
    }
    let lenTotal = 0;
    if (g.compiled && g.compiled.routes) {
      g.compiled.routes.forEach(function (rt, i) {
        const L = rt.line, co = R.lineCo(L); if (!out[co] || (L && L.rail)) return;   // 国铁不属于任何运营公司
        if (boards) out[co].boards += boards[i] || 0;
        const km = (rt.lenM || 0) / 1000; out[co].len += km; lenTotal += km;
      });
    }
    const total = Object.keys(out).reduce(function (a, k) { return a + out[k].boards; }, 0);
    const cur = g.econ && g.econ.cur;
    const income = cur && cur.fare ? cur.fare : fareWan * 30.4;
    const outcome = cur && cur.ops ? cur.ops : 0;
    for (const k in out) {
      out[k].fare = total > 0 ? income * out[k].boards / total : 0;
      out[k].cost = lenTotal > 0 ? outcome * out[k].len / lenTotal : 0;
      out[k].income = out[k].fare; out[k].outcome = out[k].cost;
    }
    return out;
  };

  UI.render = function (self, body) {
    const g = self.g();
    R.ensure(g);
    const h = U.h;
    const rerender = function () { self.renderPage(false); };
    const changed = function (msg) {
      g.touch(); self.markUnsaved();
      if (typeof g.refreshOperations === 'function') g.refreshOperations();   // 重新编译并重算客流，跨公司惩罚立即生效
      rerender(); if (msg) self.toast(msg, 'good');
    };

    body.appendChild(h('div', { class: 'pp-head' },
      h('div', null, h('b', null, '多公司运营'), h('div', { class: 'tiny muted' }, '你把线网拆给几家公司分别经营，全部由你决策。跨公司换乘会有壁垒，公司越多、换乘越不便。')),
      h('span', { class: 'badge b-blue' }, g.companies.length + ' 家')));

    // 规则：跨公司换乘壁垒档位
    const ruleBox = h('div', { class: 'tk-card', style: { margin: '8px 0' } });
    ruleBox.appendChild(h('div', { class: 'row between' }, h('b', null, '跨公司换乘壁垒'),
      h('span', { class: 'tiny muted' }, R.PENALTY[g.coRule.xfer || 0][1] + ' 分钟/次')));
    const seg = h('div', { class: 'seg-ctl sm', style: { marginTop: '6px' } });
    R.PENALTY.forEach(function (p, i) {
      seg.appendChild(h('button', { class: (g.coRule.xfer || 0) === i ? 'on' : '', onclick: function () {
        g.coRule.xfer = i; changed('壁垒设为「' + R.penaltyName(i) + '」');
      } }, R.penaltyName(i)));
    });
    ruleBox.appendChild(seg);
    ruleBox.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '6px' } },
      '跨公司换乘时乘客要多花广义时间：同集团子公司像一张网；同集团控股要权衡边界；不同集团壁垒明显，适合挑战。'));
    body.appendChild(ruleBox);

    // 公司列表
    const led = UI.ledger(g);
    g.companies.forEach(function (c) {
      const card = h('div', { class: 'tk-card', style: { margin: '8px 0', borderLeft: '3px solid ' + c.color } });
      const head = h('div', { class: 'row between' });
      const nameIn = h('input', { type: 'text', value: c.name, maxlength: 16, 'aria-label': '公司名称', style: { width: '150px' } });
      nameIn.onchange = function () { R.rename(g, c.id, nameIn.value); changed(); };
      const colorIn = h('input', { type: 'color', value: c.color, 'aria-label': '公司颜色', style: { width: '34px', height: '26px', padding: 0, border: 'none', background: 'none' } });
      colorIn.onchange = function () { R.recolor(g, c.id, colorIn.value); changed(); };
      head.appendChild(h('div', { class: 'row' }, nameIn, colorIn));
      if (c.id !== 0 && g.companies.length > 1) head.appendChild(h('button', { class: 'btn xs ghost', onclick: function () {
        if (R.remove(g, c.id)) changed('公司已撤销，原线路划回第一家公司');
      } }, '撤销'));
      card.appendChild(head);
      const L = led[c.id] || { lines: 0, boards: 0 };
      card.appendChild(h('div', { class: 'tiny muted', style: { margin: '4px 0' } },
        '线路 ' + L.lines + ' 条 · 里程 ' + (L.len || 0).toFixed(1) + ' km · 日上车 ' + Math.round(L.boards) + ' 人次'));
      card.appendChild(h('div', { class: 'tiny', style: { margin: '4px 0', display: 'flex', gap: '14px' } },
        h('span', { style: { color: '#0f7f5c' } }, '本月收入 ' + U.fmtMoney(L.income || 0)),
        h('span', { style: { color: '#b42318' } }, '本月支出 ' + U.fmtMoney(L.outcome || 0)),
        h('span', null, '净 ' + U.fmtMoney((L.income || 0) - (L.outcome || 0)))));

      // 线路归属下拉：可选任意公司，中途划转按当月切账
      const list = h('div', { class: 'co-lines' });
      let any = false;
      for (const lid in g.net.lines) {
        const line = g.net.lines[lid]; if (!line || line.rail || R.lineCo(line) !== c.id) continue;
        any = true;
        const sel = h('select', { 'aria-label': '线路归属', onchange: function () {
          if (R.assign(g, lid, +sel.value)) changed('「' + line.name + '」已划转，从本月起记入新公司');
        } });
        g.companies.forEach(function (t) {
          sel.appendChild(h('option', { value: t.id, selected: t.id === c.id ? 'selected' : null }, t.name));
        });
        list.appendChild(h('div', { class: 'row between', style: { margin: '2px 0' } },
          h('span', { class: 'tiny grow' }, h('i', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: line.color || '#888', marginRight: '6px' } }), line.name),
          sel));
      }
      if (!any) list.appendChild(h('div', { class: 'tiny muted' }, '暂无线路，用下面的下拉把线路划进来'));
      card.appendChild(list);
      body.appendChild(card);
    });

    // 新公司
    const addIn = h('input', { type: 'text', placeholder: '新公司名称', maxlength: 16, 'aria-label': '新公司名称', style: { width: '150px' } });
    const full = g.companies.length >= R.MAX;
    body.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } }, addIn,
      h('button', { class: 'btn sm' + (full ? ' ghost' : ''), disabled: full ? 'disabled' : null,
        onclick: function () {
          if (full) { self.toast('最多 ' + R.MAX + ' 家公司', 'info'); return; }
          const id = R.add(g, addIn.value.trim());
          if (id < 0) { self.toast('最多 ' + R.MAX + ' 家公司', 'info'); return; }
          changed('已新建公司，把线路划给它即可开始运营');
        } }, full ? '已达上限 ' + R.MAX + ' 家' : '新建公司')));

    // 把线路划入某公司的快捷下拉（覆盖所有未在本公司名下的线路）
    body.appendChild(h('h3', null, '线路划转'));
    for (const lid in g.net.lines) {
      const line = g.net.lines[lid]; if (!line || line.rail) continue;
      const sel = h('select', { 'aria-label': '线路归属', onchange: function () {
        if (R.assign(g, lid, +sel.value)) changed('「' + line.name + '」已划转，从本月起记入新公司');
      } });
      g.companies.forEach(function (t) { sel.appendChild(h('option', { value: t.id, selected: t.id === R.lineCo(line) ? 'selected' : null }, t.name)); });
      body.appendChild(h('div', { class: 'row between', style: { margin: '3px 0' } },
        h('span', { class: 'tiny grow' }, line.name), sel));
    }
    body.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '8px' } },
      '划转从当月起生效：历史账目留在原公司，本月起的票款与客流记入新公司。撤销公司时其线路回到第一家公司。'));
  };

  CM.CompaniesUI = UI;
})(window.CM);
