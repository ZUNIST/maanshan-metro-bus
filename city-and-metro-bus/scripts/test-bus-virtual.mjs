// v3.40 回归：公交是虚拟线路——不拆迁、不受「只能走地下」类实体判定限制、无转弯半径与转角限制，
// 同时确认地铁 / 有轨电车的既有约束没有被放宽。
// 用法：node scripts/test-bus-virtual.mjs
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
const C = context.CM, M = C.Metro, CFG = C.CFG;
C.UI = function () {};

let passed = 0;
const ok = function (cond, label, extra) {
  assert.ok(cond, label + (extra ? '（' + extra + '）' : ''));
  passed++; console.log('  ok  ' + label);
};

const boxes = [];
const openMap = function (mid) {
  C.useMap(mid);
  const g = C.Game.create({ mode: 'free', seed: 20260601 });
  return g;
};

// 找一类格子：风景区 / 历史城区 / 受保护建筑
const findCell = function (city, pred) {
  for (let j = 30; j < city.H - 30; j += 1) for (let i = 30; i < city.W - 30; i += 1) {
    const c = j * city.W + i;
    if (city.cellAt(i + 0.5, j + 0.5) !== c) continue;
    if (pred(c)) return [i + 0.5, j + 0.5];
  }
  return null;
};

// 建一条穿过指定点的 line，返回 { conflicts, demolitions, items }
const cross = function (g, sys, cx, cy) {
  const d = M.empty(), city = g.city;
  const L = M.newLine(d, sys + ' 试线', sys);
  const a = M.addStation(d, cx - 4, cy - 2, { size: 'S', type: 'surface' }, city);
  const b = M.addStation(d, cx + 4, cy + 2, { size: 'S', type: 'surface' }, city);
  if (!a || !b) return null;
  const r = M.addSegment(d, L, a, b, [], 'surface');
  if (!r || !r.id) return null;
  const ev = M.evaluate(d, M.empty(), city, g.clock.y);
  const types = {};
  for (const c of ev.conflicts) types[c.type] = (types[c.type] || 0) + 1;
  const fees = (ev.items || []).filter(function (it) { return /风景|保护/.test(it.label); });
  return { types: types, demolitions: (ev.demolitions || []).length, fees: fees.length };
};

// ---- 1. 风景区 ----
console.log('— 风景区（含山·香泉湖一带）');
const g1 = openMap('hx');
const scenic = findCell(g1.city, function (c) {
  if (!g1.city.regions[g1.city.region[c]].scenic) return false;
  // 景区里的湖面不能设站（这条对公交同样成立），测试取陆地格
  const i = c % g1.city.W + 0.5, j = Math.floor(c / g1.city.W) + 0.5;
  return g1.city.waterDistAt(i, j) >= 0.05 && !g1.city.cellLocked(c);
});
ok(!!scenic, '找到风景区格 ' + (scenic || ''));
const busScenic = cross(g1, 'bus', scenic[0], scenic[1]);
ok(busScenic && !busScenic.types.hill, '公交穿景区：不报 hill 冲突', JSON.stringify(busScenic && busScenic.types));
ok(busScenic && busScenic.demolitions === 0, '公交穿景区：不产生拆迁格');
ok(busScenic && busScenic.fees === 0, '公交穿景区：不收景区保护费');
const metroScenic = cross(g1, 'metro', scenic[0], scenic[1]);
ok(metroScenic && metroScenic.types.hill === 1, '地铁穿景区：仍报 hill 冲突（规则未放宽）');
const tramScenic = cross(g1, 'tram', scenic[0], scenic[1]);
ok(tramScenic && tramScenic.types.hill === 1, '有轨电车穿景区：仍报 hill 冲突');

// ---- 2. 公交站可以设在景区内 ----
ok(M.checkSite(g1.city, scenic[0], scenic[1], 'surface', 'bus').ok, '公交站可设在景区内');
ok(!M.checkSite(g1.city, scenic[0], scenic[1], 'surface').ok, '地铁地面站在景区内仍被拒');

// ---- 3. 历史城区 / 受保护建筑（在 ms 图上找） ----
console.log('— 历史城区 / 受保护建筑');
let herTried = 0;
for (const mid of ['ms', 'hx27', 'hx']) {
  const g = openMap(mid);
  const her = findCell(g.city, function (c) { return g.city.heritage && g.city.heritage[c] > 0; });
  const prot = findCell(g.city, function (c) { return g.city.protectedId && g.city.protectedId[c] > 0; });
  if (her) {
    const busH = cross(g, 'bus', her[0], her[1]);
    const metroH = cross(g, 'metro', her[0], her[1]);
    if (busH && metroH) {
      herTried++;
      ok(!busH.types.protected, mid + '：公交穿历史城区不报 protected', JSON.stringify(busH.types));
      ok(metroH.types.protected === 1, mid + '：地铁穿历史城区仍报 protected');
      ok(busH.demolitions === 0, mid + '：公交穿历史城区不拆迁');
    }
  }
  if (prot) {
    const busP = cross(g, 'bus', prot[0], prot[1]);
    const metroP = cross(g, 'metro', prot[0], prot[1]);
    if (busP && metroP) {
      herTried++;
      ok(!busP.types.protected, mid + '：公交穿受保护建筑不报 protected', JSON.stringify(busP.types));
      ok(metroP.types.protected === 1, mid + '：地铁穿受保护建筑仍报 protected');
    }
  }
  if (herTried) break;
}
if (!herTried) console.log('  --  本地图未找到历史城区/受保护建筑格，跳过该项');

// ---- 4. 车站 90° 拐弯 ----
console.log('— 车站处 90° 拐弯');
const g4 = openMap('hx');
const turnTrial = function (sys) {
  const d = M.empty(), city = g4.city;
  const L = M.newLine(d, sys + ' 拐弯', sys);
  const a = M.addStation(d, 150, 140, { size: 'S', type: 'surface' }, city);
  const b = M.addStation(d, 150, 146, { size: 'S', type: 'surface' }, city);
  const c = M.addStation(d, 156, 146, { size: 'S', type: 'surface' }, city);
  if (!a || !b || !c) return null;
  if (!M.addSegment(d, L, a, b, [], 'surface') || !M.addSegment(d, L, b, c, [], 'surface')) return null;
  const ev = M.evaluate(d, M.empty(), city, g4.clock.y);
  return ev.conflicts.filter(function (x) { return x.type === 'turn'; }).length;
};
const busTurn = turnTrial('bus');
ok(busTurn === 0, '公交在路口 90° 拐弯：不报 turn 冲突（实际 ' + busTurn + '）');
ok(turnTrial('metro') === 1, '地铁在车站 90° 拐弯：仍报 turn 冲突');
ok(turnTrial('tram') === 1, '有轨电车在车站 90° 拐弯：仍报 turn 冲突');

// ---- 5. 转向上限按制式取值 ----
ok(CFG.bus.maxTurnAtStationDeg === 120, '公交站内转向上限 120°');
ok(CFG.metro.maxTurnAtStationDeg === 60, '地铁站内转向上限仍为 60°');
ok(M.minRadius({ sys: 'bus' }) <= 5, '公交最小曲线半径仍为几何下限（' + M.minRadius({ sys: 'bus' }) + ' m）');

console.log('\nALL GREEN — ' + passed + ' 项断言');
