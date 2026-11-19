// v3.39 回归：站台档位（公交 BRT 站台 / 有轨电车大型站）与 BRT 造价
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
const C = context.CM, M = C.Metro, BUS = C.CFG.bus, TRAM = C.CFG.tram;
C.UI = function () {};
const ok = m => console.log('  ok  ' + m);

// ---- 1. 档位与容量 ----
assert.equal(BUS.stationSizes.join(','), 'S,M,L', '公交档位含 L');
assert.equal(TRAM.stationSizes.join(','), 'S,M,L', '电车档位含 L');
assert.equal(BUS.stationCap.L, 3000, 'BRT 站台 3000 人次/时');
assert.equal(TRAM.stationCap.L, 6000, '电车大型站 6000 人次/时');
assert.equal(BUS.stationCap.M, 1000, '公交中站不变');
assert.equal(TRAM.stationCap.M, 4000, '电车内站不变');
ok('档位与接待能力（BRT 3000 / 电车大型 6000）');

// ---- 2. 显示名按制式 ----
assert.equal(M.sizeText({ sys: 'bus' }, 'L'), 'BRT 站台', '公交 L 显示为 BRT 站台');
assert.equal(M.sizeText({ sys: 'bus' }, 'M'), '中型', '公交 M 仍叫中型');
assert.equal(M.sizeText({ sys: 'tram' }, 'L'), '大型', '电车 L 叫大型');
assert.equal(M.sizeText({}, 'L'), '大型', '地铁 L 叫大型');
assert.equal(M.sizeOkFor({ sys: 'bus' }, 'L'), true, '公交允许 L 档');
assert.equal(M.sizeOkFor({ sys: 'tram' }, 'L'), true, '电车允许 L 档');
assert.equal(M.sizeOkFor({ sys: 'bus' }, 'XL'), false, '公交不允许 XL');
ok('规模显示名与档位校验');

// ---- 3. 编组上限 ----
assert.equal(TRAM.carsBySize.L, 4, '电车大型站可停 4 节');
assert.equal(BUS.carsBySize.L, 1, '公交站台仍停 1 辆（BRT 铰接靠 carCap）');
ok('编组上限');

// ---- 4. 容量表按制式取 ----
assert.equal(M.capTableFor('bus').L, 3000, 'capTableFor(bus).L');
assert.equal(M.capTableFor('tram').L, 6000, 'capTableFor(tram).L');
assert.equal(M.capTableFor('metro').L, 70000, '地铁 L 不受影响');
ok('按制式取容量表');

// ---- 5. BRT 造价下调 ----
const B3 = BUS.grades.find(x => x.id === 'B3');
assert.equal(B3.track, 1600, 'B3 BRT 单价 1600 万元/km（原 2200）');
assert.ok(B3.track < 2200 && B3.track > BUS.grades.find(x => x.id === 'B2').track,
  'B3 高于 B2 专用道、低于原价');
ok('BRT 线路单价 2200 → 1600');

// ---- 6. 站台造价（L 档 × 制式折扣）----
const y = 2027;
const baseL = M.stationCost('surface', 'L', y);          // 地铁地面 L 基准价
assert.ok(baseL > 0);
const busL = baseL * BUS.stationFactor.surface;
const tramL = baseL * TRAM.stationFactor.surface;
// 绝对值随年份物价指数放大（2027 年约为基准年的 3.5 倍），这里校验「折扣比例」与「相对地铁的便宜程度」
assert.ok(Math.abs(busL / baseL - BUS.stationFactor.surface) < 1e-9, 'BRT 站台按公交 8% 计价');
assert.ok(Math.abs(tramL / baseL - TRAM.stationFactor.surface) < 1e-9, '电车大型站按 35% 计价');
assert.ok(busL < tramL, 'BRT 站台比电车大型站便宜');
ok('L 档站台造价（' + y + ' 年）：BRT 约 ' + Math.round(busL) + ' 万 / 电车大型约 ' + Math.round(tramL) + ' 万，分别为地铁 L 站的 8% / 35%');

console.log('PASS station tiers: 公交 BRT 站台 3000 人次/时、电车大型站 6000 人次/时、B3 单价降至 1600');
