// 区域经济图层端到端测试（v3.67）：统计口径与缓存，全程在 Node 里跑（不碰 DOM）
//   ① 各区县人口 / GDP 之和 = 全城总量（GDP 按岗位占比分摊，误差 < 1e-6）
//   ② 片区人口之和 = 全城人口
//   ③ 有区县级标注的地图（ms/hx）用区县，没有的地图（ny）退化为 borough 级，均能统计
//   ④ 文本格式（亿元 / 万人）正确
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {}, removeEventListener() {}, requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame() {},
};
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
const SKIP = new Set(['js/sound.js', 'js/soundscape.js', 'js/tools.js', 'js/ui.js', 'js/screens.js', 'js/sketch.js',
  'js/pages.js', 'js/corp.js', 'js/fleet.js', 'js/impact.js', 'js/voices.js', 'js/opsapp.js', 'js/stats.js',
  'js/netreplay.js', 'js/v22-ui.js', 'js/netmap.js', 'js/netlayout.js', 'js/render.js']);
for (const [, src] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  if (SKIP.has(src)) continue;
  vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
  if (src === 'js/save.js') break;
}
for (const src of ['js/macro.js', 'js/econlayer.js']) vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
const C = context.CM;
assert.ok(C.EconLayer && C.EconLayer.stats, '区域经济图层模块已加载');

for (const id of ['ms', 'ms27', 'ms30', 'hx', 'hx27', 'ny']) {
  C.useMap(id);
  const g = C.Game.create({ mode: 'free', seed: 20270101 });
  C.game = g;
  const s = C.EconLayer.stats(g);
  assert.ok(s && s.districts.length > 0, id + ' 统计非空');
  const dp = s.districts.reduce((a, d) => a + d.pop, 0), dg = s.districts.reduce((a, d) => a + d.gdp, 0);
  const lp = s.list.reduce((a, r) => a + r.pop, 0);
  assert.ok(Math.abs(dp - s.total.pop) / Math.max(1, s.total.pop) < 1e-6, id + ' 区县人口之和 = 全城');
  assert.ok(Math.abs(dg - s.total.gdp) / Math.max(1, s.total.gdp) < 1e-6, id + ' 区县 GDP 之和 = 全城');
  assert.ok(Math.abs(lp - s.total.pop) / Math.max(1, s.total.pop) < 1e-6, id + ' 片区人口之和 = 全城');
  assert.ok(s.total.gdp > 0, id + ' 全城 GDP 为正');
  const txt = C.EconLayer.gdpText(s.total.gdp), ptxt = C.EconLayer.popText(s.total.pop);
  assert.ok(/亿元$/.test(txt) && /万人$/.test(ptxt), id + ' 文本格式：' + txt + ' / ' + ptxt);
  console.log('  ' + id + ' ok：' + s.districts.length + ' 区 / ' + s.list.length + ' 片区，GDP ' + txt + '，人口 ' + ptxt);
}
console.log('\n区域经济图层统计测试通过');
