// 从 geo_ms.js 裁出和县（含沈巷）地图的地理数据 → js/geo_hx.js
//
// 为什么不是重新拉 OSM：和县本来就在马鞍山全域图（416×328 格，1.065°×0.745°）的范围内，
// 底图的水系、道路、铁路、行政界线、地名都已经解码过一次并做过抽稀。这里把 geo_ms 的几何
// 解码回经纬度，再按新格网重投影、按新范围裁剪，得到一张独立的地图：数据来源完全一致，
// 不会出现「同一段长江在两套地图上宽度不同」的问题，也不需要重新请求 Overpass。
//
// 新格网：232 × 288 格（58 km × 64.9 km，格边长仍为 250 m）
//   西：117.940（含山、全椒一侧的县界外缘）
//   东：118.5525（长江东岸，含高家冲、马鞍山南站、采石、当涂县城与马鞍山东站）
//   北：32.0466（石杨、善厚北缘，接全椒）
//   南：31.398（沈巷、白桥以南的裕溪河一带）
// 坐标编码与 js/geo.js 的 dec()/enc() 完全一致（×64 取整 + 差分 + zigzag + 每 5 位一字符）。
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'city-and-metro-bus/js/geo_ms.js');
const OUT = path.join(root, 'city-and-metro-bus/js/geo_hx.js');
const ID = 'hx';
const W = 232, H = 288;
const BOX = { s: 31.398, w: 117.94, n: 31.398 + H / 444, e: 117.94 + W / 378.8 };

// ---------- 载入源数据 ----------
const sandbox = { window: { CM: {} } };
vm.runInNewContext(await readFile(SRC, 'utf8'), sandbox, { filename: 'geo_ms.js', timeout: 30000 });
const G = sandbox.window.CM.GEOS.ms;
const PA = G.proj, PB = { lon0: BOX.w, lat0: BOX.n, kx: W / (BOX.e - BOX.w), ky: H / (BOX.n - BOX.s) };

// 仿射换算（两套投影都是等距圆柱，可直接合成）
// 注意 y 轴：格坐标向南增大，lat = lat0 - y/ky，因此 y_新 = (lat0_新 - lat0_旧)·ky_新 + y_旧·(ky_新/ky_旧)
const SX = PB.kx / PA.kx, SY = PB.ky / PA.ky;
const TX = (PA.lon0 - PB.lon0) * PB.kx, TY = (PB.lat0 - PA.lat0) * PB.ky;
const px = x => x * SX + TX, py = y => y * SY + TY;

// ---------- 解码 / 编码 ----------
function dec(s, from) {
  const out = []; let i = from || 0, x = 0, y = 0;
  while (i < s.length) {
    let r = 0, sh = 0, b;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    x += (r & 1) ? ~(r >> 1) : (r >> 1);
    r = 0; sh = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    y += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push(x / 64, y / 64);
  }
  return out;
}
function enc(flat) {
  let s = '', cx = 0, cy = 0;
  const put = v => { let u = v < 0 ? ~(v << 1) : (v << 1); while (u >= 32) { s += String.fromCharCode((32 | (u & 31)) + 63); u >>>= 5; } s += String.fromCharCode(u + 63); };
  for (let k = 0; k + 1 < flat.length; k += 2) {
    const x = Math.round(flat[k] * 64), y = Math.round(flat[k + 1] * 64);
    put(x - cx); cx = x; put(y - cy); cy = y;
  }
  return s;
}

// ---------- 裁剪 ----------
const EPS = 1e-6;
function clipSeg(x0, y0, x1, y1) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const tests = [[-dx, x0], [dx, W - x0], [-dy, y0], [dy, H - y0]];
  for (const [p, q] of tests) {
    if (Math.abs(p) < EPS) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}
// 折线裁剪成若干段落在图内的连续折线
function clipLine(pts) {
  const runs = []; let cur = [];
  const flush = () => { if (cur.length >= 4) runs.push(cur); cur = []; };
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    const r = clipSeg(x0, y0, x1, y1);
    if (!r) { flush(); continue; }
    const [ax, ay, bx, by] = r;
    if (!cur.length) cur.push(ax, ay);
    else if (Math.abs(cur[cur.length - 2] - ax) > EPS || Math.abs(cur[cur.length - 1] - ay) > EPS) { flush(); cur.push(ax, ay); }
    cur.push(bx, by);
    if (Math.abs(bx - x1) > EPS || Math.abs(by - y1) > EPS) flush();
  }
  flush();
  return runs;
}
// 多边形（凸矩形）裁剪：Sutherland–Hodgman
function clipRing(pts) {
  // 输入是闭合环（首尾相同），先去掉尾点
  let poly = [];
  for (let i = 0; i + 1 < pts.length; i += 2) poly.push([pts[i], pts[i + 1]]);
  if (poly.length < 3) return null;
  const edges = [
    p => p[0] >= -EPS, p => p[0] <= W + EPS, p => p[1] >= -EPS, p => p[1] <= H + EPS,
  ];
  const inter = (a, b, k) => {
    if (k < 2) { const x = k === 0 ? 0 : W; const t = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + t * (b[1] - a[1])]; }
    const y = k === 2 ? 0 : H; const t = (y - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y];
  };
  for (let k = 0; k < 4; k++) {
    const inside = edges[k], out = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(inter(prev, cur, k)); out.push(cur); }
      else if (pi) out.push(inter(prev, cur, k));
    }
    poly = out;
    if (poly.length < 3) return null;
  }
  const flat = [];
  for (const p of poly) flat.push(p[0], p[1]);
  flat.push(poly[0][0], poly[0][1]);
  return flat;
}

// ---------- 抽稀（Douglas–Peucker）----------
function dpOpen(flat, a, b, eps) {
  const n = b - a + 1;
  if (n <= 2) { const out = []; for (let i = a; i <= b; i++) out.push(flat[2 * i], flat[2 * i + 1]); return out; }
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const ax = flat[2 * a], ay = flat[2 * a + 1], bx = flat[2 * b], by = flat[2 * b + 1];
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    if (i1 - i0 < 2) continue;
    let best = -1, bi = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const k = a + i;
      const d = Math.abs((flat[2 * k] - ax) * dy - (flat[2 * k + 1] - ay) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([i0, bi], [bi, i1]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[2 * (a + i)], flat[2 * (a + i) + 1]);
  return out;
}
function dp(flat, eps, closed) {
  const n = flat.length / 2;
  if (n <= 3) return Array.from(flat);
  if (!closed) return dpOpen(flat, 0, n - 1, eps);
  let far = 0, best = -1;
  for (let i = 1; i < n - 1; i++) {
    const d = Math.hypot(flat[2 * i] - flat[0], flat[2 * i + 1] - flat[1]);
    if (d > best) { best = d; far = i; }
  }
  const A = dpOpen(flat, 0, far, eps), B = dpOpen(flat, far, n - 1, eps);
  return A.concat(B.slice(2));
}
const area = f => {
  let a = 0; const n = f.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (f[2 * j] + f[2 * i]) * (f[2 * j + 1] - f[2 * i + 1]);
  return Math.abs(a / 2);
};

// ---------- 名称表 ----------
const names = [''];
const nameIdx = new Map();
const nm = s => { s = (s || '').trim(); if (!s) return 0; if (nameIdx.has(s)) return nameIdx.get(s); names.push(s); nameIdx.set(s, names.length - 1); return names.length - 1; };

// ---------- 逐类裁剪 ----------
let kept = { water: 0, roads: 0, rail: 0, green: 0, admin: 0, places: 0 };
const stats = { dropped: { water: 0, roads: 0, rail: 0, green: 0, admin: 0 } };

const waterOut = [];
for (const row of G.water) {
  const name = G.names[row[0]] || '';
  if (typeof row[1] === 'number') {
    // 水面线：[名称, 半宽, 坐标]
    const pts = dec(row[2]).map((v, i) => i % 2 ? py(v) : px(v));
    for (const run of clipLine(pts)) {
      const s = enc(dp(run, 0.09, false));
      if (s.length >= 4) { waterOut.push([nm(name), row[1], s]); kept.water++; }
    }
    continue;
  }
  const rings = [];
  for (const seg of row.slice(1)) {
    const closedRing = dec(seg, 1).map((v, i) => i % 2 ? py(v) : px(v));
    const clipped = clipRing(closedRing);
    if (!clipped) continue;
    const f = dp(clipped, 0.09, true);
    if (area(f) < 0.35) continue;   // 裁剪后不足 0.35 格² 的碎片（约 2 公顷）丢掉
    rings.push((seg[0] === 'i' ? 'i' : 'o') + enc(f));
  }
  if (rings.length) { waterOut.push([nm(name)].concat(rings)); kept.water++; } else stats.dropped.water++;
}

const roadsOut = [], streetsOut = [];
for (const row of G.roads) {
  const name = G.names[row[0]] || '';
  const pts = dec(row[3]).map((v, i) => i % 2 ? py(v) : px(v));
  for (const run of clipLine(pts)) {
    const s = enc(dp(run, 0.08, false));
    if (s.length < 4) continue;
    roadsOut.push([nm(name), row[1], row[2], s]);
    streetsOut.push(s); kept.roads++;
  }
}
for (const s of (G.streets || '').split('!')) {
  if (!s) continue;
  const pts = dec(s).map((v, i) => i % 2 ? py(v) : px(v));
  for (const run of clipLine(pts)) {
    const e2 = enc(dp(run, 0.1, false));
    if (e2.length >= 4) streetsOut.push(e2);
  }
}

const railOut = [];
for (const row of G.rail) {
  const name = G.names[row[0]] || '';
  const pts = dec(row[2]).map((v, i) => i % 2 ? py(v) : px(v));
  for (const run of clipLine(pts)) {
    const s = enc(dp(run, 0.08, false));
    if (s.length >= 4) { railOut.push([nm(name), row[1], s, row[3] || 0]); kept.rail++; }
  }
}

const greenOut = { parks: [], reserves: [], woods: [] };
for (const key of ['parks', 'reserves', 'woods']) {
  for (const row of G[key] || []) {
    const name = G.names[row[0]] || '';
    const rings = [];
    for (const seg of row.slice(1)) {
      const closedRing = dec(seg, 1).map((v, i) => i % 2 ? py(v) : px(v));
      const clipped = clipRing(closedRing);
      if (!clipped) continue;
      const f = dp(clipped, 0.1, true);
      if (area(f) < 0.35) continue;
      rings.push((seg[0] === 'i' ? 'i' : 'o') + enc(f));
    }
    if (rings.length) { greenOut[key].push([nm(name)].concat(rings)); kept.green++; }
  }
}

// 行政界线：全部保留（裁到图内）。和县的乡镇界线用来划分片区；
// 邻市（含山、芜湖鸠江、全椒、南京浦口）的界线连同边界一起画出来，玩家能看到县界。
const adminOut = [];
for (const row of G.admin) {
  const lv = row[0], name = G.names[row[1]] || '';
  const rings = [];
  for (const seg of row.slice(2)) {
    const closedRing = dec(seg, 1).map((v, i) => i % 2 ? py(v) : px(v));
    const clipped = clipRing(closedRing);
    if (!clipped) continue;
    const f = dp(clipped, 0.1, true);
    if (area(f) < 0.3) continue;
    rings.push((seg[0] === 'i' ? 'i' : 'o') + enc(f));
  }
  if (rings.length) { adminOut.push([lv, nm(name)].concat(rings)); kept.admin++; }
}

const placesOut = [];
for (const p of G.places || []) {
  const x = px(p[1]), y = py(p[2]);
  if (x < 0 || y < 0 || x > W || y > H) continue;
  // 第 5 项是命名类目（1 城市路名 / 2 大型商场 / 3 补充公交站名 / 4 学校与文化场馆），
  // data_hx.js 要用它给站点起名（与 data_ms.js 的 places 处理保持一致）；为 0 时省略以省体积
  placesOut.push(p[4] ? [p[0], +x.toFixed(2), +y.toFixed(2), p[3], p[4]] : [p[0], +x.toFixed(2), +y.toFixed(2), p[3]]);
  kept.places++;
}

// ---------- 输出 ----------
const body = `'use strict';
// 由 tools/build-geo-hx.mjs 从 geo_ms.js（OpenStreetMap，© OpenStreetMap 贡献者，ODbL）裁剪并重投影生成。
// 范围：和县（含沈巷）与长江东岸的采石—马鞍山南—当涂北缘，${W} × ${H} 格（约 ${(W * 0.25).toFixed(0)} km × ${(H * 0.25).toFixed(0)} km），格边长 250 m。
// 坐标为游戏格，折线为增量编码，1/64 格精度。
(function (CM) {
  (CM.GEOS = CM.GEOS || {}).${ID} = {
    proj: ${JSON.stringify({ lon0: +BOX.w.toFixed(12), lat0: +BOX.n.toFixed(12), kx: +PB.kx.toFixed(2), ky: +PB.ky.toFixed(2) })},
    names: ${JSON.stringify(names)},
    water: [
${waterOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    roads: [
${roadsOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    streets: ${JSON.stringify(streetsOut.join('!'))},
    rail: [
${railOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    parks: [
${greenOut.parks.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    reserves: [
${greenOut.reserves.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    woods: [
${greenOut.woods.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    admin: [
${adminOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    places: ${JSON.stringify(placesOut)}
  };
})(window.CM);
`;
await writeFile(OUT, body);
console.log(JSON.stringify({
  out: OUT, MB: +(body.length / 1048576).toFixed(2), box: BOX, grid: [W, H],
  names: names.length, ...kept, streets: streetsOut.length, dropped: stats.dropped,
}));
