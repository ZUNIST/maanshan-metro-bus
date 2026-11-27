// 把重采后的 geo_ms 里的「道路 + 街巷 + 名称表」合并进线上在用的 geo_ms.js。
// 为什么不整包替换：线上那份 geo_ms.js 在地名库上做过补充（places 6812，build-geo 直出是 6486），
// 整包替换会丢掉那 326 个地名，进而影响车站命名。这里只换道路图层，其余图层逐字节保留。
// 用法：node tools/merge-roads-geo.mjs <新构建的 geo_ms.js> <目标 geo_ms.js> [--write]
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import vm from 'node:vm';

const [src, dst] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const WRITE = process.argv.includes('--write');
if (!src || !dst) throw new Error('用法：node tools/merge-roads-geo.mjs <新构建.js> <目标.js> [--write]');

function load(file, id = 'ms') {
  const ctx = { CM: {}, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });
  const g = ctx.CM.GEOS && ctx.CM.GEOS[id];
  if (!g) throw new Error('没有读到 GEOS.' + id + '：' + file);
  return g;
}

const old = load(dst);
const neu = load(src);

// 名称表：以目标文件为准，新道路里出现的新名字追加到尾部（不动既有下标，其余图层引用依然有效）
const names = old.names.slice();
const idx = new Map(names.map((n, i) => [n, i]));
// 空串、重名都按首次出现处理；旧的 nameIdx 里可能有重复，这里以最后一个为准才能对上旧道路引用
names.forEach((n, i) => { if (n) idx.set(n, i); });
const mapName = (ni, srcNames) => {
  const name = srcNames[ni] || '';
  if (!name) return 0;
  if (idx.has(name)) return idx.get(name);
  names.push(name);
  idx.set(name, names.length - 1);
  return names.length - 1;
};

const roads = neu.roads.map(r => [mapName(r[0], neu.names), r[1], r[2], r[3]]);
// 读回来时 streets 已是拼接好的字符串，这里拆成数组以便统计与重新拼接
const streets = typeof neu.streets === 'string' ? neu.streets.split('!').filter(Boolean) : neu.streets;

const emit = g => `'use strict';
// 由 OpenStreetMap 数据生成（© OpenStreetMap 贡献者，ODbL）。坐标为游戏格（250 m），折线为增量编码，1/64 格精度。
// 范围：马鞍山市全域（含山县、和县、花山区、雨山区、博望区、当涂县），416 × 328 格（约 104 km × 82 km）。
(function (CM) {
  (CM.GEOS = CM.GEOS || {}).ms = {
    proj: ${JSON.stringify(g.proj)},
    names: ${JSON.stringify(names)},
    water: [
${g.water.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    roads: [
${roads.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    streets: ${JSON.stringify(streets.join('!'))},
    rail: [
${g.rail.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    parks: [
${g.parks.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    reserves: [
${g.reserves.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    woods: [
${g.woods.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    admin: [
${g.admin.map(r => '      ' + JSON.stringify(r)).join(',\n')}
    ],
    places: ${JSON.stringify(g.places)}
  };
})(window.CM);
`;

const oldRoadWays = old.roads.length, newRoadWays = roads.length;
const oldStreetN = old.streets.split('!').length, newStreetN = streets.length;
const oldNamed = old.roads.filter(r => r[0]).length, newNamed = roads.filter(r => r[0]).length;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const body = emit(old);
const ctx2 = { CM: {}, console };
ctx2.window = ctx2;
vm.createContext(ctx2);
vm.runInContext(body, ctx2, { filename: 'merged.js' });
const back = ctx2.CM.GEOS.ms;
for (const k of ['water', 'rail', 'parks', 'reserves', 'woods', 'admin', 'places', 'proj']) {
  if (!same(back[k], old[k])) throw new Error('合并结果与目标不一致：' + k);
}
if (same(back.roads, old.roads)) console.log('注意：道路与目标完全相同（没有新数据？）');

console.log(JSON.stringify({
  roads: oldRoadWays + ' → ' + newRoadWays,
  namedRoads: oldNamed + ' → ' + newNamed,
  streets: oldStreetN + ' → ' + newStreetN,
  names: old.names.length + ' → ' + names.length,
  placesKept: back.places.length,
  MB: (body.length / 1048576).toFixed(2),
}));

if (WRITE) {
  copyFileSync(dst, dst + '.bak');
  writeFileSync(dst, body);
  console.log('written ' + dst + '（备份 ' + dst + '.bak）');
} else {
  console.log('未写入（加 --write 才落盘）');
}
