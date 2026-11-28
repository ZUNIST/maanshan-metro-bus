'use strict';
// 票款与各公司收入（v3.87 → v3.89）
//
// v3.89 起改为**各公司分开计价**：仿真在最短路上同时累计「在每个公司线路上坐了多少公里」，
// 各家按自己的票制对自己的那段计价，票款是各公司**收上来的**，不再有「全网算一笔再按比例分」。
// 跨公司出行因此要各付一次起步价——这就是公司边界的真实代价，也是「拆公司」真正的成本所在。
//
// 下面保留的 pkm / boardShare / 旧 share 公式只在多公司仿真尚未产出 byCo 时兜底
// （例如刚划分公司、还没重新算完客流），不会被当作日常口径。
(function (CM) {
  const U = CM.U;
  const C = CM.Clearing = {};

  // 边 → 线路对象。用 rideEdge 反查（每条线路的乘车边索引在编译时就排好了），
  // 不改 sim 的边数组结构，也不增加仿真负担。结果按 net 实例缓存。
  C.edgeLines = function (net) {
    if (!net || !net.R || !net.C) return null;
    const hit = net._coEdgeLines;
    if (hit && hit.eN === net.nE) return hit.arr;
    const arr = new Array(net.nE);
    for (let r = 0; r < net.R; r++) {
      const rt = net.C.routes[r];
      if (!rt || !rt.line) continue;
      const re = net.rideEdge && net.rideEdge[r];
      if (!re) continue;
      for (let k = 0; k < re.length; k++) arr[re[k]] = rt.line;
    }
    net._coEdgeLines = { arr: arr, eN: net.nE };
    return arr;
  };

  // 各公司的客运周转量（人·公里），按周混合（工作日 5/7、周末 2/7）。
  // 各时段直接相加：清分只关心比例，量纲不影响结果。
  C.pkm = function (g) {
    const m = g && g.model;
    if (!m || !m.net || !m.net.C) return null;
    const net = m.net, nE = net.nE;
    const lines = C.edgeLines(net);
    if (!lines) return null;
    const CFG = CM.CFG;
    const W = (CFG.trips && CFG.trips.weekWeights) || { wd: 5 / 7, we: 2 / 7 };
    const by = {};
    let total = 0, edges = 0, zero = 0, railTotal = 0;
    const add = function (dt, w) {
      const res = m.resultsFor ? m.resultsFor(dt) : null;
      if (!res || !res.per || !res.per.length) return;
      for (let p = 0; p < res.per.length; p++) {
        const P = res.per[p];
        if (!P || !P.load) continue;
        const L = P.load;
        // load 是「每小时」的流量（与 stats 同口径），乘上该时段时长才折算成全天量。
        // 只差一个常数不影响分账比例，但会让自查比值失真，也影响跨时段加权。
        const h = (m.pHours && m.pHours[p]) || 1;
        for (let e = 0; e < nE; e++) {
          const q = L[e];
          if (!(q > 0)) { zero++; continue; }
          const km = net.eKm[e];
          if (!(km > 0)) continue;
          const line = lines[e];
          if (!line) continue;
          const v = q * km * w * h;
          if (line.rail) { railTotal += v; continue; }   // 国铁不属于城市轨道运营公司，单列出来只用于自查
          const co = CM.Companies ? CM.Companies.lineCo(line) : 0;
          by[co] = (by[co] || 0) + v;
          total += v; edges++;
        }
      }
    };
    add('wd', W.wd); add('we', W.we);
    if (!(total > 0)) return null;
    return { by: by, total: total, rail: railTotal, edges: edges };
  };

  // 站点 → 服务它的线路集合（从 segments 反查，按 net 缓存）
  C.stationLines = function (g) {
    const net = g && g.net;
    if (!net) return null;
    const hit = net._coStationLines;
    if (hit && hit.eN === net.nE) return hit.arr;
    const arr = {};
    for (const id in net.segments) {
      const s = net.segments[id];
      if (!s) continue;
      for (const sid of [s.a, s.b]) {
        const set = arr[sid] || (arr[sid] = new Set());
        set.add(s.line);
      }
    }
    for (const sid in arr) arr[sid] = Array.from(arr[sid]);
    net._coStationLines = { arr: arr, eN: net.nE };
    return arr;
  };

  // 各公司的「进站份额」：按站点进站人次，换乘站的进站量由服务它的公司平分。
  // 现实依据：进站公司承担售票、闸机、车站服务，这部分成本与承运距离无关，
  // 所以起步价（或一部分票款）按进站归属分，是常见的清分办法（成都、天津等用过）。
  C.boardShare = function (g) {
    const m = g && g.model;
    const sd = m && m.stDaily;
    if (!sd || !sd.inn || !m.net || !m.net.C) return null;
    const net = m.net, N = net.N, st = net.C.stations;
    const sl = C.stationLines(g);
    const by = {};
    let total = 0;
    for (let s = 0; s < N; s++) {
      const inn = sd.inn[s] || 0;
      if (!(inn > 0)) continue;
      const S = st && st[s];
      if (!S) continue;
      const lines = sl[S.id];
      if (!lines || !lines.length) continue;
      const cos = [];
      for (const lid of lines) {
        const L = g.net.lines[lid];
        if (!L || L.rail) continue;
        cos.push(CM.Companies ? CM.Companies.lineCo(L) : 0);
      }
      if (!cos.length) continue;
      for (const co of cos) by[co] = (by[co] || 0) + inn / cos.length;
      total += inn;
    }
    if (!(total > 0)) return null;
    const share = {};
    for (const k in by) share[k] = by[k] / total;
    return { by: by, total: total, share: share };
  };

  // 各公司份额。opt.boardWeight = 起步价（按进站归属的那部分）占票价的比例：
  //   0   = 纯里程清分
  //   0.3 = 起步价三成归进站公司、其余按里程（默认）
  //   0.75= 起步价全归进站（近似「起步价归进站 + 超程按里程」）
  // 数学上「起步价归进站 + 超程按里程」展开就是这个加权，所以一个参数能表达两种规则。
  // 为什么默认 0.3：进站公司承担售票、闸机与车站服务，成本与承运距离无关；
  // 实测（ms30）纯里程下 3.7 km 的接驳线只分得 3.8%，0.3 之后升到 9.9%，
  // 而大网从 95.2% 降到 86.7%——倾斜有限，不破坏「按里程」的主体逻辑。
  C.BOARD_WEIGHT = 0.3;

  // ---------------- 各公司分开计价（v3.89） ----------------
  // 不再「全网算一笔票款再按比例分摊」，而是仿真里就按公司拆开计价：
  // 乘客在哪家公司线路上坐了多少公里，就按那家公司自己的票制付钱；跨公司要各付一次起步价。
  // 所以各公司的票款是**收上来的**，不是分出来的——这里只是把仿真已经算好的数字取出来。
  C.direct = function (g) {
    const m = g && g.model;
    const d = m && m.daily;
    if (!d || !d.byCo) return null;
    let total = 0, n = 0;
    for (const k in d.byCo) { const v = d.byCo[k]; if (v > 0) { total += v; n++; } }
    if (!(total > 0) || !n) return null;
    return { by: d.byCo, total: total, companies: n };
  };

  // 各公司份额。优先用「各公司自收票款」（分开计价）；
  // 只有在多公司仿真尚未产出 byCo 时，才退回旧的「里程 + 起步价归进站」分摊。
  C.share = function (g, opt) {
    const dir = C.direct(g);
    if (dir) {
      const out = {};
      for (const c in dir.by) out[c] = dir.by[c] / dir.total;
      return out;
    }
    const o = opt || {};
    const rule = g && g.coRule;
    const dflt = (rule && rule.boardWeight != null) ? rule.boardWeight : C.BOARD_WEIGHT;
    const k = U.clamp(o.boardWeight == null ? dflt : (+o.boardWeight || 0), 0, 1);
    const r = C.pkm(g);
    if (!r) return null;
    if (!(k > 0)) {
      const out = {};
      for (const c in r.by) out[c] = r.by[c] / r.total;
      return out;
    }
    const b = C.boardShare(g);
    if (!b) {
      const out = {};
      for (const c in r.by) out[c] = r.by[c] / r.total;
      return out;
    }
    const keys = new Set(Object.keys(r.by).concat(Object.keys(b.by)));
    const out = {};
    for (const c of keys) {
      out[c] = (1 - k) * ((r.by[c] || 0) / r.total) + k * (b.share[c] || 0);
    }
    return out;
  };

  // ---------------- 公司损益表 ----------------
  // 票款只有一部分——日本私铁之所以能站住，靠的是运输以外的经营（东急运输约占收入 35%，
  // 不动产与流通占大头）。游戏里对应的就是车站商业（TOD 开发带来的广告与租金）。
  // 这里把 CM.Finance 已经逐站逐线算好的数字按公司归属重新组表，不再另做粗估。
  //   fare   票款（按清分份额）
  //   commerce 车站商业（站点按服务线路的公司分摊，换乘站平分）
  //   stationOps 车站运营成本 / todCost 商业运营成本 / train 车厢公里成本
  //   sub    政府运营补贴（按缺口 × 补贴率，仅作账面参考：直营模式下钱仍进同一账户）
  //   net    补贴后盈亏
  C.pnl = function (g, opt) {
    const F = CM.Finance && CM.Finance.compute ? CM.Finance.compute(g) : null;
    if (!F || !F.ready) return null;
    const R = CM.Companies;
    const o = opt || {};
    const sh = C.share(g, { boardWeight: o.boardWeight }) || {};
    const fareM = F.day && F.day.fare ? F.day.fare / 10000 * 30.4 : 0;
    const oi = g.econ && g.econ.opsIndex ? g.econ.opsIndex(g.clock.y) : 1;
    const CFG = CM.CFG;
    const rate = (CM.Economy && CM.Economy.opsSubRate) ? CM.Economy.opsSubRate() : 0.5;
    const out = {};
    const at = function (co) {
      return out[co] || (out[co] = {
        fare: 0, commerce: 0, stationOps: 0, todCost: 0, train: 0, km: 0,
        pkm: 0, ckm: 0, stations: 0, lines: 0,
      });
    };
    // 车站：营业成本与商业收入按「服务该站的线路所属公司」平摊
    (F.stations || []).forEach(function (st) {
      const cos = [];
      for (const lid of (st.lines || [])) {
        const L = g.net.lines[lid];
        if (!L || L.rail) continue;
        const co = R.lineCo(L);
        if (cos.indexOf(co) < 0) cos.push(co);
      }
      if (!cos.length) return;
      for (const co of cos) {
        const t = at(co);
        t.commerce += (st.com || 0) / cos.length;
        t.stationOps += (st.ops || 0) / cos.length;
        t.todCost += (st.todCost || 0) / cos.length;
      }
      at(cos[0]).stations++;
    });
    // 线路：车厢公里与周转量直接归所属公司
    (F.lines || []).forEach(function (L) {
      if (!L.L || L.L.rail) return;
      const t = at(R.lineCo(L.L));
      t.pkm += L.pkm || 0;
      t.ckm += L.ckm || 0;
      t.lines++;
    });
    // 营业里程：从编译结果取（AI 新建的线还没有车队时 ckm 会是 0，用里程兜底估车公里成本）
    (g.compiled && g.compiled.routes || []).forEach(function (rt) {
      if (!rt.line || rt.line.rail) return;
      at(R.lineCo(rt.line)).km += (rt.lenM || 0) / 1000;
    });
    // 周转量以清分结果为准（Finance 的车公里统计在未配车时会失效，但 pkm 两边都应一致）
    const cl = C.pkm(g);
    if (cl) for (const k in cl.by) if (out[k]) out[k].pkm = cl.by[k];
    // 分开计价：票款直接用仿真里各公司自己收到的钱（不再是「总额 × 份额」）
    const dir = C.direct(g);
    for (const k in out) {
      const t = out[k];
      t.fare = dir ? (dir.by[k] || 0) / 10000 * 30.4 : fareM * (sh[k] || 0);
      t.share = dir ? (dir.by[k] || 0) / dir.total : (sh[k] || 0);
      t.train = t.ckm * CFG.ops.carKmCost * oi * 30.4;
      if (t.train <= 0 && t.km > 0) t.train = t.km * 36 * oi;   // 万元/km/月 的兜底（≈432 万/km/年）
      t.cost = t.stationOps + t.todCost + t.train;
      t.income = t.fare + t.commerce;
      t.gap = t.cost - t.income;
      t.sub = t.gap > 0 ? t.gap * rate : 0;
      t.net = t.income + t.sub - t.cost;
      t.cover = t.cost > 0 ? t.income / t.cost : 0;
    }
    return out;
  };

  // 把一笔票款按周转量切开。返回 { coId: 金额 }，附 total 便于校验。
  C.split = function (g, amount, opt) {
    const s = C.share(g, opt);
    if (!s) return null;
    const out = { total: 0 };
    for (const k in s) { out[k] = amount * s[k]; out.total += out[k]; }
    return out;
  };

  // 自查：清分口径覆盖了多少模型的客运周转量。
  // 差值主要来自国铁（不属于任何运营公司，清分时排除）——加上国铁后比值应接近 1，
  // 否则说明有边没被 rideEdge 覆盖到（编译结构变了），需要排查。
  C.check = function (g) {
    const r = C.pkm(g);
    const m = g && g.model;
    const pkm = m && m.daily && m.daily.metroPkm;
    const dir = C.direct(g);
    const fare = m && m.daily && m.daily.fare;
    if (!r || !(pkm > 0)) return null;
    const out = {
      ours: r.total, rail: r.rail || 0, model: pkm,
      ratio: r.total / pkm, ratioAll: (r.total + (r.rail || 0)) / pkm,
      companies: Object.keys(r.by).length,
    };
    // 分开计价的自查：各公司自收票款之和应与模型的票款总额一致（差的是枢纽接驳那一点）
    if (dir) { out.fareDirect = dir.total; out.fareModel = fare || 0; out.fareRatio = fare > 0 ? dir.total / fare : 0; }
    return out;
  };
})(window.CM);
