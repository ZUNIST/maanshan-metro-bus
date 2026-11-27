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
  // 跨公司换乘惩罚档位（广义分钟）：关闭 / 温和 / 明显。加在换乘边的 eT0 上，影响路径选择与分担率。
  R.PENALTY = [[0, 0], [1, 2.5], [2, 5]];
  R.penaltyName = function (lv) { return ['不设壁垒', '有点意思', '真分家'][lv] || '有点意思'; };

  R.ensure = function (g) {
    if (!g) return null;
    if (!Array.isArray(g.companies) || !g.companies.length) g.companies = DEFAULT.map(function (c) { return Object.assign({}, c); });
    if (g.companies[0] && g.companies[0].id !== 0) g.companies[0].id = 0;
    if (!g.coRule) g.coRule = { xfer: 1, fareShare: 0 };
    if (g.coRule.xfer == null) g.coRule.xfer = 1;
    if (g.coRule.fareShare == null) g.coRule.fareShare = 0;
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

  // 跨公司换乘惩罚：档位 0/1/2 → 0/2.5/5 分钟；同公司或单公司为 0
  R.xferPenalty = function (g, lineA, lineB) {
    if (!R.enabled(g) || !lineA || !lineB || lineA === lineB) return 0;
    if (R.lineCo(lineA) === R.lineCo(lineB)) return 0;
    const lv = (g.coRule && g.coRule.xfer) || 0;
    const row = R.PENALTY[lv] || R.PENALTY[1];
    return row[1];
  };
  // 从 net 中取公司规则供 sim 使用（挂在 net.coRule，见 game.js）
  R.ruleFromNet = function (net) { return (net && net.coRule) || { xfer: 1, fareShare: 0 }; };
})(window.CM);
