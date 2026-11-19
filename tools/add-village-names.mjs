// 从 OSM place 节点与高德 POI（村委会、住宅小区）提取补充地名，追加到 geo_ms.js 的 places 库。
// 用法: node ../tools/add-village-names.mjs  （在 city-and-metro 目录运行；同时更新两份 geo_ms.js 副本）
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const gameDir = path.join(root, 'city-and-metro');
const deployDir = path.join(root, '马鞍山地图', 'city-and-metro');

global.window = { CM: {} };
global.CM = window.CM;
require(path.join(gameDir, 'js', 'geo_ms.js'));
const g = CM.GEOS.ms;

const osm = JSON.parse(fs.readFileSync(path.join(gameDir, 'overpass-villages.json'), 'utf8'));
const amap = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'amap-places.json'), 'utf8'));

// ---------- 1. OSM 新地名（与现有 places 同名 2.5 格内算重复） ----------
const proj = (lat, lon) => [(lon - 117.835) * 390.61, (32.07 - lat) * 440.27];
const existing = g.places.slice();
const nearDup = (name, x, y) => existing.some(q => q[0] === name && Math.hypot(q[1] - x, q[2] - y) < 2.5);

const added = [];
const add = (name, x, y, lvl, src) => {
  name = name.trim();
  if (!name || name.length > 12) return false;
  if (added.some(q => q[0] === name && Math.hypot(q[1] - x, q[2] - y) < 2.5)) return false;
  if (nearDup(name, x, y)) return false;
  added.push([name, Math.round(x * 100) / 100, Math.round(y * 100) / 100, lvl]);
  existing.push([name, x, y, lvl]);   // 防止后续重复加入
  return true;
};

let nOsm = 0;
for (const e of osm.elements) {
  const tg = e.tags; if (!tg || !tg.name || !tg.place) continue;
  const [x, y] = proj(e.lat, e.lon);
  if (x < -2 || x > 418 || y < -2 || y > 330) continue;
  if (add(tg.name, x, y, 2, 'osm')) nOsm++;
}

// ---------- 2. 高德村委会 → 行政村名 ----------
let nGov = 0;
const govName = n => {
  let m;
  if ((m = n.match(/([\u4e00-\u9fa5]{1,6}?(?:村|社区))村委会$/))) return m[1];
  if ((m = n.match(/中共[\u4e00-\u9fa5]{1,6}镇([\u4e00-\u9fa5]{1,6}?(?:村|社区))[总支部]?委员会/))) return m[1];
  if ((m = n.match(/^([\u4e00-\u9fa5]{1,6}?(?:村|社区))村务监督/))) return m[1];
  if ((m = n.match(/^([\u4e00-\u9fa5]{1,6}?(?:村|社区))退役军人服务站$/))) return m[1];
  return null;
};
for (const p of amap.pois) {
  if (p.g !== 'gov') continue;
  const name = govName(p.n); if (!name) continue;
  if (add(name, p.x, p.y, 2, 'amap-gov')) nGov++;
}

// ---------- 3. 高德住宅小区 → 小区名 ----------
let nHome = 0;
for (const p of amap.pois) {
  if (p.g !== 'home') continue;
  if (p.t !== '住宅小区' && p.t !== '住宅区' && p.t !== '商住两用楼宇' && p.t !== '公寓') continue;
  if (add(p.n, p.x, p.y, 2, 'amap-home')) nHome++;
}

console.log(`新增地名: OSM ${nOsm} + 村委会 ${nGov} + 住宅小区 ${nHome} = ${added.length}`);
// 区域分布
const zones = { '市区': [230, 125, 300, 220], '当涂县城': [235, 220, 275, 270], '当涂东部': [275, 240, 350, 320], '博望': [320, 180, 380, 240], '和县': [140, 20, 230, 120], '含山': [30, 150, 160, 230] };
const cnt = {};
for (const p of added) {
  let z = '其他';
  for (const [name, box] of Object.entries(zones)) {
    const [x0, y0, x1, y1] = box;
    if (p[1] >= x0 && p[1] <= x1 && p[2] >= y0 && p[2] <= y1) { z = name; break; }
  }
  cnt[z] = (cnt[z] || 0) + 1;
}
console.log('分布:', JSON.stringify(cnt));

fs.writeFileSync(path.join(root, 'tools', 'villages-extra.json'), JSON.stringify({
  generated: '2026-11-17',
  sources: ['overpass-api.de OSM place 节点（村庄/社区，全图 31.324-32.070N, 117.835-118.900E）',
    'tools/amap-places.json 乡镇以下级政府及事业单位（村委会→行政村名）',
    'tools/amap-places.json 住宅小区'],
  note: '追加到 geo_ms.js places 库尾部（level 2）。坐标为游戏格（250 m），投影 llW。',
  count: added.length,
  places: added,
}, null, 2) + '\n');

// ---------- 4. 追加到两份 geo_ms.js ----------
const block = JSON.stringify(added);
let patched = 0;
for (const dir of [gameDir, deployDir]) {
  const f = path.join(dir, 'js', 'geo_ms.js');
  let t = fs.readFileSync(f, 'utf8');
  if (t.includes('villages-extra.json 追加')) { console.log(dir, 'already patched'); continue; }
  // places 数组以 ]]; 结束（后跟下一个 key）。找到 ",places:" 后的数组尾部插入
  const m = t.match(/places:\s*\[\[/);
  const i = m ? m.index : -1;
  if (i < 0) throw new Error('places array not found in ' + f);
  const j = t.indexOf(']]', i);
  if (j < 0) throw new Error('places end not found in ' + f);
  const insertAt = j + 1;   // 第一层 ] 之后
  const nl = ',\n    // 以下地名来自 villages-extra.json 追加（v3.18）：OSM place 节点 + 高德村委会与住宅小区\n    ' + block.slice(1);
  t = t.slice(0, insertAt) + nl + t.slice(insertAt);
  fs.writeFileSync(f, t);
  patched++;
  console.log(dir, 'patched');
}
console.log('patched files:', patched);
