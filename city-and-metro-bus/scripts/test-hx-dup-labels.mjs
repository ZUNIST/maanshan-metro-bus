// 和县重复地标标签回归测试（v3.45）
// 陋室公园/镇淮楼/和县体育中心等地标层与设施层各存一份（同名同点），放大后画成两个标签。
// 修复：render.js 渲染层同名同点只标一次。本测试验证 ①和县数据事实 ②渲染源码去重逻辑存在。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 },
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
for (const [, src] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
  if (src === 'js/save.js') break;
}
const C = context.CM;
C.UI = function () {};
C.useMap('hx');
const D = C.DATA;

// 与渲染层一致的「同名同点」判定
const samePlace = (n1, x1, y1, n2, x2, y2) =>
  String(n1 == null ? '' : n1).replace(/站$/, '') === String(n2 == null ? '' : n2).replace(/站$/, '') &&
  Math.hypot(x1 - x2, y1 - y2) < 4;
assert.equal(samePlace('马鞍山南站', 10, 10, '马鞍山南', 11, 10), true, '去「站」同名');
assert.equal(samePlace('陋室公园', 160, 146, '陋室公园', 170, 146), false, '远点不同');
console.log('PASS 同名同点判定');

// 和县这些地点确实「地标层 + 设施层各一份、同名同点」，会被渲染去重合并
const pairs = [
  ['陋室公园', 160.0, 146.0], ['镇淮楼', 161.4, 147.2], ['和县体育中心', 150.8, 138.7],
  ['霸王祠', 199.0, 87.4], ['香泉温泉', 145.3, 77.3], ['西梁山（天门山）', 151.4, 243.4], ['半月湖', 95.6, 105.4],
];
let merged = 0;
for (const [name, x, y] of pairs) {
  const fac = D.facilities.find(f => f.n === name && f.at && Math.hypot(f.at[0] - x, f.at[1] - y) < 1);
  const lm = D.landmarks.find(l => l.name === name && Math.hypot(l.x - x, l.y - y) < 1);
  assert.ok(fac, `${name}: 设施点应存在`);
  assert.ok(lm, `${name}: 地标应存在`);
  assert.ok(samePlace(lm.name, lm.x, lm.y, fac.n, fac.at[0], fac.at[1]), `${name}: 两层判为同一地点`);
  console.log(`OK ${name}: 地标(${lm.x},${lm.y}) 设施(${fac.at[0]},${fac.at[1]}) -> 合并 1 个标签`);
  merged++;
}
// 渲染层必须有去重逻辑
const render = await readFile(new URL('js/render.js', root), 'utf8');
assert.ok(/const shownPlaces\s*=/.test(render), 'render.js 应有 shownPlaces 去重集合');
assert.ok(/samePlace\(s\.n, s\.x, s\.y, it\.name, it\.x, it\.y\)/.test(render), 'render.js 应对同名同点地点跳过');
console.log(`PASS ${merged} 处重复由渲染去重；渲染源码去重逻辑存在`);
