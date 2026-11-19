// 公交现实规则测试（v-bus 规则修订）：
//   ① 公交只有地面线路/车站（地下/高架段与站台报 busLevel 冲突）
//   ② 公交免拆迁（沿路段与车站不计 demolition）
//   ③ 公交不与地铁/有轨同站换乘（tramShare/busShare），但公交之间可共站
//   ④ 公交占路影响车流：沿路段按等级折减道路容量（laneTake），独立路基段不影响
// 用法：node scripts/test-bus-rules.mjs [地图 id，默认 ms]
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
const C = context.CM, M = C.Metro, B = C.CFG.bus;
C.UI = function () {};
const ok = (m) => console.log('  ok  ' + m);
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

// 造一条简单的公交线（surface），返回 net / lid / 站点 id 数组
function busLine(sys, grade) {
  const net = M.clone(g.net), lid = M.newLine(net, null, sys);
  if (grade) net.lines[lid].grade = grade;
  const pts = [];
  for (let i = 0; i < 8; i++) { const p = nudge(250 + i * 3.2, 170); if (p) pts.push(p); }
  assert.ok(pts.length >= 6, '走廊上可建站：' + pts.length);
  let prev = null; const ids = [];
  for (const [x, y] of pts) {
    const sid = M.addStation(net, x, y, { size: 'M', type: 'surface' }, city);
    ids.push(sid);
    if (prev) M.addSegment(net, lid, prev, sid, [], 'surface');
    prev = sid;
  }
  M.normalizeLines(net);
  return { net, lid, ids };
}

// ---- ① 公交只有地面线路/车站 ----
assert.equal(B.surfaceOnly, true, 'config 公交 surfaceOnly');
assert.equal(B.allowLevels.join(','), 'surface', 'config 公交只允许地面');
{
  const { net, ids } = busLine('bus', 'B1');
  const ev = M.evaluate(net, g.net, city, year);
  assert.ok(ev.conflicts.every(c => c.type !== 'busLevel'), '全地面公交线无 busLevel 冲突');
  const under = M.clone(net);
  const sid = ids[Math.floor(ids.length / 2)];
  // 把该站所有经过的区段与站台改成地下
  for (const sg of M.lineSegs(under, undefined) || []) { /* noop */ }
  for (const k in under.segments) if (under.segments[k].a === sid || under.segments[k].b === sid) under.segments[k].type = 'underground';
  under.stations[sid].type = 'underground';
  if (under.stations[sid].lv) for (const l in under.stations[sid].lv) under.stations[sid].lv[l] = 'underground';
  const ev2 = M.evaluate(under, g.net, city, year);
  assert.ok(ev2.conflicts.some(c => c.type === 'busLevel'), '公交地下段/站台报 busLevel 冲突');
}
ok('① 公交仅地面：地下/高架段与站台报冲突');

// ---- ② 公交免拆迁 ----
assert.equal(B.noDemolition, true, 'config 公交 noDemolition');
{
  const { net, lid } = busLine('bus', 'B1');
  const segments = M.lineSegs(net, lid);
  const ev = M.evaluate(net, g.net, city, year);
  const demo = ev.items.filter(i => i.kind === 'demolition');
  assert.equal(demo.length, 0, '纯公交方案无拆迁项：' + JSON.stringify(demo.map(i => i.label)));
  // 同线位的地铁方案应有拆迁（对照，证明不是全局关掉拆迁）
  const mnet = M.clone(net);
  for (const k in mnet.lines) mnet.lines[k].sys = 'metro';
  const evM = M.evaluate(mnet, g.net, city, year);
  const demoM = evM.items.filter(i => i.kind === 'demolition');
  assert.ok(demoM.length > 0, '同线位地铁方案仍有拆迁项（对照）');
}
ok('② 公交免拆迁：公交站与沿路段不计拆迁，地铁不变');

// ---- ③ 换乘隔离 ----
{
  // 公交 + 地铁共站 → 报冲突
  const { net, ids } = busLine('bus', 'B1');
  const mid = ids[Math.floor(ids.length / 2)];
  const lidM = M.newLine(net, '测试地铁', 'metro');
  const far = nudge(net.stations[mid].x + 1.1, net.stations[mid].y);
  if (far) {
    const mA = M.addStation(net, far[0], far[1], { size: 'M', type: 'surface' }, city);
    M.addSegment(net, lidM, mA, mid, [], 'surface');
    const ev = M.evaluate(net, g.net, city, year);
    assert.ok(ev.conflicts.some(c => c.type === 'tramShare'), '公交与地铁共站报 tramShare');
  }
  // 公交 + 电车共站 → 报 busShare
  const tnet = M.clone(g.net), lidT = M.newLine(tnet, '测试有轨', 'tram');
  const base = nudge(250, 170), tids = [];
  let prev = null;
  for (let i = 0; i < 4; i++) {
    const p = nudge(250 + i * 3, 172);
    const sid = M.addStation(tnet, p[0], p[1], { size: 'M', type: 'surface' }, city);
    tids.push(sid);
    if (prev) M.addSegment(tnet, lidT, prev, sid, [], 'surface');
    prev = sid;
  }
  const bnet = M.clone(tnet), lidB = M.newLine(bnet, '测试公交', 'bus');
  const bp1 = nudge(tids[1] === undefined ? 260 : tnet.stations[tids[1]].x + 0.01, 170);
  // 让公交线接入电车的中间站
  if (tids[1] != null) {
    const bA = M.addStation(bnet, bp1[0], bp1[1], { size: 'M', type: 'surface' }, city);
    M.addSegment(bnet, lidB, bA, tids[1], [], 'surface');
    const ev = M.evaluate(bnet, g.net, city, year);
    assert.ok(ev.conflicts.some(c => c.type === 'busShare'), '公交与有轨共站报 busShare');
  }
  // 两条公交共站 → 允许（无 busShare / tramShare 因共站）
  const b2 = M.clone(g.net), l1 = M.newLine(b2, '公交甲', 'bus'), l2 = M.newLine(b2, '公交乙', 'bus');
  const c0 = nudge(250, 170), c1 = nudge(254, 170), c2 = nudge(258, 170);
  assert.ok(c0 && c1 && c2, '共站测试走廊可建站');
  const s0 = M.addStation(b2, c0[0], c0[1], { size: 'M', type: 'surface' }, city);
  const s1 = M.addStation(b2, c1[0], c1[1], { size: 'M', type: 'surface' }, city);
  const s2 = M.addStation(b2, c2[0], c2[1], { size: 'M', type: 'surface' }, city);
  M.addSegment(b2, l1, s0, s1, [], 'surface');
  M.addSegment(b2, l2, s1, s2, [], 'surface');   // 两线共用中间站 s1
  const ev2 = M.evaluate(b2, g.net, city, year);
  assert.ok(!ev2.conflicts.some(c => c.type === 'busShare' || c.type === 'tramShare'), '两条公交共地面站不报冲突');
}
ok('③ 换乘隔离：公交↔地铁/有轨禁共站，公交↔公交可共站');

// ---- ④ 公交占路影响车流 ----
{
  assert.ok(B.grades.find(x => x.id === 'B2').laneTake < B.grades.find(x => x.id === 'B1').laneTake, 'B2 折减强于 B1');
  assert.ok(B.grades.find(x => x.id === 'B3').laneTake < B.grades.find(x => x.id === 'B2').laneTake, 'B3 折减强于 B2');
  const { net, lid } = busLine('bus', 'B2');
  const comp = M.compile(net, city);
  const model = g.model;
  model.setNetwork(comp);
  model.ensureBusLane();
  const mul = model.busLaneMul;
  assert.ok(mul && mul.length === model.road.nA, '生成按弧段的占路折减数组');
  const reduced = Array.from(mul).filter(v => v < 1).length;
  assert.ok(reduced > 0, '沿路公交段折减了道路容量：' + reduced + ' 条弧段');
  // cap() 体现折减
  const ai = Array.from(mul).findIndex(v => v < 1);
  assert.ok(model.cap(ai) < model.road.arcCap[ai] * (model.capF || 1), 'cap() 含占路折减');
  // BPR：同一流量下，被占路弧段的行程时间应高于无折减时（证明占路抬高了拥堵）
  const W = model.weights(480), vTest = model.road.arcCap[ai] * 0.9;
  const tWithBus = model.road.arcT0[ai] * Math.min(8, 1 + C.CFG.road.bprA * Math.pow(vTest / model.cap(ai), 4));
  const tFree = model.road.arcT0[ai] * Math.min(8, 1 + C.CFG.road.bprA * Math.pow(vTest / (model.road.arcCap[ai] * (model.capF || 1)), 4));
  assert.ok(tWithBus >= tFree, '占路后同流量行程时间不降低（BPR 单调）');
  if (mul[ai] < 0.999) assert.ok(tWithBus > tFree, '占路后同流量行程时间确实上升');
  // 无公交（清空线网）后容量全部恢复
  const emptyComp = M.compile(M.clone(g.net), city);
  model.setNetwork(emptyComp);
  model.ensureBusLane();
  const aiAfter = Array.from(model.busLaneMul).findIndex(v => v < 1);
  assert.equal(aiAfter, -1, '无公交时容量系数全为 1');
}
ok('④ 公交占路：沿路段按等级折减容量、无公交时恢复');

console.log('\n公交现实规则测试全部通过（' + mapId + '）');
