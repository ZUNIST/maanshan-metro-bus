// 从 OSM（Overpass out geom JSON）生成城市与地铁的 geo_<id>.js
// 坐标：格（250 m）；编码与 js/geo.js 的 dec()/enc() 完全一致（×64 取整 + 差分 + zigzag + 每 5 位一字符）
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache';
const OUT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/city-and-metro/js/geo_ms.js';
const ID = 'ms';

// 地图范围与格网：416 × 328 格（104 km × 82 km），交通小区 8 格
const BBOX = { s: 31.325, w: 117.835, n: 32.070, e: 118.900 };
const W = 416, H = 328;
const KX = W / (BBOX.e - BBOX.w), KY = H / (BBOX.n - BBOX.s);

const proj = (lat, lon) => [(lon - BBOX.w) * KX, (BBOX.n - lat) * KY];

// ---------- 编码 ----------
function enc(flat) {
  let s = '', px = 0, py = 0;
  const put = function (v) { let u = v < 0 ? ~(v << 1) : (v << 1); while (u >= 32) { s += String.fromCharCode((32 | (u & 31)) + 63); u >>>= 5; } s += String.fromCharCode(u + 63); };
  for (let k = 0; k + 1 < flat.length; k += 2) {
    const x = Math.round(flat[k] * 64), y = Math.round(flat[k + 1] * 64);
    put(x - px); px = x;
    put(y - py); py = y;
  }
  return s;
}

// ---------- 几何处理 ----------
// 开放折线简化（Douglas–Peucker，索引 a..b 闭区间）
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
      const k = a + i, px = flat[2 * k], py = flat[2 * k + 1];
      const d = Math.abs((px - ax) * dy - (py - ay) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([i0, bi], [bi, i1]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[2 * (a + i)], flat[2 * (a + i) + 1]);
  return out;
}
// 简化入口：闭合环不能直接用 DP（首尾重合使基准线长度为 0），先从离首点最远的点切成两段
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
function decTmp(str, from) { const out = []; let i = from || 0, x = 0, y = 0; while (i < str.length) { let r = 0, sh = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); x += (r & 1) ? ~(r >> 1) : (r >> 1); r = 0; sh = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); y += (r & 1) ? ~(r >> 1) : (r >> 1); out.push(x / 64, y / 64); } return out; }
const geoOf = (g) => { const f = new Float64Array(g.length * 2); for (let i = 0; i < g.length; i++) { const p = proj(g[i].lat, g[i].lon); f[2 * i] = p[0]; f[2 * i + 1] = p[1]; } return f; };
const closed = (g) => g.length > 2 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
// 多边形面积（格²，鞋带公式）。用于剔除 250 m 网格上的小水塘噪点
const polyArea = (f) => {
  let a = 0;
  const n = f.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (f[2 * j] + f[2 * i]) * (f[2 * j + 1] - f[2 * i + 1]);
  return Math.abs(a / 2);
};
const inBox = (f) => { for (let i = 0; i < f.length; i += 2) if (f[i] > -2 && f[i] < W + 2 && f[i + 1] > -2 && f[i + 1] < H + 2) return true; return false; };

// 关系多边形：按端点缝合成员 way
function stitch(members) {
  const segs = members.filter(m => m.geometry && m.geometry.length > 1).map(m => m.geometry.slice());
  const rings = [];
  const key = (p) => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
  let pool = segs;
  while (pool.length) {
    let cur = pool.shift();
    let guard = 0;
    while (guard++ < 5000) {
      if (key(cur[0]) === key(cur[cur.length - 1])) break;
      const tail = key(cur[cur.length - 1]);
      let found = -1, rev = false;
      for (let i = 0; i < pool.length; i++) {
        if (key(pool[i][0]) === tail) { found = i; break; }
        if (key(pool[i][pool[i].length - 1]) === tail) { found = i; rev = true; break; }
      }
      if (found < 0) break;
      const next = pool.splice(found, 1)[0];
      const add = rev ? next.slice().reverse() : next.slice();
      cur = cur.concat(add.slice(1));
    }
    if (cur.length > 3 && key(cur[0]) === key(cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}

// ---------- 载入 ----------
const load = async (name) => { try { return JSON.parse(await readFile(path.join(CACHE, name + '.json'), 'utf8')).elements || []; } catch { return []; } };
const [waterWays, waterRels, waterway, roads, rail, green, admin, places, poiRaw, busRaw, landuseRaw] = await Promise.all(
  ['water', 'waterRel', 'waterway', 'roads', 'rail', 'green', 'admin', 'places', 'poi', 'busstop', 'landuse'].map(load));

// ---------- 名称表 ----------
const names = [''];
const nameIdx = new Map();
function nm(s) {
  s = (s || '').trim();
  if (!s) return 0;
  if (nameIdx.has(s)) return nameIdx.get(s);
  names.push(s); nameIdx.set(s, names.length - 1);
  return names.length - 1;
}

// ---------- 水面（多边形） ----------
const water = [];
let skipped = 0;
for (const e of waterWays) {
  if (e.type !== 'way' || !e.geometry || e.geometry.length < 4 || !closed(e.geometry)) { skipped++; continue; }
  const f = geoOf(e.geometry);
  if (!inBox(f)) continue;
  // 面积不足 1 个 250 m 格（6.25 公顷）且没有名字的水塘，在网格地图上是纯噪点；
  // 各区域统一按此标准过滤，避免「某个县的 OSM 标了上万个水塘」拉高该区观感精细度
  if (!(e.tags && e.tags.name) && polyArea(f) < 1.0) { skipped++; continue; }
  const p = dp(f, 0.09, true);
  const s = enc(p);
  if (s.length < 6) continue;
  water.push([nm(e.tags && e.tags.name), 'o' + s]);
}
for (const e of waterRels) {
  if (e.type !== 'relation' || !e.members) continue;
  const outer = e.members.filter(m => m.type === 'way' && (m.role === 'outer' || !m.role));
  const inner = e.members.filter(m => m.type === 'way' && m.role === 'inner');
  const row = [nm(e.tags && e.tags.name)];
  for (const ring of stitch(outer)) { const f = geoOf(ring); if (!inBox(f)) continue; const s = enc(dp(f, 0.09, true)); if (s.length > 6) row.push('o' + s); }
  for (const ring of stitch(inner)) { const f = geoOf(ring); if (!inBox(f)) continue; const s = enc(dp(f, 0.09, true)); if (s.length > 6) row.push('i' + s); }
  if (row.length > 1) water.push(row);
}
// 水面线（河、渠、溪）：[名称, 半宽(格), 坐标]
const WID = { river: 0.16, canal: 0.1, stream: 0.055, drain: 0.05 };
let wl = 0;
for (const e of waterway) {
  if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
  const t = e.tags && e.tags.waterway;
  const f = geoOf(e.geometry);
  if (!inBox(f)) continue;
  const s = enc(dp(f, 0.09, false));
  if (s.length < 4) continue;
  water.push([nm(e.tags && e.tags.name), WID[t] || 0.05, s]);
  wl++;
}

// ---------- 道路 ----------
// 引擎只使用 2（次干道）、3（主干道）、4（快速路）三级；支路一律并入次干道，细小的街巷另由 streets 提供
const CLS = { motorway: 4, trunk: 3, primary: 3, secondary: 2, tertiary: 2, residential: 2, unclassified: 2 };
const roadsOut = [], streets = [];
const roadNames = new Map();
for (const e of roads) {
  if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
  const t = e.tags || {};
  const hw = t.highway || '';
  const link = /_link$/.test(hw);
  const base = link ? hw.replace(/_link$/, '') : hw;
  const cls = CLS[base] || 2;
  const f = geoOf(e.geometry);
  if (!inBox(f)) continue;
  const p = dp(f, link ? 0.12 : 0.08, false);
  const s = enc(p);
  if (s.length < 4) continue;
  let flags = 0;
  if (t.bridge && t.bridge !== 'no') flags |= 1;
  if (t.tunnel && t.tunnel !== 'no') flags |= 2;
  if (link) flags |= 4;
  if (t.expressway === 'yes' && cls < 4) { /* 快速路按等级已定 */ }
  const name = t.name || '';
  roadsOut.push([nm(name), cls, flags, s]);
  streets.push(s);
  if (name) roadNames.set(name, cls);
}

// ---------- 高德路网补充（style=8 瓦片提取的骨架路网）----------
// OSM 在江南（当涂、博望、和县）只覆盖到骨架，村道大量缺失；
// tools/fetch-amap-roads.mjs 从高德纯路网瓦片里提取了中心线，这里并入车行路网。
// 统一按 cls 2（支路）处理，与已有 OSM 道路重合处会叠画，不影响观感。
let amapRoadN = 0;
try {
  const { readdir: rd, readFile: rf } = await import('node:fs/promises');
  const dir2 = (await rd('./tools')).filter(f => /^amap-roads-.*\.json$/.test(f));
  for (const fn of dir2) {
    const d = JSON.parse(await rf('./tools/' + fn, 'utf8'));
    for (const seg of d.segs) {
      if (!seg || seg.length < 2) continue;
      const f = new Float64Array(seg.length * 2);
      for (let i = 0; i < seg.length; i++) { f[2 * i] = seg[i][0]; f[2 * i + 1] = seg[i][1]; }
      if (!inBox(f)) continue;
      const p = dp(f, 0.1, false);
      const s = enc(p);
      if (s.length < 4) continue;
      roadsOut.push([0, 2, 0, s]);
      streets.push(s);
      amapRoadN++;
    }
  }
} catch (e) { /* 没有补充数据就跳过 */ }
console.log('高德路网补充:', amapRoadN, '条');

// ---------- 街区内部路（只进 streets，不进车行路网）----------
const minorRaw = await load('minor');
let minorN = 0;
for (const e of minorRaw) {
  if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
  const hw = (e.tags && e.tags.highway) || '';
  if (hw !== 'service' && hw !== 'living_street') continue;
  const f = geoOf(e.geometry);
  if (!inBox(f)) continue;
  const s = enc(dp(f, 0.1, false));
  if (s.length < 4) continue;
  streets.push(s); minorN++;
}

// ---------- 铁路 ----------
const railOut = [];
for (const e of rail) {
  if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
  const t = e.tags || {};
  const f = geoOf(e.geometry);
  if (!inBox(f)) continue;
  const s = enc(dp(f, 0.08, false));
  if (s.length < 4) continue;
  let flags = 0;
  if (t.bridge && t.bridge !== 'no') flags |= 1;
  if (t.tunnel && t.tunnel !== 'no') flags |= 2;
  const spd = Number(t.maxspeed) || 0;
  const hsr = spd >= 250 || /高铁|客专|城际/.test(t.name || '');
  if (hsr) flags |= 16;
  const year = /宁安/.test(t.name || '') ? 2015 : /合杭|商合杭/.test(t.name || '') ? 2020 : /宁芜/.test(t.name || '') ? 1935 : (/巢马/.test(t.name || '') ? 2026 : 0);
  railOut.push([nm(t.name || ''), flags, s, year]);
}

// 规划补齐（v3.16）：OSM 只测绘了巢马高铁正线（巢湖东—马鞍山南），接入马鞍山东站的联络线尚未入库。
// 按官方规划与国铁集团公布的站名补画，与正线同年（2026）通车；flags 17 = 高架桥梁 + 高铁。
{
  const extra = JSON.parse(await readFile(path.join(CACHE, 'rail-extra.json'), 'utf8'));
  for (const r of extra) {
    const f = new Float64Array(r.pts.length * 2);
    for (let i = 0; i < r.pts.length; i++) { f[2 * i] = r.pts[i][0]; f[2 * i + 1] = r.pts[i][1]; }
    const s2 = enc(dp(f, 0.08, false));
    if (s2.length >= 4) { railOut.push([nm(r.n || ''), r.flags || 0, s2, r.year || 0]); console.log('补充规划铁路：' + (r.n || ''), r.pts.length + ' 点'); }
  }
}

// ---------- 绿地 ----------
const parksOut = [], woodsOut = [], reservesOut = [];
for (const e of green) {
  if (e.type !== 'way' || !e.geometry || e.geometry.length < 4 || !closed(e.geometry)) continue;
  const t = e.tags || {};
  const f = geoOf(e.geometry);
  if (!inBox(f)) continue;
  const s = enc(dp(f, 0.1, true));
  if (s.length < 6) continue;
  const row = [nm(t.name), 'o' + s];
  if (t.leisure === 'nature_reserve') reservesOut.push(row);
  else if (t.leisure === 'park' || t.leisure === 'garden') parksOut.push(row);
  // 只有 forest / natural=wood 算林地；grass、meadow 是城市草地、田埂与河滩，按未开发用地处理，
  // 否则县城和镇区会长满树（v2.9 修正）
  else if (t.landuse === 'forest' || t.natural === 'wood') woodsOut.push(row);
}

// ---------- 行政界线（区县 6/7、乡镇街道 8） ----------
const adminOut = [];
for (const e of admin) {
  if (e.type !== 'relation' || !e.members || !e.tags) continue;
  const lv = Number(e.tags.admin_level);
  if (!lv) continue;
  const outer = e.members.filter(m => m.type === 'way' && (m.role === 'outer' || !m.role));
  const inner = e.members.filter(m => m.type === 'way' && m.role === 'inner');
  const row = [lv, nm(e.tags.name)];
  for (const ring of stitch(outer)) { const f = geoOf(ring); if (!inBox(f)) continue; const s = enc(dp(f, 0.1, true)); if (s.length > 6) row.push('o' + s); }
  for (const ring of stitch(inner)) { const f = geoOf(ring); if (!inBox(f)) continue; const s = enc(dp(f, 0.1, true)); if (s.length > 6) row.push('i' + s); }
  if (row.length > 2) adminOut.push(row);
}

// 邻市的区县（南京、芜湖、合肥、滁州）：其境内的乡镇街道界线不输出，玩家片区按区县整体归属邻市，
// 同时避免与马鞍山同名的街道（如江东街道、梅山街道）串到市区片区里
const NEIGHBORS = new Set(['浦口区', '玄武区', '鼓楼区', '建邺区', '雨花台区', '栖霞区', '秦淮区', '江宁区', '溧水区', '高淳区', '镜湖区', '鸠江区', '弋江区', '无为市', '巢湖市', '肥东县', '全椒县', '江北新区']);
{
  const ringsOf = function (row) { const out = []; for (const s of row.slice(2)) { const p = decTmp(s, 1); if (p.length >= 6) out.push(p); } return out; };
  const nei = [];
  for (const row of adminOut) {
    const nmv = names[row[1]];
    if (row[0] !== 6 && row[0] !== 7) continue;
    if (!NEIGHBORS.has(nmv)) continue;
    for (const r of ringsOf(row)) nei.push(r);
  }
  const inside = function (x, y) {
    let hit = false;
    for (const p of nei) {
      const n = p.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
      }
    }
    return hit;
  };
  const kept = [];
  let dropped = 0;
  // 沈巷镇：2011 年区划调整时留在芜湖市鸠江区，但本图按和县的一部分处理（见 data_ms.js 的片区说明），
  // 因此它的乡镇界线要保留，否则片区无法按街道名称划定
  const KEEP_TOWNS = new Set(['沈巷镇']);
  for (const row of adminOut) {
    if (row[0] !== 8) { kept.push(row); continue; }
    if (KEEP_TOWNS.has(names[row[1]])) { kept.push(row); continue; }
    const rs = ringsOf(row);
    if (!rs.length) { kept.push(row); continue; }
    const p0 = rs[0];
    let cx = 0, cy = 0, cn = 0;
    for (let i = 0; i < p0.length; i += 2) { cx += p0[i]; cy += p0[i + 1]; cn++; }
    cx /= cn; cy /= cn;
    if (inside(cx, cy)) { dropped++; continue; }
    kept.push(row);
  }
  adminOut.length = 0;
  for (const r of kept) adminOut.push(r);
  console.log('邻市境内乡镇界线已剔除', dropped, '个，保留界线', adminOut.length, '个');
}
// ---------- 地名 ----------
const placesOut = [];
for (const e of places) {
  if (e.type !== 'node' || !e.tags) continue;
  const p = proj(e.lat, e.lon);
  if (p[0] < 0 || p[1] < 0 || p[0] > W || p[1] > H) continue;
  const name = e.tags.name; if (!name) continue;
  const type = e.tags.railway === 'station' || e.tags.railway === 'halt' ? 1 : 2;
  placesOut.push([name, +p[0].toFixed(2), +p[1].toFixed(2), type]);
}

// ---------- 地名补充（v3.3）----------
// OSM 的马鞍山江南（市区、当涂、博望）自然村标注明显比江西（含山、和县）稀，
// 导致设站时可选的地名少很多。这里用兴趣点、公交站名和具名地物补充，统一记为 type 3：
// 只参与车站取名，不参与「镇区」判定（那里只认 type 2），也不画在图面上。
{
  const have = new Set(placesOut.map(function (p) { return p[0]; }));
  const nearExisting = [];
  for (const p of placesOut) nearExisting.push(p[1], p[2]);
  const nearOk = function (x, y, r) {
    const r2 = r * r;
    for (let i = 0; i < nearExisting.length; i += 2) {
      const dx = nearExisting[i] - x, dy = nearExisting[i + 1] - y;
      if (dx * dx + dy * dy < r2) return false;
    }
    return true;
  };
  const bad = function (n) {
    if (!n || n.length < 2 || n.length > 14) return true;
    if (/^[A-Za-z0-9\s\-_.·]+$/.test(n)) return true;          // 纯英文 / 编号
    if (/^[\d\s]+$/.test(n)) return true;
    if (/停靠点|收费站|服务区|停车区|加油站|充电站|公厕|入口|出口|大门|停车场|公交站$/.test(n)) return true;
    return false;
  };
  const push = function (n, x, y) {
    n = (n || '').trim(); if (bad(n) || have.has(n)) return false;
    have.add(n);
    placesOut.push([n, +x.toFixed(2), +y.toFixed(2), 3]);
    nearExisting.push(x, y);
    return true;
  };
  const at = function (e) {
    if (e.type === 'node') return [e.lat, e.lon];
    if (e.center) return [e.center.lat, e.center.lon];
    if (e.geometry && e.geometry.length) return [e.geometry[0].lat, e.geometry[0].lon];
    return null;
  };
  let n1 = 0, n2 = 0;
  // 一级：兴趣点与公交站（城镇里密度高，站名更贴近实际）
  for (const arr of [poiRaw, busRaw]) {
    for (const e of arr) {
      const t = e.tags || {}; if (!t.name) continue;
      const ll0 = at(e); if (!ll0) continue;
      const p = proj(ll0[0], ll0[1]);
      if (p[0] < 0 || p[1] < 0 || p[0] > W || p[1] > H) continue;
      if (push(t.name, p[0], p[1])) n1++;
    }
  }
  // 二级：具名的水库、圩、山塘、园区、小区（只有附近 500 m 内没有别的名字时才采用，
  // 避免「某某水库」抢掉村子与镇区的名字）
  const layers = [[waterWays, 0], [landuseRaw, 1], [green, 2], [roads, 3]];
  for (const [arr, li] of layers) {
    for (const e of arr) {
      const t = e.tags || {}; if (!t.name) continue;
      const keep = li === 0 ? /水库|湖|塘|圩|河|闸|站/.test(t.name)
        : li === 1 ? /园区|工业|小区|新村|社区|村|厂|矿/.test(t.name)
        : li === 2 ? /公园|景区|园|林场/.test(t.name) : false;
      if (!keep) continue;
      const ll0 = at(e); if (!ll0) continue;
      const p = proj(ll0[0], ll0[1]);
      if (p[0] < 0 || p[1] < 0 || p[0] > W || p[1] > H) continue;
      if (!nearOk(p[0], p[1], 2.0)) continue;          // 2 格 = 500 m
      if (push(t.name, p[0], p[1])) n2++;
    }
  }
  console.log('地名补充：兴趣点与公交站', n1, '个，具名地物', n2, '个，合计', placesOut.length);
}

// ---------- 输出 ----------
const body = `'use strict';
// 由 OpenStreetMap 数据生成（© OpenStreetMap 贡献者，ODbL）。坐标为游戏格（250 m），折线为增量编码，1/64 格精度。
// 范围：马鞍山市全域（含山县、和县、花山区、雨山区、博望区、当涂县），${W} × ${H} 格（约 ${Math.round(W * 0.25)} km × ${Math.round(H * 0.25)} km）。
(function (CM) {
  (CM.GEOS = CM.GEOS || {}).${ID} = {
    proj: ${JSON.stringify({ lon0: +BBOX.w.toFixed(12), lat0: +BBOX.n.toFixed(12), kx: +KX.toFixed(2), ky: +KY.toFixed(2) })},
    names: ${JSON.stringify(names)},
    water: [
${water.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    roads: [
${roadsOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    streets: ${JSON.stringify(streets.join('!'))},
    rail: [
${railOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    parks: [
${parksOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    reserves: [
${reservesOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    woods: [
${woodsOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    admin: [
${adminOut.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    places: ${JSON.stringify(placesOut)}
  };
})(window.CM);
`;
await writeFile(OUT, body);
const mb = (body.length / 1048576).toFixed(2);
console.log(JSON.stringify({
  out: OUT, MB: mb, names: names.length, water: water.length, waterLines: wl, roads: roadsOut.length,
  streets: streets.length, rail: railOut.length, parks: parksOut.length, woods: woodsOut.length,
  reserves: reservesOut.length, admin: adminOut.length, places: placesOut.length, skippedWater: skipped,
}));
const lvls = {};
for (const r of adminOut) lvls[r[0]] = (lvls[r[0]] || 0) + 1;
console.log('admin levels', lvls);
console.log('admin names', adminOut.map(r => r[0] + ':' + names[r[1]]).join(' | '));
