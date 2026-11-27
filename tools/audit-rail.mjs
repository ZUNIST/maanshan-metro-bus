// 用 OSM 核对马鞍山底图上的车站 / 机场 / 港口（这三类位置与名称最需要准）：
//   1) 数据里有、OSM 找不到对应车站的（名字可能错，或站址偏）
//   2) OSM 有、数据里缺的（漏画）
// 范围只算本市（马鞍山各区县），不含邻市背景；名字按「去后缀 + 全等」比对，避免「马鞍山学院≈马鞍山」这类误配。
// 用法：node tools/audit-rail.mjs [--json]
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/maanshan-metro-repo/city-and-metro-bus/';
const CACHE = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache/';
const BBOX = { s: 31.325, w: 117.835, n: 32.070, e: 118.900 };

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
const city = new CM.City();
city.generate(19800101, 2026);
const D = CM.DATA;
const proj = CM.MAPS.ms.geo.proj;
const toLL = (x, y) => [proj.lat0 - y / proj.ky, proj.lon0 + x / proj.kx];
const distKm = (a, b) => Math.hypot((a[0] - b[0]) * 111.0, (a[1] - b[1]) * 111.0 * Math.cos(a[0] * Math.PI / 180));

// 本市掩膜：邻市背景片区的 empty=true，据此排除
const isLocal = (lat, lon) => {
  const x = (lon - proj.lon0) * proj.kx, y = (proj.lat0 - lat) * proj.ky;
  if (!(x >= 0 && y >= 0 && x < city.W && y < city.H)) return false;
  const c = city.cellAt(x, y);
  if (c < 0) return false;
  const rg = city.regions[city.region[c]];
  return !!rg && !rg.empty;
};

const strip = s => (s || '').replace(/[\s（）()·\-—]/g, '').replace(/站$/, '');
const dataRail = [];
for (const f of D.facilities || []) {
  if (!['rail', 'air', 'port', 'ferry'].includes(f.t)) continue;
  let x = null, y = null;
  if (Array.isArray(f.at)) { x = f.at[0]; y = f.at[1]; }
  if (x == null) { const b = (D.landmarks || []).find(o => o.id === (f.lm || f.id)); if (b) { x = b.x; y = b.y; } }
  if (x == null) continue;
  dataRail.push({ name: f.n, kind: f.t, id: f.id, ll: toLL(x, y) });
}

const load = async f => { try { return JSON.parse(await readFile(CACHE + f + '.json', 'utf8')).elements || []; } catch { return []; } };
const osmSt = [];
for (const e of await load('places')) {
  const t = e.tags || {};
  if (!e.lat || !t.name) continue;
  if (t.railway !== 'station' && t.railway !== 'halt') continue;
  if (e.lat < BBOX.s || e.lat > BBOX.n || e.lon < BBOX.w || e.lon > BBOX.e) continue;
  if (!isLocal(e.lat, e.lon)) continue;
  osmSt.push({ name: t.name, tag: t.railway, ll: [e.lat, e.lon] });
}
for (const e of await load('poi')) {
  const t = e.tags || {};
  if (!e.lat || !t.name || !t.aeroway) continue;
  if (e.lat < BBOX.s || e.lat > BBOX.n || e.lon < BBOX.w || e.lon > BBOX.e) continue;
  if (!isLocal(e.lat, e.lon)) continue;
  osmSt.push({ name: t.name, tag: 'aeroway=' + t.aeroway, ll: [e.lat, e.lon] });
}

const used = new Set();
const issues = [];
for (const d of dataRail) {
  let best = null, bd = Infinity, bi = -1;
  osmSt.forEach((o, i) => {
    if (strip(o.name) !== strip(d.name)) return;
    const k = distKm(d.ll, o.ll);
    if (k < bd) { bd = k; best = o; bi = i; }
  });
  if (best) { used.add(bi); if (bd > 0.8) issues.push({ type: '位置偏差', data: d, osm: best, km: bd }); }
  else {
    // 同名没有，就找最近的车站看看是不是名字写错了
    let near = null, nd = Infinity;
    osmSt.forEach(o => { const k = distKm(d.ll, o.ll); if (k < nd) { nd = k; near = o; } });
    issues.push({ type: 'OSM 无同名站', data: d, osm: nd < 3 ? near : null, km: nd });
  }
}
for (let i = 0; i < osmSt.length; i++) {
  if (used.has(i)) continue;
  const o = osmSt[i];
  if (o.tag !== 'station') continue;
  let near = null, nd = Infinity;
  for (const d of dataRail) { const k = distKm(d.ll, o.ll); if (k < nd) { nd = k; near = d; } }
  issues.push({ type: 'OSM 有、数据缺', data: null, osm: o, km: nd, near });
}

console.log(`本市 OSM 车站 ${osmSt.filter(o => o.tag === 'station').length} 座，数据侧车站/机场 ${dataRail.length} 个，疑似问题 ${issues.length} 条\n`);
for (const it of issues) {
  if (it.type === 'OSM 有、数据缺') {
    console.log(`${it.type.padEnd(14)} 「${it.osm.name}」 @${it.osm.ll[0].toFixed(4)},${it.osm.ll[1].toFixed(4)}` +
      (it.near ? `   最近数据设施「${it.near.name}」${it.km.toFixed(1)} km` : ''));
  } else {
    console.log(`${it.type.padEnd(14)} 「${it.data.name}」(${it.data.kind}${it.data.id ? ' ' + it.data.id : ''}) @${it.data.ll[0].toFixed(4)},${it.data.ll[1].toFixed(4)}` +
      (it.osm ? `   最近 OSM 站「${it.osm.name}」${it.km.toFixed(1)} km` : '   OSM 附近 3 km 内无车站'));
  }
}
if (process.argv.includes('--json')) {
  await writeFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/_rebuild/audit-rail.json', JSON.stringify({ dataRail, osmSt, issues }, null, 1));
  console.log('\n已写 _rebuild/audit-rail.json');
}
