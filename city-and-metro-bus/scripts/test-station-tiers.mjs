// 站台档位与制式梯度的回归测试（v3.47 重写）
//   ① 公交四档 400/1000/2000/4000、电车三档 4000/6500/10000、地铁四档 15000/35000/70000/140000
//   ② 梯度必须是「公交 ≤ 电车 < 地铁」：电车最小档不低于公交最大档，电车最大档仍低于地铁最小档
//   ③ 服务半径同理：公交 200–600 m、电车 400–750 m、地铁 1125 m
//   ④ 显示名按制式：公交 XL=BRT 站台、L=大型；电车 L=大型
//   ⑤ 编组上限、BRT 单价、站台造价口径（公交绝对表 / 电车折扣）不回退
// 用法：node scripts/test-station-tiers.mjs
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
const C = context.CM, M = C.Metro, CFG = C.CFG, BUS = CFG.bus, TRAM = CFG.tram, MET = CFG.metro;
C.UI = function () {};
let pass = 0;
const ok = (m) => { console.log('  ok  ' + m); pass++; };

// ---- 1. 三制式档位与容量 ----
assert.equal(JSON.stringify(BUS.stationSizes), JSON.stringify(['S', 'M', 'L', 'XL']), '公交四档');
assert.equal(JSON.stringify(TRAM.stationSizes), JSON.stringify(['S', 'M', 'L']), '电车三档');
assert.equal(JSON.stringify(BUS.stationCap), JSON.stringify({ S: 400, M: 1000, L: 2000, XL: 4000 }), '公交容量');
assert.equal(JSON.stringify(TRAM.stationCap), JSON.stringify({ S: 4000, M: 6500, L: 10000 }), '电车容量（v3.47 上调）');
assert.equal(JSON.stringify(MET.stationCap), JSON.stringify({ S: 15000, M: 35000, L: 70000, XL: 140000 }), '地铁容量不变');
ok('三制式档位与容量：公交 400/1000/2000/4000 · 电车 4000/6500/10000 · 地铁 15000/35000/70000');

// ---- 2. 梯度：公交 ≤ 电车 < 地铁 ----
const busMax = BUS.stationCap.XL, tramMin = TRAM.stationCap.S, tramMax = TRAM.stationCap.L, metMin = MET.stationCap.S;
assert.ok(tramMin >= busMax, '电车最小档不应低于公交最大档（' + tramMin + ' vs ' + busMax + '）');
assert.ok(tramMax < metMin, '电车最大档必须低于地铁最小档（' + tramMax + ' vs ' + metMin + '）');
assert.ok(tramMin < TRAM.stationCap.M && TRAM.stationCap.M < tramMax, '电车内部逐档递增');
ok('梯度成立：公交 ≤' + busMax + ' ≤ 电车 ' + tramMin + '–' + tramMax + ' < 地铁 ≥' + metMin);

// ---- 3. 服务半径梯度 ----
assert.equal(JSON.stringify(BUS.accessM), JSON.stringify({ S: 200, M: 300, L: 400, XL: 600 }), '公交半径');
assert.equal(JSON.stringify(TRAM.accessM), JSON.stringify({ S: 400, M: 550, L: 750 }), '电车半径（v3.47 补 L 档）');
const busRMax = BUS.accessM.XL, tramRMin = TRAM.accessM.S, tramRMax = TRAM.accessM.L, metR = CFG.walk.maxAccessM;
assert.ok(tramRMax < metR, '电车最大吸引半径应小于地铁（' + tramRMax + ' vs ' + metR + '）');
assert.ok(tramRMin > BUS.accessM.M, '电车最小半径应大于公交中型站（' + tramRMin + ' vs ' + BUS.accessM.M + '）');
ok('半径梯度：公交 200–600 · 电车 ' + tramRMin + '–' + tramRMax + ' · 地铁 ' + metR + ' m');

// L 档不能再回退到地铁口径（v3.47 之前的缺档 bug）
const tramLStation = { id: 'x', name: 'T', x: 10, y: 10, type: 'surface', size: 'L' };
const fakeNet = {
  lines: { l1: { id: 'l1', name: '有轨1号线', sys: 'tram', grade: 'T2', speed: 40, segs: ['sg1'] } },
  stations: { x: tramLStation },
  segments: { sg1: { id: 'sg1', line: 'l1', a: 'x', b: 'x', type: 'surface' } },
};
assert.equal(M.accessMOf(fakeNet, tramLStation), 750, '电车 L 档半径取 750 而不是回退 1125');
ok('电车 L 档半径不再回退到地铁的 1125 m');

// ---- 4. 显示名与档位校验 ----
assert.equal(M.sizeText({ sys: 'bus' }, 'XL'), 'BRT 站台', '公交 XL 叫 BRT 站台');
assert.equal(M.sizeText({ sys: 'bus' }, 'L'), '大型', '公交 L 叫大型');
assert.equal(M.sizeText({ sys: 'tram' }, 'L'), '大型', '电车 L 叫大型');
assert.equal(M.sizeText({}, 'L'), '大型', '地铁 L 叫大型');
assert.equal(M.sizeOkFor({ sys: 'bus' }, 'XL'), true, '公交允许 XL');
assert.equal(M.sizeOkFor({ sys: 'tram' }, 'L'), true, '电车允许 L');
assert.equal(M.sizeOkFor({ sys: 'tram' }, 'XL'), false, '电车不允许 XL');
ok('显示名与档位校验');

// ---- 5. 编组上限 / BRT 单价 ----
assert.equal(TRAM.carsBySize.L, 4, '电车大型站可停 4 节');
assert.equal(BUS.carsBySize.XL, 1, '公交站台（含 BRT）仍停 1 辆');
const B3 = BUS.grades.find((x) => x.id === 'B3');
assert.equal(B3.track, 1600, 'BRT 单价 1600 万元/km');
ok('编组上限与 BRT 单价不回退');

// ---- 6. 造价口径 ----
const y = 2027;
const baseL = M.stationCost('surface', 'L', y);
const tramL = M.stationCostFor('tram', 'surface', 'L', y);
assert.ok(Math.abs(tramL / baseL - TRAM.stationFactor.surface) < 1e-9, '电车大型站按地铁地面 L 站的 35% 计价');
const busXL = M.stationCostFor('bus', 'surface', 'XL', y);
assert.ok(busXL > 0 && busXL < tramL, 'BRT 站台造价应低于电车大型站（' + Math.round(busXL) + ' < ' + Math.round(tramL) + ' 万）');
ok('造价：BRT ' + Math.round(busXL) + ' 万 < 电车大型 ' + Math.round(tramL) + ' 万（地铁 L 站的 35%）');

// ---- 7. 容量表按制式取 ----
assert.equal(M.capTableFor('bus').XL, 4000, 'capTableFor(bus).XL');
assert.equal(M.capTableFor('tram').L, 10000, 'capTableFor(tram).L');
assert.equal(M.capTableFor('metro').L, 70000, '地铁 L 不受影响');
ok('按制式取容量表');

console.log('\nPASS ' + pass + ' 项：三制式站台梯度成立（公交 ≤ 电车 < 地铁），电车 L 档半径不再回退，造价口径不变。');
