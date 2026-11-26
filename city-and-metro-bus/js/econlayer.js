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
    // v3.72：没有现成地名标签的区县（和县图的「马鞍山市区」）可以用 D.districtAt 直接给锚点
    const at = D.districtAt || {};
    let pick = [];
    // 按 districtTier 的顺序取锚点，区县颜色（ECON_COLORS 按下标取）才稳定
    for (const n of Array.from(tier)) {
      let p = named.get(n);
      if (!p && Array.isArray(at[n])) { p = [n, at[n][0], at[n][1]]; named.set(n, p); }
      if (p) pick.push(p);
    }
    if (!pick.length) {
      // 没有任何区县级标记时，取 city.districtLabels 前若干「区/县/新区」名的项；再不行就用全部（退化为按片区）
      pick = labels.filter(function (d) { return /区$|县$|新区$|港$|市$/.test(d[0]); });
    }
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
        // outside：境外 / 地图边缘的兜底片区（id 'outer'）。它们照常计入区县总量，但本身不是真正的片区，
        // 放大后不单独标出来（那种地方的「人均」没有意义，标上去反而像错数）
        return { k: k, id: r.id, name: r.name, x: r.cx, y: r.cy, pop: rpop[k], jobs: rjobs[k], gdp: rjobs[k] * rate, scenic: !!r.scenic, cells: r.cells, outside: !!r.empty || r.id === 'outer' };
      }).filter(function (r) { return r.pop > 0 || r.jobs > 0; });
      // 大区聚合：D.districtOf 给了显式归属的按表走，没给的按质心归到最近的区名锚点
      const anchors = districtAnchors(city);
      const regionD = new Int16Array(regions.length).fill(-1);
      let districts, dmap = null;
      if (anchors.length > 1) {
        const nearest = function (x, y) {
          let best = Infinity, bi = 0;
          for (let i = 0; i < anchors.length; i++) { const d = Math.hypot(x - anchors[i].x, y - anchors[i].y); if (d < best) { best = d; bi = i; } }
          return bi;
        };
        const ixOf = new Map();
        anchors.forEach(function (a, i) { ixOf.set(a.name, i); });
        const dOf = D.districtOf || {};
        // 片区 id（其次片区名）在表里查得到就用，查不到返回 -1
        const pinned = function (r) {
          const nm = r && (dOf[r.id] || dOf[r.name]);
          if (!nm) return -1;
          const i = ixOf.get(nm);
          return i == null ? -1 : i;
        };
        for (const r of list) {
          let bi = pinned(r);
          if (bi < 0) bi = nearest(r.x, r.y);
          const a = anchors[bi]; a.pop += r.pop; a.jobs += r.jobs; a.gdp += r.gdp; a.children.push(r.k); r.d = bi; regionD[r.k] = bi;
        }
        // 还没有人口 / 岗位的片区（未开发地、管制用地）也按同一套归属：
        // 填色才是一整片，不会在城区里留下空斑；境外片区（empty）不归，保持底图原样。
        for (let k = 0; k < regions.length; k++) {
          const r = regions[k];
          if (regionD[k] >= 0 || !r || r.empty || !isFinite(r.cx) || !isFinite(r.cy)) continue;
          const pi = pinned(r);
          regionD[k] = pi >= 0 ? pi : nearest(r.cx, r.cy);
        }
        // 一个区都没有人口时会被剔掉，序号要重排，否则 cellD 会指错区
        const keep = [];
        districts = [];
        for (let i = 0; i < anchors.length; i++) {
          const a = anchors[i];
          if (!(a.pop > 0 || a.jobs > 0)) { keep[i] = -1; continue; }
          keep[i] = districts.length;
          districts.push({ name: a.name, x: a.x, y: a.y, pop: a.pop, jobs: a.jobs, gdp: a.gdp, children: a.children, major: true });
        }
        dmap = keep;
        // 小片归属（D.districtPatch）：江心洲、洞阳这类贴着区界的零碎地块，按折线多边形直接改归属
        const patches = [];
        if (Array.isArray(D.districtPatch)) for (const p of D.districtPatch) {
          const ai = ixOf.get(p.d), poly = p.poly;
          if (ai == null || !Array.isArray(poly) || poly.length < 3) continue;
          const di = keep[ai];
          if (di < 0) continue;
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const q of poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
          patches.push({ di: di, poly: poly, x0: x0, y0: y0, x1: x1, y1: y1 });
        }
        this._patches = patches;
      } else {
        districts = list.map(function (r, i) { regionD[r.k] = i; return Object.assign({}, r, { major: true, children: [r.k] }); });
        for (const r of list) r.d = r.k;
        this._patches = null;
      }
      // 点在多边形内（射线法）：小片归属用
      const inPoly = function (poly, x, y) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      };
      // 每格归属的大区序号（着色用）。没有归属的格子（境外邻市、水域等无人片区）记 255，
      // 图层不给它们上色，底图的地理样貌照常显示（v3.71）。
      const cellD = new Uint8Array(N).fill(255);
      const patches = this._patches;
      for (let c = 0; c < N; c++) {
        const d = regionD[city.region[c]];
        let m = d < 0 ? -1 : (dmap ? dmap[d] : d);
        if (patches && patches.length) {
          const cx = (c % W) + 0.5, cy = ((c / W) | 0) + 0.5;
          for (const p of patches) {
            if (cx < p.x0 || cx > p.x1 || cy < p.y0 || cy > p.y1) continue;
            if (inPoly(p.poly, cx, cy)) m = p.di;
          }
        }
        if (m >= 0) cellD[c] = m;
      }
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
