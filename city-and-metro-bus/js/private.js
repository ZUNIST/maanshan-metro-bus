'use strict';
// 私营铁路公司（v3.91）
// ---------------------------------------------------------------------------
// 一个独立法人主体：有自己的名字、资本金与账目，每 6 个月自己判断要不要修线。
//   1) 先看自己的钱够不够付整条线的造价（自有资金优先，不举债，避免票价覆盖不了本息时必破产）；
//   2) 够了就自己开工，建成后线路归它，票款按清分口径记在它名下，不向政府要一分建设费；
//   3) 不够就把这条走廊做成一份 PPP 提案交给政府（见 ppp.js），批不批由玩家决定。
// 自有资金的滚动：每月 票款 + 政策运营补贴 + PPP 可用性付费 − 运营成本。
// 注意：集团账户仍按原口径记账（票款入账、运营成本支出、补贴照发），
//       私营公司的「自有资金」是它自己的投资账，不从这里二次划扣——所以不会重复计费。
(function (CM) {
  const U = CM.U;
  const P = CM.Private = {};

  P.REVIEW_MONTHS = 6;     // 每 6 个月评估一次
  P.SEED_YEARS = 0.45;     // 初始自有资金 ≈ 本级年度财政额度 × 0.45
  P.SEED_MIN = 20000;      // 万元
  P.SEED_MAX = 4000000;
  P.MAX_SELF = 6;          // 自有资金自建的线路上限（再多就转 PPP，避免一家独吞全城）
  P.PROP_TTL = 12;         // 提案未批复超过 12 个月自动撤回

  // 只有马鞍山、和县两张图的私营主体叫「宁马轨道交通」（宁马城际的现实投资主体）
  const MS_HX = { ms: 1, ms27: 1, ms30: 1, hx: 1, hx27: 1 };
  // 主要城市给一组更贴地的字号；其余城市从本图片区名里取（regions 的「××区/县/镇」）
  const LOCAL = {
    bj: ['京华', '燕山', '西山', '通惠'], sh: ['申城', '黄浦', '吴淞', '沪西'],
    gz: ['岭南', '珠江', '五羊', '白云'], sz: ['鹏城', '深南', '南山', '梧桐'],
    nj: ['金陵', '秦淮', '江宁', '钟山'], hz: ['钱塘', '西湖', '之江', '运河'],
    wh: ['江城', '汉阳', '楚天', '东湖'], hk: ['香江', '九龙', '维港', '新界'],
    tk: ['武藏野', '多摩川', '城西', '京滨'], ny: ['曼哈顿', '布鲁克林', '哈德逊', '皇后'],
    ny1900: ['曼哈顿', '布鲁克林', '哈德逊', '皇后'], pa: ['塞纳', '蒙马特', '左岸'],
    ld: ['泰晤士', '格林尼治', '伦敦城'], mi: ['比斯坎', '珊瑚', '迈阿密'],
    sg: ['狮城', '海峡', '裕廊'], sg1980: ['狮城', '海峡', '裕廊'],
    tp: ['淡水', '艋舺', '大稻埕'], sy: ['悉尼', '帕拉马塔', '港湾'],
  };
  const SUFFIX = ['轨道交通', '铁道', '交通'];

  P.mapId = function (g) {
    return (g && g.mapId) || CM.mapId || '';
  };
  // 私营主体的名字：宁马两张图固定，其余按本地地名生成（序号不同则名字不同）
  P.nameFor = function (g, seq) {
    const id = P.mapId(g);
    if (MS_HX[id]) return '宁马轨道交通';
    const pool = (LOCAL[id] || []).slice();
    const m = CM.MAPS && CM.MAPS[id];
    const regs = m && m.data && m.data.regions;
    if (regs) for (const r of regs) {
      const n = String((r && r.name) || '').replace(/(新区|区|县|市|镇|街道|乡)$/, '');
      if (n.length >= 2 && n.length <= 3 && pool.indexOf(n) < 0) pool.push(n);
    }
    if (!pool.length) { const nm = (m && m.name) || '城市'; pool.push(nm.slice(0, 2)); }
    const i = Math.abs(seq | 0) % pool.length;
    return pool[i] + SUFFIX[Math.abs(seq | 0) % SUFFIX.length];
  };

  P.enabled = function (g) {
    if (!g || !g.econ) return false;
    if (g.econ.isFree && g.econ.isFree()) return false;          // 自由建设模式没有财政，也就没有市场
    if (P.mapId(g) === 'tutorial') return false;                // 新手教程不引入私铁
    return !!(CM.Companies && CM.AIRoute && CM.PPP);
  };

  P.ensure = function (g) {
    if (!g) return null;
    if (!g.priv || typeof g.priv !== 'object') g.priv = {};
    if (g.priv.base == null) g.priv.base = (typeof g.ym === 'function' ? g.ym() : 0);
    if (g.priv.seq == null) g.priv.seq = 0;
    return g.priv;
  };

  // 初始自有资金：按本级年度财政额度折算。私铁集团是有资产的市场主体，
  // 这笔钱对应它的资本金，够修一到两条线；之后靠自己经营与 PPP 收入滚动。
  P.seed = function (g) {
    const E = g && g.econ;
    if (!E || !E.grantFor || !g.clock) return P.SEED_MIN;
    const year = E.grantFor(g.clock.y, g.clock.m) * 12;
    return U.clamp(year * P.SEED_YEARS, P.SEED_MIN, P.SEED_MAX);
  };

  P.org = function (g) {
    const R = CM.Companies;
    if (!R) return null;
    R.ensure(g);
    let c = (g.companies || []).find(function (x) { return x.kind === 'private'; });
    if (c) {
      if (!c.fin) c.fin = { cash: P.seed(g), built: 0 };
      return c;
    }
    // 旧档迁移：v3.88–v3.90 的 AI 私营公司没有 kind 字段，按名字认领，避免多出一家
    const nm = P.nameFor(g, P.ensure(g).seq);
    const legacy = (g.companies || []).find(function (x) { return !x.kind && x.name === nm; });
    if (legacy) { legacy.kind = 'private'; legacy.fin = { cash: P.seed(g), built: 0 }; return legacy; }
    const s = P.ensure(g);
    const id = R.add(g, nm);
    if (id < 0) return null;                     // 公司数已满
    c = R.get(g, id);
    c.kind = 'private';
    c.color = '#d4537e';
    c.fin = { cash: P.seed(g), built: 0 };
    s.seq++;
    if (g.logEvent) g.logEvent({
      tag: '经营', title: '私营铁路公司成立',
      desc: c.name + ' 成立，注册资本 ' + U.fmtMoney(c.fin.cash) + '；它每 6 个月自行评估一次线路投资，够钱就自己修，不够就来找政府谈 PPP。',
    });
    return c;
  };

  P.isPrivate = function (g, id) {
    const c = g && g.companies && g.companies.find(function (x) { return x.id === id; });
    return !!(c && c.kind === 'private');
  };

  // ---------------- 月度：记自己的账 ----------------
  P.settle = function (g, c) {
    const fin = c.fin || (c.fin = { cash: P.seed(g), built: 0 });
    const pnl = (CM.Clearing && CM.Clearing.pnl) ? CM.Clearing.pnl(g) : null;
    const p = pnl && pnl[c.id];
    const fare = p ? (p.fare || 0) : 0;
    const sub = p ? (p.sub || 0) : 0;
    const ops = p ? ((p.stationOps || 0) + (p.train || 0)) : 0;
    let ap = 0;
    const s = CM.PPP && CM.PPP.ensure(g);
    if (s) for (const k of s.contracts) {
      if (k.orgId === c.id && k.state === 'run' && k.funded !== 'self') ap += (k.apM || 0);
    }
    const net = fare + sub + ap - ops;
    fin.cash = (fin.cash || 0) + net;
    fin.ym = typeof g.ym === 'function' ? g.ym() : null;
    fin.fare = fare; fin.sub = sub; fin.ops = ops; fin.ap = ap; fin.net = net;
    return net;
  };

  // ---------------- 每 6 个月：自己判断修不修 ----------------
  P.monthly = function (g) {
    if (!P.enabled(g)) return;
    const s = P.ensure(g);
    const c = P.org(g);
    if (!c) return;
    P.settle(g, c);
    const ym = typeof g.ym === 'function' ? g.ym() : 0;
    if (CM.PPP && CM.PPP.expire) CM.PPP.expire(g, ym);
    if (ym <= s.base) return;
    if ((ym - s.base) % P.REVIEW_MONTHS !== 0) return;
    P.review(g, c, ym);
  };

  P.review = function (g, c, ym) {
    const s = CM.PPP && CM.PPP.ensure(g);
    if (!s) return null;
    // 「目前无建设项目」：既没有在建合同，也没有待批提案
    if (s.contracts.some(function (k) { return k.orgId === c.id && k.state === 'build'; })) return null;
    if (s.props.some(function (p) { return p.orgId === c.id; })) return null;
    const A = CM.AIRoute;
    if (!A || !A.choose) return null;
    const pick = A.choose(g, c.id, { tryN: 8 });
    if (!pick || !pick.ok) {
      P.note(g, c, ym, '这次没找到值得修的走廊（密度或覆盖不达标），半年后再看。');
      return null;
    }
    const capex = pick.est.cost || 0;
    const cash = c.fin ? (c.fin.cash || 0) : 0;
    const selfCount = (s.contracts.filter(function (k) { return k.orgId === c.id && k.funded === 'self'; }).length) + P.selfLines(g, c);
    if (cash >= capex && selfCount < P.MAX_SELF) return P.startSelf(g, c, pick, ym);
    if (cash >= capex) {
      P.note(g, c, ym, '自有资金够，但自有线路已有 ' + selfCount + ' 条（上限 ' + P.MAX_SELF + '），这条改成申请 PPP。');
    } else {
      P.note(g, c, ym, '自有资金 ' + U.fmtMoney(cash) + ' 不够这条线 ' + U.fmtMoney(capex) + '，转为向政府申请 PPP。');
    }
    const r = CM.PPP.propose(g, c.id, pick);
    if (!r.ok && r.why) P.note(g, c, ym, (c.fin.lastNote || '') + '（' + r.why + '）');
    return r;
  };

  // 自有资金自建的线（已通车，不含 PPP 合同里的）
  P.selfLines = function (g, c) {
    let n = 0;
    for (const lid in (g.net && g.net.lines)) {
      const L = g.net.lines[lid];
      if (L && !L.rail && L.owner === c.id) n++;
    }
    return n;
  };

  P.startSelf = function (g, c, pick, ym) {
    const s = CM.PPP.ensure(g);
    const route = pick.route, est = pick.est;
    const capex = est.cost || 0;
    const km = route.km || 0;
    const months = Math.round(U.clamp(km * 4, 24, 60));
    c.fin.cash = (c.fin.cash || 0) - capex;
    const key = 's' + (s.nextId++);
    s.contracts.push({
      id: key, title: c.name + ' · ' + km.toFixed(1) + ' km', orgId: c.id,
      apM: 0, ask: 0, years: 0, funded: 'self',
      route: { pts: route.pts, stations: route.stations, km: km },
      km: km, equity: capex, start: ym, buildMonths: months, state: 'build', lineId: null, paid: 0,
    });
    s.cdUntil = ym + CM.PPP.CD_MONTHS;
    c.fin.built = (c.fin.built || 0) + 1;
    P.note(g, c, ym, '自有资金 ' + U.fmtMoney(capex) + ' 自建 ' + km.toFixed(1) + ' km / ' + route.stations.length + ' 站，不申请政府付费。');
    if (g.logEvent) g.logEvent({
      tag: '建设', title: '私营铁路自建开工',
      desc: c.name + ' 自筹 ' + U.fmtMoney(capex) + ' 建设 ' + km.toFixed(1) + ' km、' + route.stations.length + ' 站，工期 ' + months + ' 个月。建成后线路归它所有，票款记在它名下，政府不付建设费。',
    });
    return { ok: true, self: true };
  };

  P.note = function (g, c, ym, text) {
    if (!c.fin) c.fin = { cash: P.seed(g), built: 0 };
    c.fin.lastNote = text;
    c.fin.lastReview = ym;
  };

  // 下次评估还有几个月（面板显示用）
  P.nextReview = function (g, c) {
    const s = P.ensure(g);
    const ym = typeof g.ym === 'function' ? g.ym() : 0;
    if (ym <= s.base) return s.base + P.REVIEW_MONTHS - ym;
    const k = Math.ceil((ym - s.base) / P.REVIEW_MONTHS);
    return s.base + k * P.REVIEW_MONTHS - ym;
  };
})(window.CM);
