// v3.64 回归：有轨电车不是全封闭系统——同层同站换乘、共线运营、地面十字交叉都放行。
//   ① 两条有轨电车线在同一层（地面）共用一个车站：不再报 tramLevel / tramShare。
//   ② 两条有轨电车线共用一段轨道（共线运营）：共线两端站同层共站，不报 tramLevel / tramShare，
//      且共线轨道被 M.coTrackSegs 正确识别。
//   ③ 有轨电车 ↔ 地铁共站仍然禁止（tramShare，规则①不变）。
// 用法：node scripts/test-tram-share.mjs [地图 id，默认 ms]
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const mapId = process.argv[2] || 'ms';
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
C.useMap(mapId);
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const city = g.city, year = 2027;

const nudge = (x, y) => {
  for (const d of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) {
      if (M.checkSite(city, x + dx, y + dy, 'surface').ok) return [x + dx, y + dy];
    }
  }
  return null;
};
const addTram = (net, name) => {
  const lid = M.newLine(net, name, 'tram');
  net.lines[lid].grade = 'T2'; net.lines[lid].speed = 40;
  return lid;
};
const station = (net, x, y, type) => {
  const p = nudge(x, y);
  assert.ok(p, '走廊上可建站：' + x + ',' + y);
  return M.addStation(net, p[0], p[1], { size: 'M', type: type || 'surface' }, city);
};

// ---- ① 两条有轨电车线同层共用一个车站 ----
{
  const net = M.empty();
  const l1 = addTram(net, '地面 1 号线'), l2 = addTram(net, '地面 2 号线');
  const s0 = station(net, 250, 168), s1 = station(net, 253, 168), s2 = station(net, 256, 168);
  const s3 = station(net, 253, 171), s4 = station(net, 253, 174);
  M.addSegment(net, l1, s0, s1, [], 'surface');
  M.addSegment(net, l1, s1, s2, [], 'surface');
  M.addSegment(net, l2, s1, s3, [], 'surface');   // 两线共用 s1
  M.addSegment(net, l2, s3, s4, [], 'surface');
  M.normalizeLines(net);
  assert.equal(M.stationLines(net, s1).length, 2, '共站接入两条电车线');
  assert.equal(M.stationLevels(net, s1).length, 1, '两条电车线同在地面层');
  const ev = M.evaluate(net, M.empty(), city, year);
  assert.ok(!ev.conflicts.some(c => c.type === 'tramLevel'), '两条电车同层共站不报 tramLevel（v3.64）');
  assert.ok(!ev.conflicts.some(c => c.type === 'tramShare'), '两条电车同层共站不报 tramShare');
}
console.log('  ok  ① 两条有轨电车同层共站：放行');

// ---- ② 共线运营：两条电车线共用一段轨道 ----
{
  const net = M.empty();
  const l1 = addTram(net, '共线 A 线'), l2 = addTram(net, '共线 B 线');
  const a = station(net, 250, 160), b = station(net, 253, 160), c = station(net, 256, 160), d = station(net, 259, 160);
  M.addSegment(net, l1, a, b, [], 'surface');
  M.addSegment(net, l1, b, c, [], 'surface');
  M.addSegment(net, l1, c, d, [], 'surface');
  // B 线从自己的起点接入 b，再沿 A 线轨道 from=b 并线到 d
  const start = station(net, 247, 160);
  M.addSegment(net, l2, start, b, [], 'surface');
  const r = M.runAlong(net, l2, b, l1, d);
  assert.ok(r && r.added >= 1, 'B 线沿 A 线轨道形成共线：' + ((r && r.error) || ''));
  M.normalizeLines(net);
  // 找 B 线在共线段的区间（b—c 或 c—d），确认它和 A 线是同一条物理轨道
  const bSeg = M.lineSegs(net, l2).find(s => (s.a === b || s.b === b) && (s.a === c || s.b === c)) ||
               M.lineSegs(net, l2).find(s => (s.a === c || s.b === c) && (s.a === d || s.b === d));
  assert.ok(bSeg, 'B 线有共线区段');
  assert.ok(M.coTrackSegs(net, bSeg).length >= 1, '共线区段被 coTrackSegs 识别（同一物理轨道）');
  const ev = M.evaluate(net, M.empty(), city, year);
  assert.ok(!ev.conflicts.some(c => c.type === 'tramLevel'), '共线两端同层共站不报 tramLevel（v3.64）');
  assert.ok(!ev.conflicts.some(c => c.type === 'tramShare'), '共线两端同层共站不报 tramShare');
}
console.log('  ok  ② 两条有轨电车共线运营：共线区段同层共站放行');

// ---- ③ 有轨电车 ↔ 地铁共站仍禁止 ----
{
  const net = M.empty();
  const l1 = addTram(net, '电车线');
  const a = station(net, 250, 176), mid = station(net, 253, 176), c = station(net, 256, 176);
  M.addSegment(net, l1, a, mid, [], 'surface');
  M.addSegment(net, l1, mid, c, [], 'surface');
  const mLid = M.newLine(net, '地铁线', 'metro');
  const mStart = station(net, net.stations[mid].x + 2, 178, 'underground');
  M.addSegment(net, mLid, mStart, mid, [], 'underground');
  M.normalizeLines(net);
  const ev = M.evaluate(net, M.empty(), city, year);
  assert.ok(ev.conflicts.some(c => c.type === 'tramShare'), '有轨电车与地铁共站仍报 tramShare（规则①不变）');
}
console.log('  ok  ③ 有轨电车 ↔ 地铁共站仍禁止（规则①不变）');

console.log('\nPASS 有轨电车同层换乘 / 共线 / 十字交叉规则（' + mapId + '）');
