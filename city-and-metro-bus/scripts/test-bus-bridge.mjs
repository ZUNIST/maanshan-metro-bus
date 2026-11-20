// v3.41 回归：公交可以过江，但必须走已有的桥（含隧道），且桥梁要已通车。
// 用法：node scripts/test-bus-bridge.mjs
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
for (const [, src] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
  if (src === 'js/save.js') break;
}
const C = context.CM, M = C.Metro, U = C.U, CFG = C.CFG;
C.UI = function () {};

let passed = 0;
const ok = function (cond, label, extra) {
  assert.ok(cond, label + (extra ? '（' + extra + '）' : ''));
  passed++; console.log('  ok  ' + label);
};

C.useMap('ms');
const g = C.Game.create({ mode: 'free', seed: 1 });
const city = g.city;

// 找出某条桥梁道路上「跨水最长的那条 way」，返回其顶点
const bridgeWay = function (name) {
  let best = null;
  city.roadGroups.forEach(function (grp) {
    if (!(grp.flags & 1) || grp.name !== name) return;
    grp.ways.forEach(function (p) {
      let wm = 0;
      for (let q = 0; q + 3 < p.length; q += 2) {
        if (city.crossesRiver(p[q], p[q + 1], p[q + 2], p[q + 3])) wm += U.dist(p[q], p[q + 1], p[q + 2], p[q + 3]) * CFG.CELL_M;
      }
      if (wm > 400 && (!best || wm > best.wm)) best = { name: grp.name, wm: wm, p: p, year: grp.year };
    });
  });
  if (!best) return null;
  const pts = [];
  for (let k = 0; k < best.p.length; k += 2) pts.push([best.p[k], best.p[k + 1]]);
  return { name: best.name, pts: pts, year: best.year };
};

// 沿给定折线建一条线，返回 { waterM, offM, types }
const run = function (sys, pts, year) {
  const d = M.empty();
  const L = M.newLine(d, sys + ' 过江', sys);
  const a = M.addStation(d, pts[0][0], pts[0][1], { size: 'S', type: 'surface', sys: sys }, city);
  const b = M.addStation(d, pts[pts.length - 1][0], pts[pts.length - 1][1], { size: 'S', type: 'surface', sys: sys }, city);
  if (!a || !b) return null;
  const r = M.addSegment(d, L, a, b, pts.slice(1, -1), 'surface');
  if (!r || !r.id) return null;
  const sg = M.segGeom(d, d.segments[r.id], city);
  const bc = M.bridgeCoverage(city, sg, year);
  const ev = M.evaluate(d, M.empty(), city, year);
  const types = {};
  for (const c of ev.conflicts) types[c.type] = (types[c.type] || 0) + 1;
  return { waterM: sg.waterM, offM: bc.offM, types: types, geo: sg };
};

// v3.42：马鞍山长江大桥在 OSM 里并进「沪武高速」，现在由 bridgeSplits 单独拆出并立年为 2013
const br = bridgeWay('马鞍山长江大桥') || bridgeWay('沪武高速');
ok(!!br, '找到跨江桥梁道路（马鞍山长江大桥）', br && Math.round(br.wm / 1000) + ' km 江面');
ok(br && br.year === 2013, '马鞍山长江大桥立年为 2013（实际 ' + (br && br.year) + '）');
ok(!bridgeWay('沪武高速') || bridgeWay('沪武高速').year !== 2013, '整条沪武高速仍按自己的年份（2021），没有被桥带跑');

// 1. 桥已通车（2035）：沿桥过江放行
const later = 2035;
const along = run('bus', br.pts, later);
ok(along && along.waterM > 1000, '沿线确实跨江（江面 ' + Math.round(along.waterM / 1000 * 10) / 10 + ' km）');
ok(along && along.offM < 250, '公交沿桥过江：江面全部在桥上（离桥 ' + Math.round(along.offM) + ' m）');
ok(along && !along.types.busWater, '公交沿桥过江：不报 busWater');

// 2. 通车前（2012）被判无桥；通车当年（2013）即可过江
const before = run('bus', br.pts, 2012);
ok(before && before.offM > 250, '2012 年桥未通：判定为无桥（离桥 ' + Math.round(before.offM) + ' m）');
ok(before && before.types.busWater === 1, '2012 年公交走未通车的桥：报 busWater');
const justOpen = run('bus', br.pts, 2013);
ok(justOpen && !justOpen.types.busWater, '2013 年通车当年：公交即可沿桥过江');

// 3. 离开桥面：沿桥的法线方向平移 1.5 格，同样是「水上漂」，被拦
const p0 = br.pts[0], p1 = br.pts[br.pts.length - 1];
const dl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
const nx = -(p1[1] - p0[1]) / dl, ny = (p1[0] - p0[0]) / dl;
const off = br.pts.map(function (q) { return [q[0] + nx * 1.5, q[1] + ny * 1.5]; });
const drift = run('bus', off, later);
ok(drift && drift.waterM > 500, '平移后的线仍在江面上（江面 ' + Math.round(drift.waterM) + ' m）');
ok(drift && drift.types.busWater === 1, '公交离开桥面 1.5 格：报 busWater（离桥 ' + Math.round(drift.offM) + ' m）');

// 4. 电车 / 地铁：原有规则不变
const tram = run('tram', br.pts, later);
ok(tram && tram.types.tramWater === 1, '有轨电车走同一座桥：仍按跨江上限报 tramWater（规则未改）');
const metro = run('metro', br.pts, later);
ok(metro && !metro.types.busWater && !metro.types.tramWater, '地铁走同一段：不受跨江限制（可隧道）');

// 5. 无水面段不产生跨江判定
const dry = (function () {
  const d = M.empty(), L = M.newLine(d, 'bus 陆上', 'bus');
  const a = M.addStation(d, 250, 170, { size: 'S', type: 'surface', sys: 'bus' }, city);
  const b = M.addStation(d, 258, 172, { size: 'S', type: 'surface', sys: 'bus' }, city);
  if (!a || !b) return null;
  const r = M.addSegment(d, L, a, b, [], 'surface');
  if (!r || !r.id) return null;
  const sg = M.segGeom(d, d.segments[r.id], city);
  return M.bridgeCoverage(city, sg, later);
})();
ok(dry && dry.waterM === 0 && dry.offM === 0, '陆上段：bridgeCoverage 返回 0/0');

// 6. 建成年份落在两个剧本上：2000 剧本 2013 年建成，2027 剧本开局即有
const bi = city.roadGroups.findIndex(function (x) { return x.name === '马鞍山长江大桥'; });
ok(bi >= 0 && city.roadsBuilt[bi] === 0, '2000 剧本开局：桥还没建');
city.applyRoads(2012);
ok(city.roadsBuilt[bi] === 0, '2000 剧本 2012 年：桥仍未建');
city.applyRoads(2013);
ok(city.roadsBuilt[bi] === 1, '2000 剧本 2013 年：桥建成');
C.useMap('ms27');
const g27 = C.Game.create({ mode: 'free', seed: 1 });
const bi27 = g27.city.roadGroups.findIndex(function (x) { return x.name === '马鞍山长江大桥'; });
ok(bi27 >= 0 && g27.city.roadsBuilt[bi27] === 1, '2027 剧本开局：桥已建成');

// 7. 过桥只收桥面改造费，不按新建桥梁计价
const geoW = along.geo;
const busCost = M.trackCostFor(geoW, 'surface', later, { sys: 'bus', grade: 'B1', speed: CFG.bus.defaultSpeed }, city);
const metroCost = M.trackCostFor(geoW, 'surface', later, { sys: 'metro' }, city);
ok(busCost < metroCost * 0.05, '公交过桥造价 ' + Math.round(busCost) + ' 万，仅为地铁新建桥梁的 ' + (busCost / metroCost * 100).toFixed(1) + '%');

console.log('\nALL GREEN — ' + passed + ' 项断言');
