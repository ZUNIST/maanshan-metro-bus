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

const br = bridgeWay('沪武高速');
ok(!!br, '找到跨江桥梁道路（沪武高速·马鞍山长江大桥）', br && Math.round(br.wm / 1000) + ' km 江面');
ok(br && br.year > 2000, '该桥有通车年份 ' + (br && br.year));

// 1. 桥已通车（2035）：沿桥过江放行
const later = 2035;
const along = run('bus', br.pts, later);
ok(along && along.waterM > 1000, '沿线确实跨江（江面 ' + Math.round(along.waterM / 1000 * 10) / 10 + ' km）');
ok(along && along.offM < 250, '公交沿桥过江：江面全部在桥上（离桥 ' + Math.round(along.offM) + ' m）');
ok(along && !along.types.busWater, '公交沿桥过江：不报 busWater');

// 2. 桥还没通车（2000）：同一条线被判无桥
const early = run('bus', br.pts, 2000);
ok(early && early.offM > 250, '2000 年该桥尚未通车：判定为无桥（离桥 ' + Math.round(early.offM) + ' m）');
ok(early && early.types.busWater === 1, '2000 年公交走未通车的桥：报 busWater');

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

// 6. 过桥只收桥面改造费，不按新建桥梁计价
const geoW = along.geo;
const busCost = M.trackCostFor(geoW, 'surface', later, { sys: 'bus', grade: 'B1', speed: CFG.bus.defaultSpeed }, city);
const metroCost = M.trackCostFor(geoW, 'surface', later, { sys: 'metro' }, city);
ok(busCost < metroCost * 0.05, '公交过桥造价 ' + Math.round(busCost) + ' 万，仅为地铁新建桥梁的 ' + (busCost / metroCost * 100).toFixed(1) + '%');

console.log('\nALL GREEN — ' + passed + ' 项断言');
