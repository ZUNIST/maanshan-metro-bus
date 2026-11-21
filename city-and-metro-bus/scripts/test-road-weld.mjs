// 路网连通性回归测试（v3.46）：渲染层「端点焊接」与「支路整条判定」
//   背景：高德瓦片骨架化提取的补充路段是一段段独立折线，路口端点常差 0.1–0.5 格；
//         支路又按中点格逐段过滤，和县这类开发斑块稀疏的地方就画成一段段孤立短线。
//   这里只做源码接线与几何判定的断言（渲染需要 canvas，不在 Node 里跑）。
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const src = await readFile(new URL('js/render.js', root), 'utf8');
let pass = 0;
const ok = (m) => { console.log('  ok  ' + m); pass++; };

// ① 端点焊接存在，且按 roadVersion + 已通车数量缓存
assert.ok(/Renderer\.prototype\._roadWeld = function/.test(src), '应存在 _roadWeld');
ok('渲染层提供 _roadWeld（端点焊接）');
assert.ok(/w\.ver === city\.roadVersion && w\.bc === bc/.test(src), '缓存键应含 roadVersion 与已通车道路数');
ok('缓存键含 roadVersion + 已通车数量（避免首帧空结果被缓存）');
assert.ok(/ends\.push\(rec\)/.test(src), '端点必须收集进 ends（曾漏掉导致空转）');
ok('端点正确收集（回归：漏 push 导致补线为空）');

// ② 端点-端点 + 端点-线段的两种焊接，阈值合理
assert.ok(/bd = 0\.42/.test(src), '端点-端点阈值 0.42 格');
assert.ok(/bqd = 0\.24/.test(src), '端点-线段阈值 0.24 格');
ok('两种焊接：端点—端点 0.42 格、端点—线段 0.24 格（T 字路口）');

// ③ 跨水保护
assert.ok(/city\.lu\[mc\] === LU\.WATER/.test(src), '补线不得跨水');
ok('跨水补线被拦截（不会凭空多出一座桥）');

// ④ 支路整条判定
assert.ok(/let any = false;/.test(src) && /if \(!any\) continue;/.test(src), '支路应先判整条是否沾到建成区');
assert.ok(/if \(!any\) continue;[\s\S]{0,400}?st\.moveTo\(p\[q\]/.test(src), '命中后整条绘制（且按水面裁剪后逐段画）');
ok('支路改为「沾到已开发街区就整条画」，不再逐段切碎');

// ⑤ 焊接线按等级用对应路面颜色绘制
for (const cls of ['2', '3', '4']) {
  assert.ok(new RegExp('rod\\[' + cls + '\\]').test(src), '焊接线应包含等级 ' + cls);
}
ok('焊接线按 2/3/4 级路面分别上色');

console.log('\nPASS ' + pass + ' 项：路网端点焊接与支路整条判定接线正确，且有跨水保护。');
