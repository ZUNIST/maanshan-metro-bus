// 用 OSM 核对马鞍山底图上的具名设施（车站、机场、港口、景区），列出：
//   1) 数据里有、OSM 附近找不到同名地物的（可能名字错或位置偏）
//   2) OSM 有、数据里没有的（漏画）
//   3) 同名但位置偏差超过阈值的
// 用法：node tools/audit-facilities.mjs [--all]
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/maanshan-metro-repo/city-and-metro-bus/';
const CACHE = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache/';
const BBOX = { s: 31.325, w: 117.835, n: 32.070, e: 118.900 };

// ---- 载入游戏数据（跑到 city.js 为止，够拿到 MAPS.ms.data）----
const scope = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout };
scope.window = scope;
vm.createContext(scope);
const html = await readFile(ROOT + 'index.html', 'utf8');
for (const [, f] of html.matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(ROOT + f, 'utf8'), scope, { filename: f });
  if (f === 'js/city.js') break;
}
const CM = scope.CM;
CM.useMap('ms');
const D = CM.DATA;
const proj = CM.MAPS.ms.geo.proj;
// 反投影：格 → 经纬度
const toLL = (x, y) => [proj.lat0 - y / proj.ky, proj.lon0 + x / proj.kx];
const distKm = (a, b) => Math.hypot((a[0] - b[0]) * 111.0, (a[1] - b[1]) * 111.0 * Math.cos(a[0] * Math.PI / 180));

// ---- 数据侧具名地物 ----
const items = [];
const push = (name, kind, x, y, id) => {
  if (!name || !isFinite(x) || !isFinite(y)) return;
  items.push({ name, kind, ll: toLL(x, y), id });
};
for (const f of D.facilities || []) {
  // 设施位置可能是 lm 指向的建筑物，也可能直接给 at
  let x = null, y = null;
  if (Array.isArray(f.at)) { x = f.at[0]; y = f.at[1]; }
  if (x == null) {
    const b = (D.buildings || []).find(o => o.id === (f.lm || f.id));
    if (b) { x = b.x; y = b.y; }
  }
  if (x != null) push(f.n, f.t, x, y, f.id);
}
for (const b of D.buildings || []) if (b.name && b.kind) push(b.name, b.kind, b.x, b.y, b.id);

// ---- OSM 侧同名地物 ----
const norm = s => (s || '').replace(/[\s（）()·\-—]/g, '');
const osm = [];
const load = async f => { try { return JSON.parse(await readFile(CACHE + f + '.json', 'utf8')).elements || []; } catch { return []; } };
const inBox = (lat, lon) => lat >= BBOX.s && lat <= BBOX.n && lon >= BBOX.w && lon <= BBOX.e;
for (const e of await load('places')) {
  const t = e.tags || {};
  if (!e.lat || !inBox(e.lat, e.lon)) continue;
  if (t.railway === 'station' || t.railway === 'halt') osm.push({ name: t.name, tag: 'railway=' + t.railway, ll: [e.lat, e.lon] });
  else if (t.place || t.amenity === 'bus_station') osm.push({ name: t.name, tag: 'place=' + (t.place || t.amenity), ll: [e.lat, e.lon] });
}
for (const e of await load('poi')) {
  const t = e.tags || {};
  if (!e.lat || !inBox(e.lat, e.lon) || !t.name) continue;
  if (t.aeroway || t.amenity === 'ferry_terminal' || t.landuse === 'port' || t.harbour) osm.push({ name: t.name, tag: 'poi:' + (t.aeroway || t.amenity || t.landuse || 'harbour'), ll: [e.lat, e.lon] });
}

// ---- 比对 ----
const rows = [];
const osmByIdx = new Set();
for (const it of items) {
  const n = norm(it.name);
  let best = null, bestD = Infinity, bestIdx = -1;
  osm.forEach((o, i) => {
    if (!o.name) return;
    const on = norm(o.name);
    // 同名或一方包含另一方（含山南 / 含山南站）
    const match = on === n || (on.length >= 2 && n.length >= 2 && (on.includes(n) || n.includes(on)));
    if (!match) return;
    const d = distKm(it.ll, o.ll);
    if (d < bestD) { bestD = d; best = o; bestIdx = i; }
  });
  if (best) osmByIdx.add(bestIdx);
  rows.push({ ...it, near: best ? best.name : null, nearTag: best ? best.tag : null, km: best ? bestD : null });
}

const out = [];
for (const r of rows) {
  if (!r.near) out.push({ issue: '数据有、OSM 无同名', ...r, km: null });
  else if (r.km > 1.2) out.push({ issue: '位置偏差 ' + r.km.toFixed(1) + ' km', ...r });
}
for (let i = 0; i < osm.length; i++) {
  if (osmByIdx.has(i)) continue;
  const o = osm[i];
  if (!o.name) continue;
  if (!/^railway=/.test(o.tag)) continue;   // 漏画的先只看车站，地名节点太多
  // 附近 3 km 内有没有数据地物（名字不同也算）
  const near = items.map(it => ({ it, d: distKm(it.ll, o.ll) })).sort((a, b) => a.d - b.d)[0];
  out.push({ issue: 'OSM 有、数据无（' + (near && near.d < 3 ? '最近「' + near.it.name + '」' + near.d.toFixed(1) + ' km' : '附近无设施') + '）', name: o.name, kind: o.tag, ll: o.ll, km: null });
}

// ---- 输出 ----
const fmt = o => `${o.issue.padEnd(28)} ${String(o.name).padEnd(16)} ${o.kind || ''}`.padEnd(70) +
  (o.ll ? ` @${o.ll[0].toFixed(4)},${o.ll[1].toFixed(4)}` : '') + (o.near ? `  近邻「${o.near}」` : '') + (o.id ? `  [${o.id}]` : '');
console.log('数据侧具名地物 ' + items.length + ' 个，OSM 侧 ' + osm.length + ' 个，疑似问题 ' + out.length + ' 条\n');
for (const o of out) console.log(fmt(o));

if (process.argv.includes('--json')) {
  await writeFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/_rebuild/audit-facilities.json', JSON.stringify({ items, osm, out }, null, 1));
  console.log('\n已写 _rebuild/audit-facilities.json');
}
