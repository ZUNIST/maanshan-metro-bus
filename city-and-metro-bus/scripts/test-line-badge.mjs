// 线路徽标缩写回归测试（玩家反馈）：线路图端点/图例/跟随卡上的简称要保留「地名前缀 + 制式简称 + 编号」。
//   和含公交1号 → 和含公交1；公交101路 → 公交101；和含有轨电车1 → 和含有轨1。
// 只改显示层，不改 line.name 与存档；地铁与英文名不回退。
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
const M = context.CM.Metro;
const badge = (name, num) => M.lineBadge({ name: name, num: num || 1 });
let pass = 0;
function eq(name, got, want) {
  assert.equal(got, want, name + '：期望「' + want + '」，实际「' + got + '」');
  console.log('  ok  ' + name + ' → ' + got);
  pass++;
}

// 玩家点名的三种情况
eq('和含公交1号', badge('和含公交1号'), '和含公交1');
eq('公交101路', badge('公交101路'), '公交101');
eq('和含有轨电车1', badge('和含有轨电车1'), '和含有轨1');

// 制式全称缩写、尾部单位字
eq('公交1路', badge('公交1路'), '公交1');
eq('有轨电车1号线', badge('有轨电车1号线'), '有轨1');
eq('有轨2号线', badge('有轨2号线'), '有轨2');
eq('公共汽车12路', badge('公共汽车12路'), '公交12');
eq('和含有轨电车2号线', badge('和含有轨电车2号线'), '和含有轨2');

// 地铁行为不变
eq('3号线', badge('3号线'), '3');
eq('机场2号线', badge('机场2号线'), '机场2');
eq('1 号线', badge('1 号线'), '1');
eq('无编号中文名保持 2 字', badge('机场快线'), '机场');

// 英文名不回退（ASCII 分支原逻辑）
eq('Airport Express', badge('Airport Express'), 'AE');
eq('S1 线', badge('S1 线'), 'S1');
eq('3', badge('3'), '3');

// 空名回退到编号
eq('空名回退编号', M.lineBadge({ name: '', num: 7 }), '7');

// 显示层缩写不改线路本名
const L = { name: '和含有轨电车1', num: 1 };
assert.equal(M.lineBadge(L), '和含有轨1');
assert.equal(L.name, '和含有轨电车1', '徽标缩写不得改动 line.name');
console.log('  ok  显示层缩写不改动 line.name');
pass++;

console.log('\nPASS ' + pass + ' 项：徽标保留地名前缀+制式简称+编号，地铁/英文不回退，存档数据不变。');
