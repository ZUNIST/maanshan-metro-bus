// 区域经济图层：按区（区县）与片区两级统计人口与 GDP，供「区域经济」分析图层着色与标注。
// 数据口径：
//   · 人口 / 岗位直接取城市每格的实际值（city.pop / city.jobs），随城市发展、地铁带动而变。
//   · 全城 GDP 取宏观模型（CM.Macro.view(g).fc.nom 为当年名义 GDP，万元）；
//     各区 GDP = 全城 GDP × 该区岗位 / 全城岗位。岗位占比口径与宏观模型「每岗位生产率」一致。
//   · 没有宏观模型的地图（虚构教程）退回按人口占比分摊一份估算 GDP，只作展示。
// 统计分区：
//   · 大区（区县）：优先用数据的 D.districtTier 指明；否则从 districtLabels 中识别区县级名称，
//     把每个片区（city.regions）按质心归到最近的大区锚点；没有区县标签时大区 = 片区。
//   · 片区：city.regions，每个格已有归属，统计精确。
(function (CM) {
  'use strict';
  const U = CM.U;

  // 从 districtLabels 中挑出区县级：数组元素为字符串（街道/镇名列表）的是区县；
  // 坐标为数字的点位通常只是乡镇标注，除非名称带「区/县/新区/港/市」。D.districtTier 可显式覆盖。
  function districtAnchors(city) {
    const D = CM.DATA || {}, labels = city.districtLabels || [];   // city 版已把街道名换算成 [name, x, y]
    if (!labels.length) return [];
    // 原始 D.districtLabels 里「第二项是街道名数组」的即区县级；city 版把它换算成了坐标
    const raw = D.districtLabels || [];
    const tier = new Set(raw.filter(function (d) { return Array.isArray(d[1]) && typeof d[1][0] === 'string'; }).map(function (d) { return d[0]; }));
    // 坐标形式的区级新区（如郑蒲港）也纳入
    for (const d of raw) if (d[1] && typeof d[1][0] === 'number' && /区$|县$|新区$|港$|市$/.test(d[0])) tier.add(d[0]);
    if (Array.isArray(D.districtTier) && D.districtTier.length) { tier.clear(); D.districtTier.forEach(function (n) { tier.add(n); }); }
    const named = new Map(labels.map(function (d) { return [d[0], [d[0], d[1], d[2]]]; }));
    let pick = Array.from(tier).map(function (n) { return named.get(n); }).filter(Boolean);
    // 没有任何区县级标记时，取 city.districtLabels 前若干「区/县/新区」名的项；再不行就用全部（退化为按片区）
    if (!pick.length) pick = labels.filter(function (d) { return /区$|县$|新区$|港$|市$/.test(d[0]); });
    if (!pick.length) pick = labels;
    return pick.filter(function (d) { return isFinite(d[1]) && isFinite(d[2]); })
      .map(function (d) { return { name: d[0], x: d[1], y: d[2], jobs: 0, pop: 0, gdp: 0, children: [] }; });
  }

  // 全城 GDP（万元，名义）。优先当年预测，其次最近结算年，最后用 gdp0 折算。
  function cityGDP(g) {
    const mv = CM.Macro && CM.Macro.view && CM.Macro.view(g);
    if (mv && mv.fc && isFinite(mv.fc.nom) && mv.fc.nom > 0) return mv.fc.nom;
    if (mv && mv.last && isFinite(mv.last.nom) && mv.last.nom > 0) return mv.last.nom;
    const c = CM.Macro && CM.Macro.config && CM.Macro.config();
    return c && c.gdp0 > 0 ? c.gdp0 : 0;
  }

  const EconLayer = {
    // 统计结果按「城市版本 + 月份 + 宏观版本」缓存；返回 { list, districts, total, gdp, unit }
    stats: function (g) {
      if (!g || !g.city) return null;
      const city = g.city, D = CM.DATA || {};
      const mv = g.macro && g.macro.gv || 0;
      const key = [city.uid || 0, city.version, g.clock.y, g.clock.m, mv, D.city || ''].join('|');
      if (this._cache && this._cache.key === key) return this._cache.data;
      const regions = city.regions, N = city.N, W = city.W;
      // 逐格累加到片区
      const rpop = new Float64Array(regions.length), rjobs = new Float64Array(regions.length);
      let tpop = 0, tjobs = 0;
      for (let c = 0; c < N; c++) {
        const p = city.pop[c] || 0, j = city.jobs[c] || 0;
        if (!p && !j) continue;
        rpop[city.region[c]] += p; rjobs[city.region[c]] += j; tpop += p; tjobs += j;
      }
      const gdp = cityGDP(g), rate = tjobs > 0 ? gdp / tjobs : (tpop > 0 ? gdp / tpop : 0);
      const list = regions.map(function (r, k) {
        return { k: k, name: r.name, x: r.cx, y: r.cy, pop: rpop[k], jobs: rjobs[k], gdp: rjobs[k] * rate, scenic: !!r.scenic, cells: r.cells };
      }).filter(function (r) { return r.pop > 0 || r.jobs > 0; });
      // 大区聚合：把片区按质心归到最近的区名锚点
      const anchors = districtAnchors(city);
      const regionD = new Int16Array(regions.length).fill(-1);
      let districts;
      if (anchors.length > 1) {
        for (const r of list) {
          let best = Infinity, bi = 0;
          for (let i = 0; i < anchors.length; i++) { const d = Math.hypot(r.x - anchors[i].x, r.y - anchors[i].y); if (d < best) { best = d; bi = i; } }
          const a = anchors[bi]; a.pop += r.pop; a.jobs += r.jobs; a.gdp += r.gdp; a.children.push(r.k); r.d = bi; regionD[r.k] = bi;
        }
        districts = anchors.map(function (a) { return { name: a.name, x: a.x, y: a.y, pop: a.pop, jobs: a.jobs, gdp: a.gdp, children: a.children, major: true }; }).filter(function (a) { return a.pop > 0 || a.jobs > 0; });
      } else {
        districts = list.map(function (r, i) { regionD[r.k] = i; return Object.assign({}, r, { major: true, children: [r.k] }); });
        for (const r of list) r.d = r.k;
      }
      // 每格归属的大区序号（着色用）
      const cellD = new Uint8Array(N);
      for (let c = 0; c < N; c++) { const d = regionD[city.region[c]]; cellD[c] = d < 0 ? 0 : d; }
      const data = { list: list, districts: districts, cellD: cellD, total: { pop: tpop, jobs: tjobs, gdp: gdp }, err: tjobs > 0 ? 'jobs' : 'pop', key: key };
      this._cache = { key: key, data: data };
      return data;
    },
    // 数值格式随当前地图货币（人民币/美元/英镑/日元…）：内部金额单位为「万 + 本城货币」，直接复用 U.fmtMoney
    // 它处理亿/万换算、货币改革（法郎→欧元）与英文本地化；人口与币种无关
    gdpText: function (wan) { return U.fmtMoney(wan); },
    popText: function (p) { return (p / 10000).toFixed(1) + ' 万人'; },
    // 人均 GDP：gdp「万货币」÷ pop「人」= 每人「万货币」。按本城货币显示，保留一位小数便于比较
    // （U.fmtMoney 对 1–10000 的整数部分会取整，人均 2.4 万会变成 2 万，故这里自行控制精度）
    perCapitaText: function (gdp, pop) {
      if (!(pop > 0)) return '人均 —';
      const mo = (CM.CFG && CM.CFG.money) || { unit: '元', wan: '万元' }, div = mo.div || 1;
      const v = gdp / pop / div;   // 每人万货币（折算当期货币）
      let s;
      if (v >= 1) s = v.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ' + (mo.wan || '万元');
      else s = Math.round(v * 10000).toLocaleString('zh-CN') + ' ' + (mo.unit || '元');
      return '人均 ' + s;
    }
  };
  CM.EconLayer = EconLayer;
})(window.CM);
