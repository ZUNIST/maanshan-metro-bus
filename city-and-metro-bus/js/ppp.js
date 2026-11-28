'use strict';
// 政府与社会资本合作（PPP，v3.88）
// ---------------------------------------------------------------------------
// 玩家是发包的政府，AI 私营公司是投标人。私营公司不靠票款赚钱——国内票价下人公里收入
// 只有日本私铁的三分之一（见 airoute.js 的 A.estimate 注释），一条线最多覆盖五成运营成本，
// 剩下的靠政府付的「可用性付费」。这正是中国轨道交通的实际投融资体制。
//
// 财承上限：现实规则是「PPP 支出责任不超过一般公共预算支出的 10%」。
// 游戏里的对应物是年度财政额度（grantFor × 12），即本级财政能用于轨交的钱。
// 超过上限就不批新项目——这让 PPP 成为稀缺资源，也让 AI 的扩张速度天然受限。
//
// 合同生命周期：
//   prop（提议） → sign（签约，计入支出责任、开放施工） → build（施工 30–72 个月）
//   → run（通车，每月支付可用性付费） → ended（特许期满，资产移交政府）
(function (CM) {
  const U = CM.U, R = CM.Companies;
  const P = CM.PPP = {};

  P.CAP_SHARE = 0.10;      // 可用性付费总额 ≤ 年度财政额度的 10%
  P.CD_MONTHS = 30;        // 开工后的冷静期（从开工起算，放弃不重置）
  P.MAX_BUILDING = 2;      // 同时在建上限
  P.HAGGLE = 0.12;         // 每次压价的幅度
  P.HAGGLE_BACKBONE = 0.40; // 票款覆盖高于此值，AI 有底气拒绝压价

  P.ensure = function (g) {
    if (!g) return null;
    if (!g.ppp) g.ppp = {};
    const s = g.ppp;
    if (!Array.isArray(s.props)) s.props = [];
    if (!Array.isArray(s.contracts)) s.contracts = [];
    if (s.nextId == null) s.nextId = 1;
    if (s.cdUntil == null) s.cdUntil = 0;
    return s;
  };

  // ---------------- 财承 ----------------
  // 年度上限（万元/年）= 本级年度财政额度 × 10%
  P.capYear = function (g) {
    const E = g && g.econ;
    if (!E || !E.grantFor || E.isFree && E.isFree()) return 0;
    const q = E.grantFor(g.clock.y, g.clock.m) * 12;
    return Math.max(0, q) * P.CAP_SHARE;
  };
  P.capMonth = function (g) { return P.capYear(g) / 12; };
  // 已承诺（万元/月）：签约即形成支出责任，施工期也算
  P.committed = function (g) {
    const s = P.ensure(g);
    let v = 0;
    for (const c of s.contracts) if (c.state !== 'ended') v += c.apM || 0;
    return v;
  };
  P.headroom = function (g) { return Math.max(0, P.capMonth(g) - P.committed(g)); };
  P.usage = function (g) { const cap = P.capMonth(g); return cap > 0 ? P.committed(g) / cap : 0; };

  // ---------------- AI 主体 ----------------
  // 第一家私营公司按需创建。名字用真实的安徽/马鞍山轨交投资主体风格。
  P.aiOrg = function (g) {
    R.ensure(g);
    let org = (g.companies || []).find(function (c) { return c.kind === 'private'; });
    if (org) return org.id;
    const id = R.add(g, '宁马轨道交通');
    if (id < 0) return -1;
    const c = R.get(g, id);
    if (c) { c.kind = 'private'; c.color = '#d4537e'; }
    return id;
  };

  // ---------------- 提议 ----------------
  P.propose = function (g, orgId) {
    const A = CM.AIRoute;
    if (!A || !A.choose || !A.bid) return { ok: false, why: '线路生成器不可用' };
    const s = P.ensure(g);
    if (s.props.length) return { ok: false, why: '已有待批项目' };
    if (g.ym() < s.cdUntil) return { ok: false, why: '冷静期还有 ' + (s.cdUntil - g.ym()) + ' 个月' };
    const building = s.contracts.filter(function (c) { return c.state === 'build'; }).length;
    if (building >= P.MAX_BUILDING) return { ok: false, why: '在建项目已达 ' + P.MAX_BUILDING + ' 条上限' };
    const pick = A.choose(g, orgId, { tryN: 8 });
    if (!pick) return { ok: false, why: '没有值得修的走廊（密度不足或已被覆盖）' };
    const bid = A.bid(g, pick.route);
    const prop = {
      id: s.nextId++, orgId: orgId,
      route: { pts: pick.route.pts, stations: pick.route.stations, km: pick.route.km },
      bid: bid, apM: bid.ask / 12, years: bid.years,
      buildMonths: Math.round(U.clamp(bid.km * 4, 30, 72)),
      haggle: 0,
    };
    prop.afford = prop.apM <= P.headroom(g) + 1e-6;
    s.props.push(prop);
    return { ok: true, prop: prop };
  };

  // 压价：AI 让一步，但项目本身好的时候它会拒绝并撤回提议（它有别的买家/更好的用途）
  P.haggle = function (g, prop) {
    const s = P.ensure(g);
    const i = s.props.indexOf(prop);
    if (i < 0) return { ok: false, why: '项目不存在' };
    if ((prop.bid && prop.bid.cover || 0) >= P.HAGGLE_BACKBONE) {
      s.props.splice(i, 1);
      return { ok: false, withdrawn: true, why: '对方撤回提议：这条线票款能覆盖 ' + Math.round(prop.bid.cover * 100) + '%，不愁没人接' };
    }
    if (prop.haggle >= 2) return { ok: false, why: '已经压过两次，对方不再让步' };
    prop.haggle += 1;
    prop.apM = prop.apM * (1 - P.HAGGLE);
    prop.bid.ask = prop.bid.ask * (1 - P.HAGGLE);
    prop.afford = prop.apM <= P.headroom(g) + 1e-6;
    return { ok: true, prop: prop };
  };

  P.reject = function (g, prop) {
    const s = P.ensure(g);
    const i = s.props.indexOf(prop);
    if (i < 0) return false;
    s.props.splice(i, 1);
    return true;
  };

  // ---------------- 签约 ----------------
  P.sign = function (g, prop) {
    const s = P.ensure(g);
    const i = s.props.indexOf(prop);
    if (i < 0) return { ok: false, why: '项目不存在' };
    if (prop.apM > P.headroom(g) + 1e-6) return { ok: false, why: '超出财政承受能力（剩余 ' + U.fmtMoney(P.headroom(g)) + '/月）' };
    const ym = g.ym(), org = prop.orgId;
    const c = {
      id: 'p' + prop.id, title: R.name(g, org) + ' · ' + prop.route.km.toFixed(1) + ' km',
      orgId: org, apM: prop.apM, ask: prop.bid.ask, years: prop.years,
      route: prop.route, km: prop.route.km, equity: prop.bid.capex,
      start: ym, buildMonths: prop.buildMonths, state: 'build',
      lineId: null, paid: 0, haggle: prop.haggle,
    };
    s.props.splice(i, 1);
    s.contracts.push(c);
    s.cdUntil = ym + P.CD_MONTHS;
    return { ok: true, contract: c };
  };

  // ---------------- 月度 ----------------
  // 只在数据层改线网（netVersion++），不在这里 refreshOperations：
  // 本函数运行于月结算中段，此时替换 this.compiled 会让当月的 recordHistory 读到空模型。
  // 下一处 trafficDue 会因 netVersion 变化重新编译。
  P.monthly = function (g) {
    const s = P.ensure(g);
    const ym = g.ym();
    const E = g.econ;
    for (const c of s.contracts) {
      if (c.state === 'build') {
        if (ym - c.start < c.buildMonths) continue;
        const done = P.finish(g, c);
        if (done) c.state = 'run';
        continue;
      }
      if (c.state === 'run') {
        if (ym - c.start >= c.buildMonths + c.years * 12) {
          c.state = 'ended';
          if (c.lineId != null && R.lineCo(g.net.lines[c.lineId]) === c.orgId) R.assign(g, c.lineId, 0);   // 特许期满移交政府
          if (g.logEvent) g.logEvent({ tag: '经营', title: '特许经营期满', desc: c.title + ' 移交政府，转入公营线网。' });
          continue;
        }
        if (E && !E.isFree()) {
          E.spend('pppOut', c.apM);
          E.log('pppOut', -c.apM, 'ppp', '可用性付费：' + c.title, { y: g.clock.y, m: g.clock.m, d: 1 });
          c.paid = (c.paid || 0) + c.apM;
        }
      }
    }
  };

  // 施工完成：把线真正写进线网，产权归私营公司
  P.finish = function (g, c) {
    const A = CM.AIRoute;
    if (!A || !A.apply || !c.route) return false;
    const color = R.color(g, c.orgId);
    const r = A.apply(g, { ok: true, pts: c.route.pts, stations: c.route.stations, km: c.route.km },
      { name: R.name(g, c.orgId) + ' ' + (c.title.split('·')[1] || '').trim(), color: color, owner: c.orgId, coId: c.orgId });
    if (!r || !r.ok) return false;
    c.lineId = r.lineId;
    g.netVersion = (g.netVersion || 0) + 1;
    // 月结算中段不能直接换网（recordHistory 会读到空模型），标脏由月底统一刷新
    g._pppDirty = true;
    if (g.logEvent) g.logEvent({ tag: '建设', title: '私营铁路通车', desc: c.title + ' 建成通车（' + c.route.km.toFixed(1) + ' km），特许经营 ' + c.years + ' 年，可用性付费 ' + U.fmtMoney(c.apM) + '/月。' });
    return true;
  };

  // ---------------- 面板 ----------------
  P.render = function (self, body) {
    const g = self.g(), h = U.h;
    R.ensure(g);
    const s = P.ensure(g);
    const rerender = function () { self.renderPage(false); };

    const cap = P.capMonth(g), used = P.committed(g), left = P.headroom(g);
    const box = h('div', { class: 'tk-card', style: { margin: '8px 0' } });
    box.appendChild(h('div', { class: 'row between' },
      h('b', null, '政府与社会资本合作'),
      h('span', { class: 'tiny', style: { whiteSpace: 'nowrap', flexShrink: '0', color: left > 0 ? '#0f7f5c' : '#b42318' } },
        '剩余 ' + U.fmtMoney(left))));
    box.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '4px' } },
      '可用性付费总额不得超过年度财政额度的 ' + Math.round(P.CAP_SHARE * 100) + '%（现实财承上限）。已承诺 ' + U.fmtMoney(used) + '/月 · 上限 ' + U.fmtMoney(cap) + '/月'));
    const bar = h('div', { style: { height: '4px', background: 'var(--color-background-tertiary)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' } });
    bar.appendChild(h('div', { style: { height: '100%', width: Math.min(100, cap > 0 ? used / cap * 100 : 0).toFixed(1) + '%', background: used / cap > 0.9 ? '#c0392b' : '#2b7ea8' } }));
    box.appendChild(bar);
    body.appendChild(box);

    // 待批项目
    if (s.props.length) {
      for (const prop of s.props.slice()) {
        const b = prop.bid || {};
        const card = h('div', { class: 'tk-card', style: { margin: '8px 0', borderLeft: '3px solid #d4537e' } });
        card.appendChild(h('div', { class: 'row between' },
          h('b', null, '待批：' + R.name(g, prop.orgId) + ' 申请新建 ' + (prop.route.km || 0).toFixed(1) + ' km'),
          h('span', { class: 'badge ' + (prop.afford ? 'b-green' : 'b-red') }, prop.afford ? '财承内' : '超出财承')));
        card.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '4px', lineHeight: '1.7' } },
          (prop.route.stations || []).length + ' 站 · 社会资本出资 ' + U.fmtMoney(b.capex || 0) +
          ' · 工期 ' + prop.buildMonths + ' 个月 · 特许经营 ' + prop.years + ' 年'));
        card.appendChild(h('div', { class: 'tiny', style: { marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' } },
          h('span', null, '年票款 ' + U.fmtMoney(b.fareY || 0)),
          h('span', null, '年运营 ' + U.fmtMoney(b.opexY || 0)),
          h('span', { style: { color: '#b42318' } }, '年缺口 ' + U.fmtMoney(b.gap || 0)),
          h('span', null, '票款覆盖 ' + Math.round((b.cover || 0) * 100) + '% · 密度 ' + Math.round(b.density || 0) + ' 人/km·日')));
        card.appendChild(h('div', { class: 'row', style: { marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm primary', onclick: function () {
            const r = P.sign(g, prop);
            if (!r.ok) return self.toast(r.why, 'bad');
            g.touch(); self.markUnsaved(); rerender();
            self.toast('已签约：' + U.fmtMoney(prop.apM) + '/月，' + prop.buildMonths + ' 个月后通车', 'good');
          } }, '批准 · ' + U.fmtMoney(prop.apM) + '/月'),
          h('button', { class: 'btn sm', onclick: function () {
            const r = P.haggle(g, prop);
            g.touch(); self.markUnsaved(); rerender();
            self.toast(r.ok ? '压价成功，现为 ' + U.fmtMoney(prop.apM) + '/月' : r.why, r.ok ? 'good' : 'bad');
          } }, '压价 12%'),
          h('button', { class: 'btn sm', onclick: function () {
            P.reject(g, prop); g.touch(); self.markUnsaved(); rerender();
            self.toast('已否决。要自己建，直接在地图上规划这条线即可', 'info');
          } }, '否决')));
        body.appendChild(card);
      }
    } else {
      const ym = g.ym();
      const cooling = ym < s.cdUntil;
      const building = s.contracts.filter(function (c) { return c.state === 'build'; }).length;
      const btnBox = h('div', { class: 'tk-card', style: { margin: '8px 0' } });
      btnBox.appendChild(h('div', { class: 'row between' },
        h('b', null, '征询私营公司意向'),
        h('span', { class: 'tiny muted' }, cooling ? ('冷静期 ' + (s.cdUntil - ym) + ' 个月') : ('在建 ' + building + '/' + P.MAX_BUILDING))));
      btnBox.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '4px' } },
        '让对方去找一条值得修的走廊，报出它要的可用性付费。沉默期 30 个月、同时在建最多 2 条。'));
      btnBox.appendChild(h('div', { style: { marginTop: '6px' } },
        h('button', { class: 'btn sm', disabled: cooling || building >= P.MAX_BUILDING ? '' : null, onclick: function () {
          const org = P.aiOrg(g);
          if (org < 0) return self.toast('公司数量已满', 'bad');
          const r = P.propose(g, org);
          if (!r.ok) return self.toast(r.why, 'bad');
          g.touch(); self.markUnsaved(); rerender();
          self.toast('收到一份新的项目申请', 'good');
        } }, cooling ? '冷静期中' : '征询意向')));
      body.appendChild(btnBox);
    }

    // 合同
    const live = s.contracts.filter(function (c) { return c.state !== 'ended'; });
    if (live.length) {
      const list = h('div', { class: 'tk-card', style: { margin: '8px 0' } });
      list.appendChild(h('b', null, '特许经营合同 ' + live.length));
      const ym = g.ym();
      for (const c of live) {
        const el = Math.max(0, ym - c.start);
        const build = c.state === 'build';
        const prog = build ? Math.min(1, el / Math.max(1, c.buildMonths)) : 1;
        list.appendChild(h('div', { class: 'tiny', style: { marginTop: '6px', paddingTop: '6px', borderTop: '0.5px solid var(--color-border-tertiary)' } },
          h('div', { class: 'row between' },
            h('span', null, c.title),
            h('span', { style: { color: build ? '#854f0b' : '#0f7f5c' } }, build ? ('施工 ' + Math.round(prog * 100) + '%') : ('运营中 · 已付 ' + U.fmtMoney(c.paid || 0)))),
          h('div', { class: 'tiny muted' }, U.fmtMoney(c.apM) + '/月 · ' + c.years + ' 年 · ' + (build ? ('剩 ' + Math.max(0, c.buildMonths - el) + ' 个月通车') : '特许期剩 ' + Math.max(0, c.years * 12 - (el - c.buildMonths)) + ' 个月'))));
      }
      body.appendChild(list);
    }
  };
})(window.CM || (window.CM = {}));
