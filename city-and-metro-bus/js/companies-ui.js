'use strict';
// 多公司面板：玩家总揽全局，把线网拆成若干家公司分别经营。
(function (CM) {
  const U = CM.U, R = CM.Companies;
  const UI = {};

  // 分公司账本：按线路归属汇总客流、客运周转量与票款。
  // 票款按「实际乘坐里程」清分（CM.Clearing）：乘客在哪家线路上坐了多少公里，钱就按那个比例切。
  // 这取代了旧版「按上车人次摊」——那种算法让接驳短线躺着赚钱、替人承运长距离的线路一分不拿。
  // 清分数据不可用时（仿真未就绪、无乘车边）退回按上车人次摊，保证面板不会空着。
  UI.ledger = function (g) {
    R.ensure(g);
    const out = {};
    g.companies.forEach(function (c) { out[c.id] = { lines: 0, boards: 0, pkm: 0, len: 0, name: c.name, color: c.color, income: 0, outcome: 0, cleared: false }; });
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
    // 客运周转量（人·公里）：清分的依据
    const cl = CM.Clearing ? CM.Clearing.pkm(g) : null;
    if (cl && cl.total > 0) for (const k in cl.by) if (out[k]) { out[k].pkm = cl.by[k]; }
    // 优先用完整的公司损益表（票款 + 车站商业 + 补贴 − 车站/商业/车厢成本）
    const pnl = CM.Clearing && CM.Clearing.pnl ? CM.Clearing.pnl(g) : null;
    if (pnl) {
      for (const k in out) {
        const p = pnl[k];
        if (!p) { out[k].income = 0; out[k].outcome = 0; out[k].net = 0; continue; }
        out[k].fare = p.fare;
        out[k].commerce = p.commerce;
        out[k].sub = p.sub;
        out[k].share = p.share;
        out[k].pkm = p.pkm;
        out[k].cost = p.cost;
        out[k].income = p.income;
        out[k].outcome = p.cost;
        out[k].net = p.net;
        out[k].cover = p.cover;
        out[k].cleared = true;
      }
      return out;
    }
    const total = Object.keys(out).reduce(function (a, k) { return a + out[k].boards; }, 0);
    const cur = g.econ && g.econ.cur;
    const income = cur && cur.fare ? cur.fare : fareWan * 30.4;
    const outcome = cur && cur.ops ? cur.ops : 0;
    for (const k in out) {
      const share = (cl && cl.total > 0)
        ? (cl.by[k] || 0) / cl.total
        : (total > 0 ? out[k].boards / total : 0);
      out[k].fare = income * share;
      out[k].share = share;
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

    // 政府与社会资本合作：财承上限、待批项目与特许经营合同（v3.88）
    if (CM.PPP) CM.PPP.render(self, body);

    // 公司对换乘协议矩阵（v3.90）：每对公司逐对设定四档协议，替代旧版全局单档壁垒
    const ruleBox = h('div', { class: 'tk-card', style: { margin: '8px 0' } });
    ruleBox.appendChild(h('div', { class: 'row between' }, h('b', null, '公司对换乘协议'),
      h('span', { class: 'tiny muted' }, g.companies.length + ' 家 · ' + (g.companies.length * (g.companies.length - 1) / 2) + ' 对关系')));

    if (g.companies.length < 2) {
      ruleBox.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '6px' } },
        '只有一家公司时不设边界。添加第二家公司后，就能逐对设定它们之间怎么换乘。'));
    } else {
      // 每家公司一个色点，供协议行引用
      const dot = function (c) {
        return h('span', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: c.color, marginRight: '5px' } });
      };
      const cs = g.companies.slice().sort(function (a, b) { return a.id - b.id; });
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        const A = cs[i], B = cs[j];
        const cur = R.agreementLv(g, A.id, B.id);
        const rowEl = h('div', { style: { marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(128,128,128,.18)' } });
        rowEl.appendChild(h('div', { class: 'tiny', style: { marginBottom: '4px' } },
          dot(A), h('span', null, A.name), h('span', { class: 'muted' }, ' ↔ '), dot(B), h('span', null, B.name),
          h('span', { class: 'muted', style: { float: 'right' } }, R.AGREEMENT[cur].min + ' 分钟')));
        const seg = h('div', { class: 'seg-ctl sm' });
        R.AGREEMENT.forEach(function (ag, lv) {
          seg.appendChild(h('button', {
            class: lv === cur ? 'on' : '', title: ag.desc,
            onclick: function () { R.setAgreement(g, A.id, B.id, lv); changed(A.name + ' ↔ ' + B.name + '：' + ag.name); },
          }, ag.short));
        });
        rowEl.appendChild(seg);
        rowEl.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '3px' } }, R.AGREEMENT[cur].desc));
        ruleBox.appendChild(rowEl);
      }
      // 全局默认档：新增公司或未逐对设定的公司对沿用此档
      const defSeg = h('div', { class: 'seg-ctl sm', style: { marginTop: '8px' } });
      R.AGREEMENT.forEach(function (ag, lv) {
        defSeg.appendChild(h('button', { class: ((g.coRule.xfer || 0) === lv) ? 'on' : '', onclick: function () {
          g.coRule.xfer = lv; changed('默认协议设为「' + ag.name + '」');
        } }, '默认·' + ag.short));
      });
      ruleBox.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, '未单独设定的公司对，按此默认档：'));
      ruleBox.appendChild(defSeg);
    }
    ruleBox.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '6px' } },
      '壁垒越重，跨公司换乘越慢、乘客越倾向留在同一家网内——这是你手里的调控工具：直通让两网像一张网，不互通则逼乘客绕行。'));
    body.appendChild(ruleBox);

    // 清分规则：起步价归进站公司的比例。这是政府手里的第二个调控工具——
    // 调高补贴短线（进站服务由小公司承担），调低保护大网。
    const ruleOnly = function (msg) { g.touch(); self.markUnsaved(); rerender(); if (msg) self.toast(msg, 'good'); };
    const bw = (g.coRule && g.coRule.boardWeight != null) ? g.coRule.boardWeight : 0.3;
    const direct = CM.Clearing && CM.Clearing.direct ? CM.Clearing.direct(g) : null;
    const clearBox = h('div', { class: 'tk-card', style: { margin: '8px 0' } });
    if (direct) {
      // v3.89：各公司分开计价，票款是各家自己收的，不再有全网分摊，所以这里不再提供清分比例
      clearBox.appendChild(h('div', { class: 'row between' }, h('b', null, '票款计价'),
        h('span', { class: 'tiny muted' }, '各公司分开计价')));
      clearBox.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '6px' } },
        '乘客在哪家线路上坐了多少公里，就按那家的票制付钱；跨公司出行要各付一次起步价。票款是各家自己收的，不做全网分摊。'));
    } else {
      clearBox.appendChild(h('div', { class: 'row between' }, h('b', null, '票款清分'),
        h('span', { class: 'tiny muted' }, '起步价 ' + U.fmtPct(bw, 0) + ' 归进站')));
      const seg2 = h('div', { class: 'seg-ctl sm', style: { marginTop: '6px' } });
      [[0, '纯里程'], [0.3, '起步价三成'], [0.75, '起步价七成']].forEach(function (o) {
        seg2.appendChild(h('button', {
          class: Math.abs(bw - o[0]) < 0.01 ? 'on' : '',
          onclick: function () { g.coRule.boardWeight = o[0]; ruleOnly('清分规则改为「' + o[1] + '」'); },
        }, o[1]));
      });
      clearBox.appendChild(seg2);
      clearBox.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '6px' } },
        '多公司客流尚未重算完成，暂按里程与进站归属分摊；重算后会自动切换为各公司分开计价。'));
    }
    body.appendChild(clearBox);

    // 运营补贴力度：政府按月补上月运营缺口的一部分。补得越多私营公司越不会断粮，财政压力也越大。
    const sr = (g.coRule && g.coRule.subRate != null) ? g.coRule.subRate : CM.Economy.opsSubRate(g);
    const subBox = h('div', { class: 'tk-card', style: { margin: '8px 0' } });
    subBox.appendChild(h('div', { class: 'row between' }, h('b', null, '运营补贴力度'),
      h('span', { class: 'tiny muted' }, '补缺口的 ' + U.fmtPct(sr, 0))));
    const seg3 = h('div', { class: 'seg-ctl sm', style: { marginTop: '6px' } });
    [[0.5, '补一半'], [0.75, '补七成'], [1, '全额兜底']].forEach(function (o) {
      seg3.appendChild(h('button', {
        class: Math.abs(sr - o[0]) < 0.01 ? 'on' : '',
        onclick: function () {
          g.coRule.subRate = o[0];
          g.touch(); self.markUnsaved(); rerender();
          self.toast('运营补贴改为「' + o[1] + '」', 'good');
        },
      }, o[1]));
    });
    subBox.appendChild(seg3);
    subBox.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '6px' } },
      '上月票款抵不了运营成本时，政府按月补上缺口的一部分。只补一半时客流差的线路仍然亏钱，提高客流依然有回报。'));
    body.appendChild(subBox);

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
        '线路 ' + L.lines + ' 条 · 里程 ' + (L.len || 0).toFixed(1) + ' km · 日上车 ' + Math.round(L.boards) + ' 人次' +
        (L.cleared ? ' · 周转量 ' + U.fmtNum((L.pkm || 0) / 10000, 1) + ' 万人公里' : '')));
      card.appendChild(h('div', { class: 'tiny', style: { margin: '4px 0', display: 'flex', gap: '12px', flexWrap: 'wrap' } },
        h('span', { style: { color: '#0f7f5c' } }, '票款 ' + U.fmtMoney(L.fare || 0) + (L.cleared ? '（' + U.fmtPct(L.share || 0, 0) + '）' : '')),
        (L.commerce || 0) > 0.5 ? h('span', { style: { color: '#0f7f5c' } }, '商业 ' + U.fmtMoney(L.commerce)) : null,
        (L.sub || 0) > 0.5 ? h('span', { style: { color: '#185fa5' } }, '补贴 ' + U.fmtMoney(L.sub)) : null,
        h('span', { style: { color: '#b42318' } }, '成本 ' + U.fmtMoney(L.outcome || 0)),
        h('span', { style: { color: (L.net || 0) >= 0 ? '#0f7f5c' : '#b42318' } },
          '净 ' + U.fmtMoney(L.net || 0) + (L.cover != null ? ' · 覆盖 ' + U.fmtPct(L.cover, 0) : ''))));

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
