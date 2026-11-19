// v3.39 回归：公交平面交叉豁免（公交无钢轨，与任何轨道平面交叉都不冲突）
// 同时确认「电车/地铁之间的平交规则」没有被放宽。
// 用法：node scripts/test-bus-crossing.mjs
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
const C = context.CM, M = C.Metro;
C.UI = function () {};

C.useMap('ms');
const g = C.Game.create({ mode: 'free', seed: 20260601 });
const city = g.city;

// 建两条交叉的 surface 线（四个端点各一座地面站）：横线 y=140、竖线 x=155，交于 155,140
const build = function (sysA, sysB) {
  const d = M.empty();
  const mk = function (sys, x1, y1, x2, y2, name) {
    const L = M.newLine(d, name, sys);              // 返回 line id
    const a = M.addStation(d, x1, y1, { size: 'M', type: 'surface' }, city);   // 返回 station id
    const b = M.addStation(d, x2, y2, { size: 'M', type: 'surface' }, city);
    assert.ok(a && b, name + ' 两端车站应能落地');
    const r = M.addSegment(d, L, a, b, [], 'surface');
    assert.ok(r && r.id, name + ' 区间应能创建：' + ((r && r.error) || ''));
  };
  mk(sysA, 150, 140, 160, 140, 'A 线');
  mk(sysB, 155, 135, 155, 145, 'B 线');
  const ev = M.evaluate(d, M.empty(), city, g.clock.y);
  return ev.conflicts.filter(function (c) { return c.type === 'level'; });
};

const metroBus = build('metro', 'bus');
assert.equal(metroBus.length, 0, '公交 × 地铁地面段：不应报平面交叉（实际 ' + metroBus.length + '）');
console.log('  ok  公交 × 地铁地面段：0 冲突');

const busBus = build('bus', 'bus');
assert.equal(busBus.length, 0, '公交 × 公交：不应报平面交叉（实际 ' + busBus.length + '）');
console.log('  ok  公交 × 公交（路口）：0 冲突');

const tramBus = build('tram', 'bus');
assert.equal(tramBus.length, 0, '有轨电车 × 公交：不应报平面交叉（实际 ' + tramBus.length + '）');
console.log('  ok  有轨电车 × 公交：0 冲突');

const metroMetro = build('metro', 'metro');
assert.ok(metroMetro.length >= 1, '地铁 × 地铁：仍应报平面交叉（实际 ' + metroMetro.length + '）');
console.log('  ok  地铁 × 地铁：仍报 ' + metroMetro.length + ' 处（规则未放宽）');

const tramTram = build('tram', 'tram');
assert.ok(tramTram.length >= 1, '电车 × 电车：仍应报平面交叉（实际 ' + tramTram.length + '）');
console.log('  ok  电车 × 电车：仍报 ' + tramTram.length + ' 处（规则未放宽）');

console.log('PASS bus crossing: 公交与任何轨道平交放行，电车/地铁之间的平交仍拦截');
