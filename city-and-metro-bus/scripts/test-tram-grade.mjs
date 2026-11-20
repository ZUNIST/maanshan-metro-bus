// v3.45 回归：有轨电车按现实放宽最大坡度到 6%（地铁仍 3%），所需转换坡道长度相应减半。
// 现实依据：地铁《地铁设计规范》正线 ≤30‰；有轨电车 CJJ/T 295 正线 ≤50‰/困难 60‰，
// 江苏 DB32/T 3551、胶轮电车规范正线 60‰/困难 80‰。取 60‰。
// 用法：node scripts/test-tram-grade.mjs
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

// 三档坡度配置
ok(CFG.metro.maxGrade === 0.03, '地铁最大坡度仍为 3%', '实际 ' + CFG.metro.maxGrade);
ok(CFG.tram.maxGrade === 0.06, '有轨电车最大坡度为 6%', '实际 ' + CFG.tram.maxGrade);
ok(CFG.bus.maxGrade === undefined, '公交未定义 maxGrade（虚拟地面线路不需要）');

const metroL = { sys: 'metro' }, tramL = { sys: 'tram' }, busL = { sys: 'bus' };
const lv = CFG.metro.levelM; // 三者层高一致（配置里只有 metro.levelM）
const dhUG = Math.abs(lv.underground - lv.surface);   // 地下↔地面 15 m
const dhEG = Math.abs(lv.elevated - lv.underground);  // 地下↔高架 27 m

// 地下 → 地面 → 高架 转换，两端坡道需求
const metroNeed = M.rampNeed('underground', 'surface', 'elevated', metroL);
const tramNeed = M.rampNeed('underground', 'surface', 'elevated', tramL);
ok(Math.abs(metroNeed.a - dhUG / 0.03) < 1e-6, '地铁坡道 a 按 3% 计算', metroNeed.a + ' m');
ok(Math.abs(metroNeed.b - (lv.elevated - lv.surface) / 0.03) < 1e-6, '地铁坡道 b 按 3% 计算', metroNeed.b + ' m');
ok(Math.abs(tramNeed.a - dhUG / 0.06) < 1e-6, '电车坡道 a 按 6% 计算', tramNeed.a + ' m');
ok(Math.abs(tramNeed.b - (lv.elevated - lv.surface) / 0.06) < 1e-6, '电车坡道 b 按 6% 计算', tramNeed.b + ' m');
ok(Math.abs(tramNeed.a / metroNeed.a - 0.5) < 1e-9, '电车所需坡道恰为地铁一半', '比值 ' + (tramNeed.a / metroNeed.a).toFixed(3));

// 向后兼容：不传线路 / 公交（无 maxGrade）都回退到地铁 3%
const noLine = M.rampNeed('underground', 'surface', 'elevated');
const busNeed = M.rampNeed('underground', 'surface', 'elevated', busL);
ok(Math.abs(noLine.a - metroNeed.a) < 1e-6, '无线路参数回退地铁坡度');
ok(Math.abs(busNeed.a - metroNeed.a) < 1e-6, '公交无 maxGrade 回退地铁坡度（公交本就只有地面层）');

// 端到端接线验证：坡道检查与高度剖面都把线路对象透传下去，冲突文案按制式显示。
// （几何长度/采样由 segGeom 决定，端到端构造脆弱；这里用源码断言锁定接线，数值已由上面覆盖。）
const metroSrc = await readFile(new URL('js/metro.js', root), 'utf8');
ok(/M\.rampNeed\s*=\s*function\s*\(tA,\s*tS,\s*tB,\s*line\)/.test(metroSrc), 'rampNeed 接收线路参数');
ok(/const cfg = line \? M\.cfgOf\(line\) : CFG\.metro/.test(metroSrc), 'rampNeed 按制式取配置');
ok(/M\.heightProfile\s*=\s*function\s*\(g,\s*tA,\s*tS,\s*tB,\s*line\)/.test(metroSrc), 'heightProfile 接收并透传线路');
ok(/M\.rampNeed\(tA, tS, tB, line\)/.test(metroSrc), 'heightProfile 把线路传给 rampNeed');
ok(/M\.rampNeed\(tA, s\.type, tB, line\)/.test(metroSrc), 'evaluate 坡道检查把线路传给 rampNeed');
ok(/M\.sysName\(line\) \+ '最大坡度为 ' \+ Math\.round\(\(rampCfg\.maxGrade/.test(metroSrc), '冲突文案按制式显示坡度');

console.log('\nPASS ' + passed + ' 项：有轨电车坡度放宽到 6%，地铁 3% 不变，存档/调用兼容。');
