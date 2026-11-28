'use strict';
// 多公司运营（玩家总揽）：玩家把线网拆成若干家公司分别经营，全部由玩家决策。
// 数据：g.companies = [{id,name,color}]；net.lines[lid].coId = 公司 id；net.coRule = {xfer, fareShare}。
// 归属可中途划转：line.coHist = [[ymIndex, coId], ...]，按划转当月切账；票款/客流按归账月份分摊。
// 旧档没有这些字段时默认「一家公司、所有线归它」，玩法不变。
(function (CM) {
  const U = CM.U;
  const R = CM.Companies = {};

  const DEFAULT = [{ id: 0, name: '城市地铁', color: '#2b7ea8' }];
  const MAX = 10;
  const PALETTE = ['#2b7ea8', '#d4537e', '#ba7517', '#1d9e75', '#7f77dd', '#d85a30', '#639922', '#993556', '#0f6e56', '#854f0b'];
  // 公司对换乘协议（v3.90）：四档，逐对设定，不再全局统一。
  // 时间代价是「广义分钟」，加在换乘边的 eT0 上，直接改变路径选择与方式分担。
  // 四档对应现实里四种边界状态，彼此有真实物理差别，不是拍脑袋的罚时：
  R.AGREEMENT = [
    { min: 0,  name: '直通运转', short: '直通', desc: '列车互相开进、不用下车（东京私铁互通、北京 4 号线—大兴线）' },
    { min: 2.5, name: '一票换乘', short: '一票', desc: '站厅内换乘、AFC 清分，一张票通程（国内主流）' },
    { min: 8,  name: '出站换乘', short: '出站', desc: '出闸再进闸，按真实出站步行距离（上海 3/4 号线共线段、东京 JR—地铁）' },
    { min: 18, name: '不互通',   short: '不通', desc: '两网不接，乘客上街走一段再进站' },
  ];
  // 兼容旧字段：旧版 PENALTY 三档映射到新四档的最接近值
  R.PENALTY = [[0, 0], [1, 2.5], [2, 5]];
  R.penaltyName = function (lv) { return ['同集团子公司', '同集团控股', '不同集团'][lv] || '同集团控股'; };
  // 公司对 key：无序、排序，保证 (a,b) 与 (b,a) 是同一条协议
  R.pairKey = function (a, b) { a = a | 0; b = b | 0; return (a < b ? a : b) + '-' + (a < b ? b : a); };
  // 取某对公司的协议分钟数。优先逐对设定，缺失时回退全局 xfer 档（兼容旧档）。
  R.agreementMin = function (g, coA, coB) {
    coA = coA | 0; coB = coB | 0;
    if (coA === coB) return 0;                       // 同公司没有边界
    if (!R.enabled(g)) return 0;                     // 单公司不设壁垒
    const rule = g && g.coRule;
    const p = rule && rule.pairs;
    let lv = (p && p[R.pairKey(coA, coB)] != null) ? p[R.pairKey(coA, coB)] : ((rule && rule.xfer) || 0);
    lv = U.clamp(lv | 0, 0, R.AGREEMENT.length - 1);
    return R.AGREEMENT[lv].min;
  };

  R.ensure = function (g) {
    if (!g) return null;
    if (!Array.isArray(g.companies) || !g.companies.length) g.companies = DEFAULT.map(function (c) { return Object.assign({}, c); });
    if (g.companies[0] && g.companies[0].id !== 0) g.companies[0].id = 0;
    if (!g.coRule) g.coRule = { xfer: 1, fareShare: 0, boardWeight: 0.3 };
    if (g.coRule.xfer == null) g.coRule.xfer = 1;
    // 协议升为四档（v3.90）。旧档 0/1/2 是「同集团/控股/不同集团」，新档 0/1/2/3 是
    // 「直通/一票/出站/不通」；旧值直接沿用为新档序号，语义相近（都是「越强越慢」）。
    g.coRule.xfer = U.clamp(g.coRule.xfer | 0, 0, R.AGREEMENT.length - 1);
    // 公司对换乘协议：缺省逐对回退到全局 xfer 档；玩家逐对设定后写进 pairs。
    // 新增公司后不为它预建协议——未设定就沿用全局档，避免公司一多就冒出一堆默认行。
    if (!g.coRule.pairs || typeof g.coRule.pairs !== 'object' || Array.isArray(g.coRule.pairs)) g.coRule.pairs = {};
    if (g.coRule.fareShare == null) g.coRule.fareShare = 0;
    // 清分：起步价（按进站归属）占票价的比例。0 = 纯里程，0.3 = 起步价三成归进站（默认）
    if (g.coRule.boardWeight == null) g.coRule.boardWeight = 0.3;
    // 运营补贴力度（补缺口的几成）。null = 用本城配置；玩家可在多公司面板里改
    if (g.coRule.subRate === undefined) g.coRule.subRate = null;
    if (g.net && g.net.lines) for (const id in g.net.lines) {
      const L = g.net.lines[id]; if (!L) continue;
      if (L.coId == null) L.coId = 0;
      if (!Array.isArray(L.coHist) || !L.coHist.length) L.coHist = [[0, L.coId]];
    }
    return g;
  };

  R.enabled = function (g) { return !!(g && g.companies && g.companies.length > 1); };
  R.get = function (g, id) { return (g.companies || []).find(function (c) { return c.id === id; }) || g.companies[0] || DEFAULT[0]; };
  R.name = function (g, id) { return R.get(g, id).name; };
  R.color = function (g, id) { return R.get(g, id).color; };
  R.lineCo = function (L) { return (L && L.coId != null) ? L.coId : 0; };

  R.MAX = MAX;
  R.add = function (g, name) {
    R.ensure(g);
    if (g.companies.length >= MAX) return -1;
    let id = 0; while (g.companies.some(function (c) { return c.id === id; })) id++;
    g.companies.push({ id: id, name: String(name || ('第 ' + (id + 1) + ' 公司')).slice(0, 16), color: PALETTE[id % PALETTE.length] });
    return id;
  };
  R.rename = function (g, id, name) { const c = R.get(g, id); if (c) c.name = String(name || '').slice(0, 16) || c.name; };
  R.recolor = function (g, id, color) { const c = R.get(g, id); if (c && /^#[0-9a-f]{6}$/i.test(color)) c.color = color; };
  R.remove = function (g, id) {
    R.ensure(g);
    if (id === 0 || g.companies.length < 2) return false;
    g.companies = g.companies.filter(function (c) { return c.id !== id; });
    for (const lid in g.net.lines) if (R.lineCo(g.net.lines[lid]) === id) R.assign(g, lid, 0);
    // 删掉含该公司的逐对协议，避免残留孤儿 key
    if (g.coRule && g.coRule.pairs) for (const k in g.coRule.pairs) {
      const ab = k.split('-'); if (+ab[0] === id || +ab[1] === id) delete g.coRule.pairs[k];
    }
    return true;
  };

  // 划转：按当前游戏年月记入 coHist，之后分账按月份切
  R.assign = function (g, lid, coId) {
    R.ensure(g);
    const L = g.net && g.net.lines[lid]; if (!L) return false;
    if (!g.companies.some(function (c) { return c.id === coId; })) return false;
    if (R.lineCo(L) === coId) return false;
    const idx = typeof g.ym === 'function' ? +g.ym() : ((CM.CFG ? CM.CFG.START.y : 2030) * 12);
    L.coId = coId;
    (L.coHist || (L.coHist = [])).push([idx, coId]);
    return true;
  };
  R.coAt = function (L, ymIndex) {
    const hist = L && L.coHist; if (!hist || !hist.length) return R.lineCo(L);
    let co = hist[0][1];
    for (const h of hist) { if (h[0] <= ymIndex) co = h[1]; else break; }
    return co;
  };

  // 设定某对公司的协议档。lv=null 表示清除逐对设定、回退全局档。
  R.setAgreement = function (g, coA, coB, lv) {
    R.ensure(g);
    const p = g.coRule.pairs, k = R.pairKey(coA, coB);
    if (lv == null || lv === (g.coRule.xfer || 0)) delete p[k];
    else p[k] = U.clamp(lv | 0, 0, R.AGREEMENT.length - 1);
    return R.agreementMin(g, coA, coB);
  };
  // 取当前生效的协议档（供 UI 高亮）：逐对设定优先，否则全局档
  R.agreementLv = function (g, coA, coB) {
    const p = g.coRule && g.coRule.pairs, k = R.pairKey(coA, coB);
    let lv = (p && p[k] != null) ? p[k] : ((g.coRule && g.coRule.xfer) || 0);
    return U.clamp(lv | 0, 0, R.AGREEMENT.length - 1);
  };

  // 跨公司换乘惩罚：按两线所属公司逐对查协议；同公司或单公司为 0。
  R.xferPenalty = function (g, lineA, lineB) {
    if (!R.enabled(g) || !lineA || !lineB || lineA === lineB) return 0;
    return R.agreementMin(g, R.lineCo(lineA), R.lineCo(lineB));
  };
  // 从 net 中取公司规则供 sim 使用（挂在 net.coRule，见 game.js）
  R.ruleFromNet = function (net) { return (net && net.coRule) || { xfer: 1, fareShare: 0 }; };
})(window.CM);
