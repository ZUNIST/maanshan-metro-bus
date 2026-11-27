// 原型：按「到城镇中心的距离 + 道路等级」给每条道路推年代，估算 2000 年可见里程
// 用法：node tools/proto-roadyear-field.mjs
import { readFileSync } from 'node:fs';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/maanshan-metro-repo/city-and-metro-bus';
const src = readFileSync(ROOT + '/js/data_ms.js', 'utf8');

// 取 data_ms 的 centers（人口/岗位中心，坐标单位格）
const ci = src.indexOf('centers: [');
const cj = src.indexOf('\n  ],', ci);
const centers = [];
for (const m of src.slice(ci, cj).matchAll(/\{\s*x:\s*([\d.]+),\s*y:\s*([\d.]+),\s*pop:\s*(\d+),\s*jobs:\s*(\d+),\s*r:\s*([\d.]+)/g)) {
  centers.push({ x: +m[1], y: +m[2], pop: +m[3], jobs: +m[4], r: +m[5] });
}
const hist = {}; for (const c of centers) { const k = c.pop >= 20000 ? '>=20000' : c.pop >= 8000 ? '8000-20000' : c.pop >= 3000 ? '3000-8000' : '<3000'; hist[k] = (hist[k]||0)+1; }
console.log('centers:', centers.length, JSON.stringify(hist));

// 网格：4 格 / 块
const B = 4, BW = 104, BH = 82;
const big = centers.filter(c => c.pop >= 8000);       // 城镇中心（县城、城区片区）
const small = centers.filter(c => c.pop < 3000);      // 乡村居民点，只给很近的路

// 距离分档（格）：越远年代越晚
const BANDS = [[8, 1995], [16, 2002], [26, 2010], [40, 2016], [999, 2022]];
function distAt(x, y) {
  let d = Infinity;
  for (const c of big) d = Math.min(d, Math.hypot(x - c.x, y - c.y));
  for (const c of small) d = Math.min(d, Math.hypot(x - c.x, y - c.y) + 4);   // 乡村点等效退后 4 格
  return d;
}
function yearAt(x, y, cls) {
  const d = distAt(x, y);
  // 快速路（cls 4）只按快照/考据判定，不因靠近城镇就提前：2000 年前马鞍山只有宁马、宁芜两条高速
  if (cls >= 4) for (const [lim, yr] of BANDS) if (d <= lim) return yr;
  // 主干道（cls 3）只比同位置的一般道路早一档，且只在城镇核心 12 格内
  if (cls === 3) return Math.min(d <= 16 ? 2000 : 2010, d <= 8 ? 1995 : 9999);
  for (const [lim, yr] of BANDS) if (d <= lim) return yr;
  return 2022;
}

// 读 geo_ms 的道路
const ctx = { CM: {}, console }; ctx.window = ctx;
const vm = await import('node:vm');
vm.createContext(ctx);
vm.runInContext(readFileSync(ROOT + '/js/geo_ms.js', 'utf8'), ctx, { filename: 'geo_ms.js' });
const G = ctx.CM.GEOS.ms, names = G.names || [], roads = G.roads || [];

function decode(s) {
  const pts = []; let x = 0, y = 0, i = 0;
  const next = () => { let u = 0, sh = 0; for (;;) { const c = s.charCodeAt(i++) - 63; u |= (c & 31) << sh; if (c < 32) break; sh += 5; } return (u & 1) ? ~(u >> 1) : (u >> 1); };
  while (i < s.length) { x += next(); y += next(); pts.push([x / 64, y / 64]); }
  return pts;
}

// 已考据的年份（roadYears），优先级最高
const grab = key => {
  const i = src.indexOf(key + ':'), j = src.indexOf('\n    }', i);
  const out = {};
  for (const m of src.slice(i, j).matchAll(/'([^']+)':\s*(\d{4})/g)) out[m[1]] = +m[2];
  return out;
};
const RY = grab('roadYears');
const yearOfName = name => {
  if (!name) return null;
  if (RY[name] != null) return RY[name];
  let best = null, bl = 0;
  for (const k in RY) if (k.length > bl && name.indexOf(k) === 0) { best = RY[k]; bl = k.length; }
  return best;
};

let totalKm = 0, km2000 = 0, km2010 = 0, km2020 = 0;
const byCls = {};
for (const [ni, cls, , s] of roads) {
  const pts = decode(s);
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  L *= 0.25;
  totalKm += L;
  const mid = pts[Math.floor(pts.length / 2)];
  const fixed = yearOfName(names[ni] || '');
  const y = fixed != null ? fixed : yearAt(mid[0], mid[1], cls);
  const b = (byCls[cls] = byCls[cls] || { km: 0, k2k: 0 });
  b.km += L;
  if (y <= 2000) { km2000 += L; b.k2k += L; }
  if (y <= 2010) km2010 += L;
  if (y <= 2020) km2020 += L;
}
console.log(`\n总里程 ${totalKm.toFixed(0)} km`);
console.log(`2000 年可见 ${km2000.toFixed(0)} km (${(km2000 / totalKm * 100).toFixed(0)}%) —— 目标约 40–50%`);
console.log(`2010 年可见 ${km2010.toFixed(0)} km (${(km2010 / totalKm * 100).toFixed(0)}%)`);
console.log(`2020 年可见 ${km2020.toFixed(0)} km (${(km2020 / totalKm * 100).toFixed(0)}%)`);
for (const [c, b] of Object.entries(byCls)) console.log(`  cls ${c}: ${b.km.toFixed(0)} km，2000 年 ${(b.k2k / b.km * 100).toFixed(0)}%`);
