'use strict';
// AI 私营公司的线路生成器（v3.87 试验）：给定起点与目标片区，生成一条沿走廊走的合法折线。
//
// 为什么不是直线也不是纯随机：现实里私营铁路（日本私铁、香港接驳线）几乎都沿河谷、沿国道、沿既有铁路修——
// 既省钱，线形也天然顺滑。所以这里用栅格寻路，把「沿街」做成便宜、「过水」做成最贵，
// 生成出的线会自己贴到街道走廊上，而不是在街区里穿来穿去。
//
// 输出与玩家画线完全同构：net.segments[id].pts 就是一串 [x, y] 折线点，
// 所以 AI 造的线和玩家造的线在地图、仿真、客流里没有任何区别，只是 owner 不同。
(function (CM) {
  const U = CM.U, CFG = CM.CFG, LU = CM.LU;
  const A = CM.AIRoute = {};

  A.DX = [1, 1, 0, -1, -1, -1, 0, 1];
  A.DY = [0, 1, 1, 1, 0, -1, -1, -1];
  A.STEP = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

  // ---------------- 道路距离场 ----------------
  // city.street 只覆盖「城市化」的街坊，郊区的国道、县道不在里面；而 AI 的线恰恰常要出城。
  // 所以这里按真实道路边（eCls）预计算一张距离分级表：3 贴路、2 近路、1 稍远、0 荒野。
  // 全图算一次约 3 万格，之后 A* 每次 O(1) 查表；道路变化（roadVersion）才重算。
  A.roadField = function (city) {
    if (city._airoad && city._airoadVer === city.roadVersion) return city._airoad;
    const W = city.W, N = city.N, f = new Uint8Array(N);
    // 阈值按「格心到道路边」的距离校准：格心距最近的边最少是半格（约 125 m），
    // 所以 140 m 就是「四面都是路」的那种贴路格，350 m 以外视作附近没有路。
    for (let c = 0; c < N; c++) {
      const d = city.roadDistM((c % W) + 0.5, ((c / W) | 0) + 0.5);
      f[c] = d <= 140 ? 3 : (d <= 220 ? 2 : (d <= 350 ? 1 : 0));
    }
    city._airoad = f; city._airoadVer = city.roadVersion;
    return f;
  };

  // ---------------- 自家轨道走廊 ----------------
  // 同一家公司的线可以共线（现实里一条主干道下走两条线很常见，省一大笔隧道钱）。
  // 做法：把本公司的既有轨道格标出来，寻路时给极低代价，A* 就会主动贴上去走一段再分叉，
  // 而不是在旁边另铺一条平行隧道。别的公司的轨道不享受这个折扣——共走廊要抢客，是另一回事。
  A.orgTrackField = function (g, orgId) {
    const city = g.city, f = new Uint8Array(city.N);
    if (orgId == null) return f;
    for (const id in g.net.segments) {
      const s = g.net.segments[id];
      const L = g.net.lines[s.line];
      if (!L || (L.owner || 0) !== orgId) continue;
      const pts = s.pts && s.pts.length ? s.pts : null;
      const A0 = g.net.stations[s.a], B0 = g.net.stations[s.b];
      if (pts) for (const p of pts) { const c = city.cellAt(p[0], p[1]); if (c >= 0) f[c] = 1; }
      else if (A0 && B0) {
        const n = Math.max(2, Math.ceil(U.dist(A0.x, A0.y, B0.x, B0.y) * 2));
        for (let k = 0; k <= n; k++) { const c = city.cellAt(A0.x + (B0.x - A0.x) * k / n, A0.y + (B0.y - A0.y) * k / n); if (c >= 0) f[c] = 1; }
      }
    }
    return f;
  };

  // ---------------- 通行代价 ----------------
  // 最小值恒为 1（贴路 + 无密度），因此启发式可以直接用 octile 距离，保证 A* 最优。
  // 离路越远越贵：地铁沿路修只要挖，穿街坊要拆楼；而且沿路走出来的线是一条条长直线，观感接近真实线路图。
  A.cellCost = function (city, c) {
    if (c < 0) return Infinity;
    // 自家轨道：几乎免费。共线区段不用再挖一次隧道，这是同公司多线设计的核心激励。
    if (city._aiorg && city._aiorg[c]) return 0.35;
    let k;
    const f = city._airoad;
    if (f) {
      const r = f[c];
      k = r >= 3 ? 1 : (r === 2 ? 1.55 : (r === 1 ? 2.4 : 3.8));
    } else k = city.street[c] ? 1 : 3.2;
    const lu = city.lu[c];
    if (lu === LU.WATER) k = Math.max(k, 8);
    else if (lu === LU.HILL) k = Math.max(k, 4);
    else if (lu === LU.PARK) k = Math.max(k, 2.2);
    else if (lu === LU.LANDMARK) k = Math.max(k, 2.6);
    if (city.cellLocked(c)) k *= 1.6;
    const dens = (city.pop[c] + city.jobs[c]) / 320;
    return k * (1 + Math.min(0.8, dens));
  };

  // 转角代价（按 45° 的倍数）：直行 0，缓折 0.4，直角 1.3，接近掉头 3，原路返回禁止。
  // 这是「顺直」的关键——没有它，最短路会在街区之间反复贴着走，出来的线像锯齿。
  A.TURN = [0, 0.4, 1.3, 3.0, Infinity, 3.0, 1.3, 0.4];

  // 折线总长（格）
  A.polyLen = function (pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += U.dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    return s;
  };

  // ---------------- 最小堆 ----------------
  function Heap() { this.f = []; this.v = []; }
  Heap.prototype.push = function (f, v) {
    const F = this.f, V = this.v; let i = F.length;
    F.push(f); V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= F[i]) break;
      const t = F[p]; F[p] = F[i]; F[i] = t;
      const u = V[p]; V[p] = V[i]; V[i] = u;
      i = p;
    }
  };
  Heap.prototype.pop = function () {
    const F = this.f, V = this.v, n = F.length;
    if (!n) return -1;
    const top = V[0];
    const lf = F.pop(), lv = V.pop();
    if (n > 1) {
      F[0] = lf; V[0] = lv;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1, b = a + 1; let m = i;
        if (a < F.length && F[a] < F[m]) m = a;
        if (b < F.length && F[b] < F[m]) m = b;
        if (m === i) break;
        const t = F[m]; F[m] = F[i]; F[i] = t;
        const u = V[m]; V[m] = V[i]; V[i] = u;
        i = m;
      }
    }
    return top;
  };

  // ---------------- 栅格寻路（带方向状态） ----------------
  // 状态是 (格, 朝向)，不是单纯的格：只有这样才惩罚拐弯、禁止原路返回，
  // 出来的线才是一条条长直线，而不是贴边抖动的锯齿。
  // 返回格心坐标序列（[x, y] 数组），失败返回 null。
  A.findPath = function (city, from, to, opt) {
    const W = city.W, H = city.H;
    const o = opt || {};
    const pad = o.pad == null ? 12 : o.pad;
    const x0 = Math.floor(from.x), y0 = Math.floor(from.y);
    const x1 = Math.floor(to.x), y1 = Math.floor(to.y);
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return null;
    if (x1 < 0 || y1 < 0 || x1 >= W || y1 >= H) return null;
    const bx0 = Math.max(0, Math.min(x0, x1) - pad), bx1 = Math.min(W - 1, Math.max(x0, x1) + pad);
    const by0 = Math.max(0, Math.min(y0, y1) - pad), by1 = Math.min(H - 1, Math.max(y0, y1) + pad);
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, n = bw * bh, NS = n * 8;
    const g = new Float64Array(NS); g.fill(Infinity);
    const par = new Int32Array(NS); par.fill(-1);
    const seen = new Uint8Array(NS);
    const startCell = (y0 - by0) * bw + (x0 - bx0), endCell = (y1 - by0) * bw + (x1 - bx0);
    if (startCell === endCell) return [[from.x, from.y], [to.x, to.y]];
    const heur = function (ci, cj) {
      const dx = Math.abs(bx0 + ci - x1), dy = Math.abs(by0 + cj - y1);
      // 最小单格代价是 0.35（自家共线轨道），启发式按它缩放才保持可采纳
      return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * 0.35;
    };
    const hp = new Heap();
    for (let d = 0; d < 8; d++) { const sid = (startCell << 3) | d; g[sid] = 0; hp.push(heur(startCell % bw, (startCell / bw) | 0), sid); }
    let found = -1, guard = 0;
    while (hp.f.length && guard++ < NS * 2) {
      const sid = hp.pop();
      if (sid < 0) break;
      if (seen[sid]) continue;
      seen[sid] = 1;
      const cell = sid >> 3, d0 = sid & 7;
      if (cell === endCell) { found = sid; break; }
      const ci = cell % bw, cj = (cell / bw) | 0;
      const gx = bx0 + ci, gy = by0 + cj, gc = g[sid];
      for (let k = 0; k < 8; k++) {
        const turn = A.TURN[(k - d0 + 8) & 7];
        if (!isFinite(turn)) continue;
        const ni = ci + A.DX[k], nj = cj + A.DY[k];
        if (ni < 0 || nj < 0 || ni >= bw || nj >= bh) continue;
        const ncell = nj * bw + ni;
        const nsid = (ncell << 3) | k;
        if (seen[nsid]) continue;
        const cellId = city.cellAt(gx + A.DX[k], gy + A.DY[k]);
        if (cellId < 0) continue;
        // 对角走位不许「贴着两栋楼擦过去」
        if (A.DX[k] && A.DY[k]) {
          if (city.cellAt(gx + A.DX[k], gy) < 0 && city.cellAt(gx, gy + A.DY[k]) < 0) continue;
        }
        const ng = gc + A.cellCost(city, cellId) * A.STEP[k] + turn;
        if (ng < g[nsid]) { g[nsid] = ng; par[nsid] = sid; hp.push(ng + heur(ni, nj), nsid); }
      }
    }
    if (found < 0) return null;
    const out = [];
    for (let s = found; s >= 0; s = par[s]) {
      const cell = s >> 3;
      out.push([bx0 + (cell % bw) + 0.5, by0 + ((cell / bw) | 0) + 0.5]);
    }
    out.reverse();
    out[0] = [from.x, from.y];
    out[out.length - 1] = [to.x, to.y];
    return out;
  };

  // ---------------- 折线简化（Douglas–Peucker） ----------------
  A.simplify = function (pts, eps) {
    if (pts.length <= 2) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const seg = stack.pop(), a = seg[0], b = seg[1];
      let best = -1, bd = eps;
      for (let i = a + 1; i < b; i++) {
        const d = U.distToSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
        if (d > bd) { bd = d; best = i; }
      }
      if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i].slice());
    return out;
  };

  // ---------------- 拉直 ----------------
  // 简化只删「共线点」，删不掉「沿着方格路网拐来拐去」的那些 90° 折。
  // 这里做一次贪心合并：从当前点出发，找最远的、连成直线后仍贴着路的点，中间的点全部丢掉。
  // 效果是一条 7 km 的线从 6–8 个折点降到 2–4 个，观感接近真实线路图上的干线。
  A.clearLine = function (city, rf, a, b) {
    const d = U.dist(a[0], a[1], b[0], b[1]);
    const n = Math.max(2, Math.ceil(d * 2));
    let bad = 0;
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
      const c = city.cellAt(x, y);
      if (c < 0) return false;
      const lu = city.lu[c];
      if (lu === LU.WATER || lu === LU.HILL) return false;   // 直线不许穿水过山
      if (rf ? rf[c] < 2 : !city.street[c]) bad++;
    }
    return bad <= n * 0.18;   // 允许少量偏离（路口、天桥、匝道附近本来就不在路上）
  };

  A.straighten = function (city, pts, rf) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      for (let k = pts.length - 1; k > i + 1; k--) if (A.clearLine(city, rf, pts[i], pts[k])) { j = k; break; }
      out.push(pts[j]);
      i = j;
    }
    return out;
  };

  // 沿折线按目标站数等分，每一站再在附近吸附到人口与岗位最多的、且 checkSite 通过的格。
  // 吸附是这一步的关键：等距撒点会得到「整齐但没有人的车站」，吸附之后站会落在街区中心。
  A.placeStations = function (g, pts, want, opt) {
    const city = g.city, M = CM.Metro, o = opt || {};
    const net = o.net || g.net;
    const type = o.type || 'underground';
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + U.dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    const total = cum[cum.length - 1];
    if (!(total > 0)) return [];
    const at = function (s) {
      let i = 1; while (i < cum.length && cum[i] < s) i++;
      if (i >= cum.length) return pts[pts.length - 1].slice();
      const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    };
    // 点到折线的投影：返回最近距离与该点对应的累计长度
    const proj = function (px, py) {
      let bd = Infinity, bs = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const abx = b[0] - a[0], aby = b[1] - a[1], L2 = abx * abx + aby * aby;
        let t = L2 > 1e-9 ? ((px - a[0]) * abx + (py - a[1]) * aby) / L2 : 0;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const d = U.dist(px, py, a[0] + abx * t, a[1] + aby * t);
        if (d < bd) { bd = d; bs = cum[i - 1] + Math.sqrt(L2) * t; }
      }
      return { d: bd, s: bs };
    };
    const snap = function (p) {
      let best = null, bv = -1;
      const R = o.snapR == null ? 2.2 : o.snapR;
      for (let j = Math.floor(p[1] - R); j <= Math.ceil(p[1] + R); j++)
        for (let i = Math.floor(p[0] - R); i <= Math.ceil(p[0] + R); i++) {
          const c = city.cellAt(i + 0.5, j + 0.5);
          if (c < 0) continue;
          if (U.dist(i + 0.5, j + 0.5, p[0], p[1]) > R) continue;
          const v = city.pop[c] + city.jobs[c];
          if (v <= bv) continue;
          if (!M.checkSite(city, i + 0.5, j + 0.5, type, 'metro').ok) continue;
          bv = v; best = [i + 0.5, j + 0.5];
        }
      return best || p;
    };

    const list = [];
    // 一、沿线的既有站：共线区段必须原样复用它们。
    // 若不这么做，两条线会各自按自己的站间距布站，站位置错开半个街区，
    // 既换不了乘，coHost 也匹配不到同一对站，共线就永远不会成立。
    if (net && o.reuse !== false) {
      const R = o.reuseR2 == null ? 1.3 : o.reuseR2;
      for (const sid in net.stations) {
        const st = net.stations[sid];
        if (st.portal) continue;
        const pr = proj(st.x, st.y);
        if (pr.d <= R) list.push({ s: pr.s, x: st.x, y: st.y, fixed: true });
      }
      list.sort(function (a, b) { return a.s - b.s; });
    }
    // 二、等距补充新站；离已有站太近的不要（避免站台挨在一起）
    const n = Math.max(2, want | 0);
    const gap = o.minGap == null ? 0.85 : o.minGap;
    for (let k = 0; k < n; k++) {
      const s = total * k / (n - 1);
      let near = false;
      for (const a of list) if (Math.abs(a.s - s) < gap) { near = true; break; }
      if (near) continue;
      const p = at(s);
      list.push({ s: s, x: p[0], y: p[1], fixed: false });
    }
    list.sort(function (a, b) { return a.s - b.s; });
    // 三、吸附到人口峰值（固定的既有站不动），再去掉吸附后贴到一起的
    const out = [];
    for (const it of list) {
      let x = it.x, y = it.y;
      if (!it.fixed) { const q = snap([x, y]); x = q[0]; y = q[1]; }
      const last = out[out.length - 1];
      if (last && U.dist(last.x, last.y, x, y) < 0.6) continue;
      out.push({ x: x, y: y, at: it.s });
    }
    return out.length >= 2 ? out : [];
  };

  // ---------------- 主流程 ----------------
  // o: { from:{x,y}, to:{x,y}, stations, type, name }
  A.plan = function (g, o) {
    const city = g.city;
    if (!city) return { ok: false, why: '城市尚未生成' };
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    A.roadField(city);
    const rf = city._airoad;
    city._aiorg = o.orgId != null ? A.orgTrackField(g, o.orgId) : null;
    const raw = A.findPath(city, o.from, o.to, o);
    city._aiorg = null;
    if (!raw) return { ok: false, why: '起终点之间没有可行路径' };
    const pts = A.straighten(city, A.simplify(raw, o.eps == null ? 0.65 : o.eps), rf);
    // 质量指标：沿路率（越高越像真实线路）、过水格数、转角数（越少越顺直）
    let onStreet = 0, water = 0, inland = 0;
    for (let i = 0; i < raw.length; i++) {
      const c = city.cellAt(raw[i][0], raw[i][1]);
      if (c < 0) continue;
      inland++;
      if (rf ? rf[c] >= 2 : city.street[c]) onStreet++;
      if (city.lu[c] === LU.WATER) water++;
    }
    const turns = Math.max(0, pts.length - 2);
    const km = A.polyLen(pts) * CFG.CELL_M / 1000;
    const want = o.stations || U.clamp(Math.round(km / 1.1) + 1, 2, 5);
    const stations = A.placeStations(g, pts, want, o);
    if (stations.length < 2) return { ok: false, why: '沿线布站失败' };
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return {
      ok: true, pts: pts, stations: stations, km: km,
      raw: raw.length, ms: Math.round(t1 - t0),
      onStreet: inland ? onStreet / inland : 0, water: water, turns: turns,
    };
  };

  // ---------------- 写入线网 ----------------
  // 与玩家画线的产物完全同构：newLine + addStation + addSegment。
  // owner 记在 line 上：非 0 表示这条线属于别的公司，玩家不能编辑（编辑入口按它拦）。
  //
  // 站点复用是共线的前提：addStation 不查重，若 AI 在旧站旁边再建一个同坐标的站，
  // 两条线就变成「两套重合的站」而不是「同一个换乘站」。所以先找附近既有站直接复用。
  A.nearStation = function (net, x, y, r) {
    const R = r == null ? 0.45 : r;
    let best = null, bd = R;
    for (const id in net.stations) {
      const s = net.stations[id];
      if (s.portal) continue;
      const d = U.dist(s.x, s.y, x, y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  };

  A.apply = function (g, route, o) {
    const M = CM.Metro, city = g.city, net = g.net;
    const opt = o || {};
    if (!route || !route.ok) return { ok: false, why: route && route.why };
    const lid = M.newLine(net, opt.name, 'metro');
    const L = net.lines[lid];
    if (opt.color) L.color = opt.color;
    if (opt.owner != null) L.owner = opt.owner;
    if (opt.coId != null) L.coId = opt.coId;
    L.planted = g.ym ? g.ym() : 0;
    let reused = 0;
    const ids = route.stations.map(function (s) {
      const ex = A.nearStation(net, s.x, s.y, opt.reuseR);
      if (ex) { reused++; return ex; }
      return M.addStation(net, s.x, s.y, { size: opt.size || 'M', type: opt.type || 'underground' }, city);
    });
    const segIds = [];
    let shared = 0;
    for (let i = 1; i < route.stations.length; i++) {
      const a = route.stations[i - 1], b = route.stations[i];
      const bends = A.slicePoly(route.pts, a.at, b.at);
      // 与既有线路同一对车站之间已经有轨道：沿用它的线形，形成共线（coTrackSegs 会认出来）
      const host = M.coHost(net, ids[i - 1], ids[i], lid);
      if (host) {
        shared++;
        const hp = (host.pts || []).map(function (p) { return [p[0], p[1]]; });
        const r = M.addSegment(net, lid, ids[i - 1], ids[i], host.a === ids[i - 1] ? hp : hp.reverse(), host.type);
        if (r && r.id) { segIds.push(r.id); if (host.curve) net.segments[r.id].curve = host.curve; }
        continue;
      }
      const r = M.addSegment(net, lid, ids[i - 1], ids[i], bends, opt.type || 'underground');
      if (r && r.id) segIds.push(r.id);
    }
    return { ok: true, lineId: lid, stations: ids, segments: segIds, reused: reused, shared: shared };
  };

  // 从折线里截出 [s0, s1] 区间的折点（不含两端，两端由站点表示）
  A.slicePoly = function (pts, s0, s1) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + U.dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      if (cum[i] > s0 + 1e-6 && cum[i] < s1 - 1e-6) out.push(pts[i].slice());
    }
    return out;
  };

  // ---------------- 走廊冲突 ----------------
  // 沿新线采样，看它压在谁的轨道上：自家 = 共线（省钱，加分）；别家 = 抢走廊（扣分）。
  // 这就是「允许同一个 AI 共线，但不鼓励贴别人的线」的落地方式。
  A.conflict = function (g, orgId, pts) {
    const city = g.city, W = city.W;
    const key = function (x, y) { return Math.floor(y) * W + Math.floor(x); };
    const own = new Set(), other = new Set();
    for (const id in g.net.segments) {
      const s = g.net.segments[id], L = g.net.lines[s.line];
      if (!L) continue;
      const tgt = ((L.owner || 0) === (orgId || 0)) ? own : other;
      if (s.pts && s.pts.length) { for (const p of s.pts) tgt.add(key(p[0], p[1])); }
      else {
        const a = g.net.stations[s.a], b = g.net.stations[s.b];
        if (a && b) {
          const n = Math.max(2, Math.ceil(U.dist(a.x, a.y, b.x, b.y) * 2));
          for (let k = 0; k <= n; k++) tgt.add(key(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n));
        }
      }
    }
    let n = 0, o1 = 0, o2 = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = U.dist(a[0], a[1], b[0], b[1]);
      const m = Math.max(2, Math.ceil(d * 2));
      for (let k = 0; k < m; k++) {
        const kk = key(a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m);
        n++;
        if (own.has(kk)) o1++;
        else if (other.has(kk)) o2++;
      }
    }
    return { n: n, own: n ? o1 / n : 0, other: n ? o2 / n : 0 };
  };

  // ---------------- 客流基准 ----------------
  // 用既有线网的实际「进站人次 ÷ 站点周边人口」当作人均乘车率；
  // 没有线网时退回经验值 6%（国内大城市地铁日均乘次占总人口的比例量级）。
  A.rideRate = function (g) {
    const m = g.model, sd = m && m.stDaily, C = m && m.net && m.net.C;
    if (sd && sd.inn && C && C.stations) {
      const city = g.city, W = city.W, H = city.H;
      let inn = 0, cov = 0;
      for (let i = 0; i < C.stations.length && i < sd.inn.length; i++) {
        if (C.serviced && !C.serviced[i]) continue;
        inn += sd.inn[i] || 0;
        const s = C.stations[i];
        for (let j = Math.floor(s.y - 2.4); j <= Math.ceil(s.y + 2.4); j++)
          for (let k = Math.floor(s.x - 2.4); k <= Math.ceil(s.x + 2.4); k++) {
            if (k < 0 || j < 0 || k >= W || j >= H) continue;
            if (U.dist(k + 0.5, j + 0.5, s.x, s.y) > 2.4) continue;
            const c = j * W + k; cov += city.pop[c] + city.jobs[c];
          }
      }
      if (cov > 0 && inn > 0) return U.clamp(inn / cov, 0.01, 0.4);
    }
    return 0.06;
  };

  // ---------------- 粗略财务（单位：万元） ----------------
  // 造价按地下区间 + M 型站；运营按车厢公里与车站日常成本粗估。
  // 判据不是「收回建设投资」（现实里没有一条地铁靠票款收回投资），
  // 而是「票款能否覆盖运营成本」——地铁公司自己也是这个口径。
  //
  // v3.87：成本口径改为与 Finance 完全一致。之前用常数估算，有两处错误：
  //   1) 车站成本写死 2.6 万元/天，而 2027/2030 剧本的 M 型站是 7.8 万元/天 → 低估约 3 倍
  //   2) 车辆成本用「426 万元/km/年」，隐含约 4 班/小时，但服务下限 fMin 是 8 班 → 低估约 2 倍
  // 两处叠加让估算的营业系数虚高到 125%，而真实值只有 10% 量级，
  // 结果是 AI 会把亏钱的线判成赚钱。车厢公里现在按服务下限实算。
  A.OPER_PER_KM = 426;    // 保留旧值供外部引用，不再参与估算
  A.estimate = function (g, route) {
    const ci = g.econ && g.econ.costIndex ? g.econ.costIndex(g.clock.y) : 1;
    const oi = g.econ && g.econ.opsIndex ? g.econ.opsIndex(g.clock.y) : 1;
    const city = g.city, W = city.W, H = city.H;
    const km = route.km, nst = route.stations.length;
    const type = route.type || 'underground';
    const cost = km * (CFG.cost.trackPerKm[type] || CFG.cost.trackPerKm.underground) * ci
      + nst * ((CFG.cost.station[type] && CFG.cost.station[type].M) || CFG.cost.station.underground.M) * ci;
    let cov = 0;
    for (const s of route.stations) {
      for (let j = Math.floor(s.y - 2.4); j <= Math.ceil(s.y + 2.4); j++)
        for (let i = Math.floor(s.x - 2.4); i <= Math.ceil(s.x + 2.4); i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          if (U.dist(i + 0.5, j + 0.5, s.x, s.y) > 2.4) continue;
          const c = j * W + i; cov += city.pop[c] + city.jobs[c];
        }
    }
    const rate = A.rideRate(g);
    const trips = cov * rate;
    const d = (g.model && g.model.daily) || {};
    // 各公司分开计价（v3.89）：新线收的是「乘客在本线坐的那几公里」按本线票制算的钱，
    // 不再从全网票款里按份额分。客流短、里程短，所以一条 3.7 km 的线几乎总是收起步价。
    const onKm = U.clamp(km * 0.55, 0.6, Math.max(0.6, km));
    const fOne = (CM.Model && CM.Model.fareAt && g.econ && g.econ.fare) ? CM.Model.fareAt(g.econ.fare, onKm) : 2;
    const yearFare = trips * fOne * 365 / 10000;
    const linePkm = trips * onKm;
    // 车辆：低频走廊也逃不掉最小发车间隔，因此按高峰下限算车厢公里
    const mc = CFG.metro, fq = mc.fMin ? mc.fMin[0] : 8;
    const cars = (mc.carsBySize && mc.carsBySize.M) || 6;
    const carKmYear = fq * km * cars * 19 * 365;
    const trainYear = carKmYear * CFG.ops.carKmCost * oi;
    const stYear = nst * ((CFG.ops.stationDaily && CFG.ops.stationDaily.M) || 2.6) * oi * 365;
    const yearOps = trainYear + stYear;
    const cover = yearOps > 0 ? yearFare / yearOps : 0;
    // 线路自身的需求密度（人/线路公里·日）：这是「这条走廊养不养得起地铁」的真判据
    const density = km > 0 ? trips / km : 0;
    return {
      cost: cost, cov: cov, trips: trips, yearFare: yearFare, yearOps: yearOps, cover: cover,
      trainYear: trainYear, stYear: stYear, density: density, fareOne: fOne, linePkm: linePkm,
      years: yearFare > yearOps ? cost / (yearFare - yearOps) : Infinity,
    };
  };

  // ---------------- PPP 报价（v3.88） ----------------
  // 国内票价下人公里收入只有日本的三分之一（见 A.estimate 注释），单靠票款养不活一条线。
  // 所以 AI 私营公司的收入 = 票款 + 政府支付的可用性付费：
  //   ask = capex × 年金系数(私人回报率, 特许期) + max(0, 年运营成本 − 年票款)
  // 政府这边的判断不是「哪个更省钱」，而是「现在掏不掏得出这笔资本金」：
  //   自建 = 当期一次性 capex，之后每年补运营缺口
  //   PPP  = 不出 capex，每年付 ask（含资本回收与回报），特许期满资产移交
  // 私人要求的回报（8%）高于政府融资成本（4%），所以 PPP 的净现值必然更贵——
  // 这正是现实：地方做 PPP 是为了绕开当期资本性支出与财承上限，不是为了省钱。
  // 因此这条权衡成立的前提是「玩家财政真的紧」，与既有约束一致。
  A.PPP = { years: 25, privateIrr: 0.08, govRate: 0.04 };
  A.pvFactor = function (rate, n) { return rate > 0 ? (1 - Math.pow(1 + rate, -n)) / rate : n; };
  A.annuity = function (rate, n) { return rate > 0 ? rate / (1 - Math.pow(1 + rate, -n)) : 1 / n; };
  A.bid = function (g, route, opt) {
    const o = opt || {}, P = A.PPP;
    const n = o.years || P.years, irr = o.privateIrr == null ? P.privateIrr : o.privateIrr;
    const gr = o.govRate == null ? P.govRate : o.govRate;
    const est = route.est || A.estimate(g, route);
    const capex = est.cost, gap = Math.max(0, est.yearOps - est.yearFare);
    const ask = capex * A.annuity(irr, n) + gap;
    const pvSelf = capex + gap * A.pvFactor(gr, n);      // 自建：资本金当期 + 缺口年金
    const pvPpp = ask * A.pvFactor(gr, n);               // PPP：付费年金按政府折现率折现
    return {
      capex: capex, opexY: est.yearOps, fareY: est.yearFare, gap: gap,
      ask: ask, years: n, pvSelf: pvSelf, pvPpp: pvPpp, extra: pvPpp - pvSelf,
      cover: est.cover, density: est.density, km: route.km, nst: route.stations.length,
    };
  };

  // 站点 -> 所属公司（同一站被多条线服务时取最后一条，够用来做「优先从自家线延伸」）
  A.stationOwners = function (g) {
    const map = new Map();
    for (const id in g.net.segments) {
      const s = g.net.segments[id], L = g.net.lines[s.line];
      if (!L) continue;
      const ow = L.owner || 0;
      map.set(s.a, ow); map.set(s.b, ow);
    }
    return map;
  };

  A.nearestStation = function (g, x, y, orgId) {
    const own = A.stationOwners(g);
    let bestOwn = null, bdOwn = Infinity, best = null, bd = Infinity;
    for (const sid in g.net.stations) {
      const s = g.net.stations[sid];
      if (s.portal) continue;
      const d = U.dist(s.x, s.y, x, y);
      if (d < bd) { bd = d; best = s; }
      if ((own.get(sid) || 0) === (orgId || 0) && d < bdOwn) { bdOwn = d; bestOwn = s; }
    }
    return bestOwn || best;
  };

  // ---------------- 选址 ----------------
  // 对一个候选片区：从自有线网（没有就最近任何站）出发试算一条线，再按
  //   覆盖价值 × 共线加分 × 抢走廊扣分 × 收支是否成立
  // 综合排序。返回排第一的方案，附上全部试算结果便于调试。
  A.choose = function (g, orgId, opt) {
    const m = g.model, o = opt || {};
    if (!m || !m.zPop) return null;
    const acc = m.net && m.net.acc;
    const cands = [];
    for (let z = 0; z < m.Z; z++) {
      const pj = m.zPop[z] + m.zJobs[z];
      if (pj < (o.minPj || 8000)) continue;
      const cov = acc && acc.zCov ? (acc.zCov[z] || 0) : 0;
      if (cov > (o.maxCov || 0.6)) continue;
      cands.push({ z: z, x: m.zCx[z], y: m.zCy[z], pj: pj, cov: cov, score: pj * (1 - cov) });
    }
    cands.sort(function (a, b) { return b.score - a.score; });
    const tried = [];
    // 沿候选列表往下找，直到凑够 tryN 条值得试算的（不能只看前几个：靠前的往往离既有线太近）
    for (const c of cands) {
      if (tried.length >= (o.tryN || 8)) break;
      const from = o.from || A.nearestStation(g, c.x, c.y, orgId);
      if (!from) continue;
      const d = U.dist(from.x, from.y, c.x, c.y);
      if (d < (o.minCells || 8) || d > (o.maxCells || 30)) continue;
      const route = A.plan(g, { from: { x: from.x, y: from.y }, to: { x: c.x, y: c.y }, orgId: orgId });
      if (!route.ok) continue;
      const conf = A.conflict(g, orgId, route.pts);
      const est = A.estimate(g, route);
      // 准入门槛按真实账本校准（v3.88）：票款按清分口径只能覆盖一到两成运营成本，
      // 百分之百覆盖在国内票价下数学上不可能（要 11,000 人/线路公里·日以上，东京量级）。
      // 所以门槛不用「覆盖多少」，而是「这条走廊值不值得谈一份合同」：
      // 密度够撑起基本客流（≥1,500 人/线路公里·日），票款至少能覆盖 8%。
      // 真正的闸门是财承上限——能不能签得下，由 PPP 模块按 10% 红线判定。
      const ok = est.cover >= (o.minCover || 0.08) && est.density >= (o.minDensity || 1500);
      const score = c.score * (1 + 0.5 * conf.own) * (1 - 0.9 * conf.other) * (ok ? 1 : 0.25);
      tried.push({ z: c.z, from: { x: from.x, y: from.y }, to: { x: c.x, y: c.y }, route: route, conf: conf, est: est, ok: ok, score: score });
    }
    tried.sort(function (a, b) { return b.score - a.score; });
    if (!tried.length) return null;
    const best = tried[0];
    best.all = tried;
    return best;
  };

  // ---------------- 走廊建议 ----------------
  // 从人口最密的格子（主城）出发，向北/东/南/西四个方向各找一个「人口高地」作为终点。
  // 四个方向天然覆盖不同地形（跨江、跨山、沿主轴、去新区），适合用来检验线形。
  A.suggest = function (g, n) {
    const city = g.city, W = city.W, H = city.H;
    const out = [];
    if (!city) return out;
    const val = function (c) { return city.pop[c] + city.jobs[c]; };
    // 主城：全图人口+岗位最高的、非水面的格
    let best = -1, bx = 0, by = 0;
    for (let c = 0; c < city.N; c++) {
      if (city.lu[c] === LU.WATER) continue;
      const v = val(c);
      if (v > best) { best = v; bx = c % W + 0.5; by = ((c / W) | 0) + 0.5; }
    }
    if (best <= 0) return out;
    const DIRS = [[0, -1, '北'], [1, 0, '东'], [0, 1, '南'], [-1, 0, '西']];
    for (const d of DIRS) {
      let bw = -1, tx = 0, ty = 0;
      // 沿方向 15–34 格范围内找人口高地（这一步看的是「值不值得去」，不是「好不好修」）
      for (let r = 15; r <= 34; r++) {
        for (let s = -10; s <= 10; s++) {
          const i = Math.floor(bx + d[0] * r + (d[1] ? s : 0));
          const j = Math.floor(by + d[1] * r + (d[0] ? s : 0));
          if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) continue;
          const c = j * W + i;
          if (city.lu[c] === LU.WATER) continue;
          if (city.cellLocked(c)) continue;
          const w = val(c) * (1 - Math.abs(s) / 14);
          if (w > bw) { bw = w; tx = i + 0.5; ty = j + 0.5; }
        }
      }
      if (bw <= 0) continue;
      out.push({ from: { x: bx, y: by }, to: { x: tx, y: ty }, dir: d[2], km: U.dist(bx, by, tx, ty) * CFG.CELL_M / 1000, pj: bw });
    }
    // 人口高地优先，但四个方向都保留，便于对比线形
    return n ? out.slice(0, n) : out;
  };
})(window.CM);
