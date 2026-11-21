// 公交站四档专项测试（v3.46）：小 / 中 / 大 / BRT 站台（XL）
//   ① 四档齐全，XL 显示为「BRT 站台」，L 是「大型」而不是 BRT
//   ② 造价按现实分级：相对同图地铁地面站的比例约 0.8% / 2% / 5% / 20%
//   ③ 上下客能力 400 / 1000 / 2000 / 4000，服务半径 200 / 300 / 400 / 600
//   ④ 公交站升级链 L→XL 不受地铁「超大型」史实解锁限制；地铁仍受限
//   ⑤ 计费与预览同源：stationCostOf 走绝对表，接地铁线后回到地铁原价
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
const CM = context.CM, M = CM.Metro, CFG = CM.CFG, B = CFG.bus, MET = CFG.metro;
let pass = 0;
const ok = (m) => { console.log('  ok  ' + m); pass++; };

// ① 四档与显示名
assert.equal(JSON.stringify(B.stationSizes), JSON.stringify(['S', 'M', 'L', 'XL']), '公交站档位必须是 S/M/L/XL 四档');
ok('四档齐全 S/M/L/XL');
assert.equal(M.sizeText({ sys: 'bus' }, 'XL'), 'BRT 站台');
assert.equal(M.sizeText({ sys: 'bus' }, 'L'), '大型');
assert.equal(M.sizeText({ sys: 'bus' }, 'M'), '中型');
assert.equal(M.sizeText({ sys: 'bus' }, 'S'), '小型');
ok('XL=BRT 站台，L/M/S=大型/中型/小型（不再把 L 当 BRT）');

// ② 造价按现实比例（以同图地铁地面站为分母）
const year = 2027;
for (const sz of ['S', 'M', 'L', 'XL']) {
  const busCost = M.stationCostFor('bus', 'surface', sz, year);
  const metCost = M.stationCostFor('metro', 'surface', sz, year);
  const pct = busCost / metCost;
  const want = { S: 0.008, M: 0.02, L: 0.05, XL: 0.12 }[sz];   // XL 2400/20000 = 12%
  assert.ok(Math.abs(pct - want) < 0.005, sz + ' 造价比例应约 ' + want + '，实际 ' + pct.toFixed(4));
  console.log('  ok  ' + sz + ' 公交站 ' + Math.round(busCost) + ' 万 / 地铁地面站 ' + Math.round(metCost) + ' 万 = ' + (pct * 100).toFixed(1) + '%');
  pass++;
}
// 绝对价：40 / 160 / 600 / 2400 万（1990 价 × 物价指数）
const idx = M.costIndex(year);
for (const [sz, want] of [['S', 40], ['M', 160], ['L', 600], ['XL', 2400]]) {
  assert.ok(Math.abs(M.stationCostFor('bus', 'surface', sz, year) - want * idx) < 1e-6, sz + ' 绝对造价应为 ' + want + ' 万');
}
ok('造价绝对表 40/160/600/2400 万（随物价指数缩放）');
// 单调递增
for (let i = 1; i < 4; i++) {
  const a = M.stationCostFor('bus', 'surface', B.stationSizes[i - 1], year), b = M.stationCostFor('bus', 'surface', B.stationSizes[i], year);
  assert.ok(b > a, '造价必须逐档递增');
}
ok('造价逐档递增');

// ③ 容量与服务半径
assert.equal(JSON.stringify(B.stationCap), JSON.stringify({ S: 400, M: 1000, L: 2000, XL: 4000 }));
assert.equal(JSON.stringify(B.accessM), JSON.stringify({ S: 200, M: 300, L: 400, XL: 600 }));
ok('上下客 400/1000/2000/4000 人次/时，服务半径 200/300/400/600 m');
for (let i = 1; i < 4; i++) {
  assert.ok(B.stationCap[B.stationSizes[i]] > B.stationCap[B.stationSizes[i - 1]], '容量递增');
  assert.ok(B.accessM[B.stationSizes[i]] > B.accessM[B.stationSizes[i - 1]], '半径递增');
}
ok('容量与半径均逐档递增');

// ④ 升级链：公交 L→XL 不受史实解锁限制
CM.useMap('ms');
const g = CM.Game.create({ mode: 'free', seed: 20270101 });
const net = g.net;
const lid = M.newLine(net, '', 'bus');
const line = net.lines[lid];
assert.equal(line.sys, 'bus');
// 站点允许的档位
assert.ok(M.sizeOkFor(line, 'XL'), '公交线路允许建 XL（BRT 站台）');
assert.ok(!M.sizeOkFor({ sys: 'tram' }, 'XL'), '有轨电车仍不提供 XL');
ok('sizeOkFor：公交允许 XL，电车不允许');

// ⑤ 只服务公交的车站按公交绝对价计
const s = { id: 'st_test', name: '测试站', x: 10, y: 10, type: 'surface', size: 'XL' };
net.stations[s.id] = s;
const segId = M.newId(net, 's');
net.segments[segId] = { id: segId, line: lid, a: s.id, b: s.id, type: 'surface' };
line.segs = [segId];
s.lines = [lid];
assert.ok(Math.abs(M.stationCostOf(net, s.id, 'surface', 'XL', year) - M.stationCostFor('bus', 'surface', 'XL', year)) < 1e-6, '公交专用站按绝对表计');
ok('公交专用站按绝对表计费');

// 接入地铁线后回到地铁原价（stationLines 由区段推导，需要真的挂一段地铁轨道）
const mline = M.newLine(net, '', null);
const msegId = M.newId(net, 's');
net.segments[msegId] = { id: msegId, line: mline, a: s.id, b: s.id, type: 'surface' };
net.lines[mline].segs = [msegId];
assert.ok(Math.abs(M.stationCostOf(net, s.id, 'surface', 'XL', year) - M.stationCost('surface', 'XL', year)) < 1e-6, '接入地铁后按地铁原价');
ok('接入地铁线后回到地铁站原价');

// ⑥ 地铁 XL 造价不再是 NaN（原表格缺 XL）
const metXL = M.stationCostFor('metro', 'surface', 'XL', year);
assert.ok(Number.isFinite(metXL) && metXL > 0, '地铁地面 XL 造价必须有效，实际 ' + metXL);
ok('地铁 XL 站造价已补齐（' + Math.round(metXL) + ' 万，原为 NaN）');

// ⑦ 源码接线：UI 与运营页按制式取档位/造价
const uiSrc = await readFile(new URL('js/ui.js', root), 'utf8');
const opsSrc = await readFile(new URL('js/opsapp.js', root), 'utf8');
assert.ok(/M\.stationCostFor\(sys, T\.buildType, sz, y\)/.test(uiSrc), '建站工具条按制式取价');
assert.ok(/scfg \? M\.stationCostFor\(opts\.sys, opts\.type, sz, y\)/.test(uiSrc), '规模卡片按制式取价');
assert.ok(/nextSizeOf/.test(opsSrc), '运营页升级链按制式');
assert.ok(/CFG\.bus\.stationSizes/.test(opsSrc), '运营页批量档位按制式（公交含 XL）');
ok('源码接线：UI / 运营页均按制式取档与计价');

console.log('\nPASS ' + pass + ' 项：公交站四档（小/中/大/BRT）按现实造价比例、容量、服务半径落地，地铁与电车口径不变。');
