// 诊断：马鞍山 2000 剧本里，道路按现有年代表算下来，哪些在 2000 年就存在
// 用法：node tools/diag-roads-2000.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/maanshan-metro-repo/city-and-metro-bus';
const ctx = { console, CM: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(ROOT + '/js/geo_ms.js', 'utf8'), ctx, { filename: 'geo_ms.js' });

const G = ctx.CM.GEOS.ms;
const names = G.names || [];
const roads = G.roads || [];
console.log('geo_ms 图层: roads=' + roads.length + ' names=' + names.length + ' water=' + (G.water || []).length);

// 从 data_ms.js 里抠两张年代表（不执行整个文件）
const src = readFileSync(ROOT + '/js/data_ms.js', 'utf8');
function grab(key) {
  const i = src.indexOf(key + ':');
  if (i < 0) return {};
  const j = src.indexOf('\n    }', i);
  const body = src.slice(i, j < 0 ? undefined : j);
  const out = {};
  for (const m of body.matchAll(/'([^']+)':\s*(\d{4})/g)) out[m[1]] = Number(m[2]);
  return out;
}
const RY = grab('roadYears'), SY = grab('roadYearShots');
console.log('roadYears=' + Object.keys(RY).length + '  roadYearShots=' + Object.keys(SY).length);

// 复刻 city.js 的 yearOfName
function shotYear(name) {
  if (SY[name] != null) return SY[name];
  let best = null, bl = 0;
  for (const k in SY) if (k.length > bl && name.indexOf(k) === 0) { best = SY[k]; bl = k.length; }
  return best;
}
function yearOfName(name, flags, cls) {
  if (!name) return null;
  if (RY[name] != null) return RY[name];
  let best = null, bl = 0;
  for (const k in RY) if (k.length > bl && name.indexOf(k) === 0) { best = RY[k]; bl = k.length; }
  if (best != null) return best;
  return cls >= 4 ? shotYear(name) : null;
}

// 几何长度（格 → km，1 格 = 250 m）
function decode(s) {
  const pts = [];
  let x = 0, y = 0, i = 0;
  const next = () => {
    let u = 0, shift = 0;
    for (;;) {
      const c = s.charCodeAt(i++) - 63;
      u |= (c & 31) << shift;
      if (c < 32) break;
      shift += 5;
    }
    return (u & 1) ? ~(u >> 1) : (u >> 1);
  };
  while (i < s.length) {
    x += next(); y += next();
    pts.push([x / 64, y / 64]);
  }
  return pts;
}
function lenKm(pts) {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return L * 0.25;
}

const stat = { total: 0, totalKm: 0, named: 0, in2000: 0, in2000Km: 0, byCls: {}, byYear: {} };
for (const r of roads) {
  const [ni, cls, flags, s] = r;
  const name = names[ni] || '';
  const pts = decode(s);
  const km = lenKm(pts);
  stat.total++; stat.totalKm += km;
  if (name) stat.named++;
  const y = yearOfName(name, flags, cls);
  const year = y == null ? 'null(随片区开放)' : y;
  stat.byYear[year] = (stat.byYear[year] || 0) + 1;
  const b = (stat.byCls[cls] = stat.byCls[cls] || { n: 0, km: 0, in2k: 0, in2kKm: 0 });
  b.n++; b.km += km;
  if (y == null || y <= 2000) { stat.in2000++; stat.in2000Km += km; b.in2k++; b.in2kKm += km; }
}
console.log('\n=== 道路总览 ===');
console.log(`条数 ${stat.total}，里程 ${stat.totalKm.toFixed(0)} km，有名称 ${stat.named}`);
console.log(`2000 年可见：${stat.in2000} 条 / ${stat.in2000Km.toFixed(0)} km（${(stat.in2000Km / stat.totalKm * 100).toFixed(0)}% 里程）`);
console.log('\n=== 按等级（cls 4=快速路 3=主干 2=次干/支路）===');
for (const [c, b] of Object.entries(stat.byCls).sort()) {
  console.log(`cls ${c}: ${b.n} 条 ${b.km.toFixed(0)} km，2000 年可见 ${(b.in2kKm / b.km * 100).toFixed(0)}%`);
}
console.log('\n=== 年代分布（条数）===');
for (const [y, n] of Object.entries(stat.byYear).sort()) console.log(`  ${y}: ${n}`);

// 对照：2020 年可见多少（检验年代表是否把路推到很晚）
let after2020 = 0, after2020Km = 0;
for (const r of roads) {
  const [ni, cls, flags, s] = r;
  const name = names[ni] || '';
  const y = yearOfName(name, flags, cls);
  if (y != null && y > 2020) { after2020++; after2020Km += lenKm(decode(s)); }
}
console.log(`\n2020 年以后才通车的：${after2020} 条 / ${after2020Km.toFixed(0)} km`);
