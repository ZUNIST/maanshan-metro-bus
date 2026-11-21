// 有轨电车制式测试（v3.24）：服务等级与速度解耦、无最小站距、道口延误按里程、
// 车站规模与造价折扣、站台容量、电车与地铁不共用车站、独立票价与拆段计费。
// 用法：node scripts/test-tram.mjs [地图 id，默认 ms27]
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const mapId = process.argv[2] || 'ms27';
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
const C = context.CM, M = C.Metro, T = C.CFG.tram;
C.UI = function () {};   // fleet.js 会往 UI.prototype 上挂界面方法，先给个空壳
// 车型表在 save.js 之后加载（车队模块）：命名与车型速度的断言要用 CM.Fleet
vm.runInContext(await readFile(new URL('js/fleet.js', root), 'utf8'), context, { filename: 'js/fleet.js' });

// ---- 1. 制式识别：服务等级与速度互不影响 ----
assert.equal(M.isTram({ sys: 'tram' }), true, '识别电车');
assert.equal(M.isTram({}), false, '缺省是地铁');
assert.equal(M.lineKmh({ sys: 'tram' }), T.defaultSpeed, '电车默认运营速度');
assert.equal(M.tramGrade({ sys: 'tram' }).id, T.defaultGrade, '电车缺省服务等级');

for (const g of T.grades) {
  for (const v of T.speeds) {
    const L = { sys: 'tram', grade: g.id, speed: v };
    assert.equal(M.tramGrade(L).id, g.id, g.id + ' 档位可查');
    assert.equal(M.lineKmh(L), v, g.id + '@' + v + ' 速度独立');
    assert.equal(M.minRadius(L), T.minRadiusM, g.id + ' 半径与档位/速度无关');
    assert.equal(M.spacingOf(L), 0, g.id + ' 电车不设最小站距');
    assert.equal(M.dwellOf(L), T.dwell, g.id + ' 停站统一');
    assert.equal(M.carCapOf(L), g.carCap, g.id + ' 每节定员随档位');
  }
}
// 道口延误：每公里口数 × 每口秒数，混行最重、独立路基为零
const dly = x => x.crossPerKm * x.crossSec;
assert.ok(dly(T.grades[0]) > dly(T.grades[1]) && dly(T.grades[1]) > dly(T.grades[2]) && dly(T.grades[3]) === 0, '道口延误按档位递减');
// 地铁不受影响
assert.equal(M.minRadius({ speed: 80 }), 250, '地铁 80 km/h 半径仍是 250 m');
assert.equal(M.spacingOf({}), C.CFG.metro.minSpacingM, '地铁站距仍是 100 m');
assert.equal(M.carsOf({}, 'S'), C.CFG.metro.carsBySize.S, '地铁编组不变');

// ---- 2. 建网：一条 8 km 的电车线（T2 专用道，40 km/h） ----
C.useMap(mapId);
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const city = g.city;
const nudge = (x, y) => {
  for (const d of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) {
      if (M.checkSite(city, x + dx, y + dy, 'surface').ok) return [x + dx, y + dy];
    }
  }
  return null;
};
const corridor = (yy) => {
  const out = [];
  for (let i = 0; i < 13; i++) { const p = nudge(250 + i * 2.6, yy); if (p) out.push(p); }
  return out;
};
const lanes = [162, 165, 168, 170, 172, 175].map(yy => ({ yy, pts: corridor(yy) })).sort((a, b) => b.pts.length - a.pts.length);
const pts = lanes[0].pts;
console.log('  走廊 y=' + lanes[0].yy + '，能建站 ' + pts.length + ' 个');
assert.ok(pts.length >= 9, '走廊上能建站：' + pts.length);

const net = M.clone(g.net);
const lid = M.newLine(net, '电车 1 号线', 'tram');
net.lines[lid].grade = 'T2';
net.lines[lid].speed = 40;
let prev = null, added = 0;
for (const [x, y] of pts) {
  const sid = M.addStation(net, x, y, { size: 'S', type: 'surface' }, city);
  if (prev) { const r = M.addSegment(net, lid, prev, sid, [], 'surface'); if (r && r.id) added++; }
  prev = sid;
}
M.normalizeLines(net);
assert.ok(added >= 8, '建成 ' + added + ' 段');

const comp = M.compile(net, city);
const route = comp.routes.find(r => r.lineId === lid);
assert.ok(route, '编译出交路');
assert.equal(route.tram, true, '交路标为电车');
assert.equal(route.kmh, 40, '标称速度 40');
assert.equal(route.cars, Math.min(T.carsBySize.S, M.tramGrade(net.lines[lid]).maxCars), 'S 站编组取站台与档位的较小值');
assert.equal(route.cap, route.cars * M.tramGrade(net.lines[lid]).carCap, '容量 = 编组 × 每节定员（按档位）');

const travel = route.lenM / (route.runSec + M.dwellOf(net.lines[lid]) * route.stIds.length) * 3.6;
console.log('  电车线 ' + (route.lenM / 1000).toFixed(1) + ' km / ' + route.stIds.length + ' 站 · 站距 ' +
  Math.round(route.lenM / Math.max(1, route.stIds.length - 1)) + ' m · 标称 ' + route.kmh + ' · 旅速 ' + travel.toFixed(1) + ' km/h');
assert.ok(travel > 18 && travel < 30, '旅速落在合理区间：' + travel.toFixed(1));

// 速度与路权独立：同一条线改成 70 km/h，旅速上升，建造成本不变
const fast = M.clone(net);
fast.lines[lid].speed = 70;
const fRoute = M.compile(fast, city).routes.find(r => r.lineId === lid);
const fTravel = fRoute.lenM / (fRoute.runSec + M.dwellOf(fast.lines[lid]) * fRoute.stIds.length) * 3.6;
console.log('  同一条线改 70 km/h 旅速 ' + fTravel.toFixed(1) + ' km/h（造价不变）');
assert.ok(fTravel > travel + 2, '提高运营速度应提高旅速（站距固定时提速空间有限）');

// 路权档位改变旅速（T1 混行道口多），速度相同
const slow = M.clone(net);
slow.lines[lid].grade = 'T1';
const sRoute = M.compile(slow, city).routes.find(r => r.lineId === lid);
const sTravel = sRoute.lenM / (sRoute.runSec + M.dwellOf(slow.lines[lid]) * sRoute.stIds.length) * 3.6;
console.log('  同速度改混行（T1）旅速 ' + sTravel.toFixed(1) + ' km/h');
assert.ok(sTravel < travel, '道口更多的路权档位应更慢');

// ---- 3. 车站：造价折扣、规模限制、站台容量 ----
const ev = M.evaluate(net, g.net, city, 2027);
assert.ok(ev.conflicts.every(c => c.type !== 'tramLevel'), '电车可以走隧道');
const sid0 = route.stIds[0];   // 明确取电车线路的首站（克隆的线网里还有宁马线的车站）
const sTram = M.stationCostOf(net, sid0, 'surface', 'S', 2027);
const sMetro = M.stationCost('surface', 'S', 2027);
console.log('  车站造价：电车站 ' + (sTram / 10000).toFixed(2) + ' 亿，地铁同规模 ' + (sMetro / 10000).toFixed(2) + ' 亿');
assert.ok(sTram < sMetro * 0.5, '电车站造价应明显低于地铁站');
assert.equal(M.stationCapOf(net, net.stations[sid0]), T.stationCap.S, '纯电车站按电车站台容量');
assert.equal(M.sizeOkFor(net.lines[lid], 'S'), true, '电车可以建小型站');
assert.equal(M.sizeOkFor(net.lines[lid], 'M'), true, '电车可以建中型站');
assert.equal(M.sizeOkFor(net.lines[lid], 'L'), true, '电车可以建大型站（v3.39 起）');
assert.equal(M.sizeOkFor(net.lines[lid], 'XL'), false, '电车不能建 XL（BRT 站台是公交的）');

// 电车线路上出现 XL 站 → 冲突（超出电车允许的档位）
const big = M.clone(net);
big.stations[sid0].size = 'XL';
const evBig = M.evaluate(big, g.net, city, 2027);
assert.ok(evBig.conflicts.some(c => c.type === 'tramSize'), '超档电车站应报冲突');

// 电车与地铁共用一座车站 → 冲突
const shared = M.clone(net);
const metroSt = Object.keys(g.net.stations)[0];   // 2000 剧本开局没有地铁线：有才测
const far = metroSt ? nudge(g.net.stations[metroSt].x + 1.2, g.net.stations[metroSt].y) : null;
if (far) {
  const a1 = M.addStation(shared, far[0], far[1], { size: 'S', type: 'surface' }, city);
  const lid3 = M.newLine(shared, '共用测试', 'tram');
  M.addSegment(shared, lid3, a1, metroSt, [], 'surface');
  const evShare = M.evaluate(shared, g.net, city, 2027);
  assert.ok(evShare.conflicts.some(c => c.type === 'tramShare'), '电车与地铁共用车站应报冲突');
  console.log('  共用地铁站 → 报 tramShare 冲突');
}

// 电车允许与铁路平交（地铁不允许）
assert.ok(ev.conflicts.every(c => c.type !== 'rail'), '电车允许与地面铁路平交');

// ---- 4. 票价：独立、可调、拆段计费 ----
const econ = g.econ;
assert.ok(econ.fareTram, '电车票价存在');
assert.equal(econ.fareTram.mode, 'flat', '默认统一票价');
econ.setFareTram({ mode: 'flat', flat: 3 }, 2027, 1);
assert.equal(econ.fareTram.flat, 3, '电车票价可单独调');
assert.equal(C.Model.fareKeyAll({ fare: econ.fare, fareTram: econ.fareTram }).indexOf('|') > 0, true, '签名包含两份票价');

const apply = (fareTram) => {
  g.net = net; g.model.fare = econ.fare; g.model.fareTram = fareTram;
  g.compiled = comp; g.model.setNetwork(comp); g.model.solveNow(3);
  const n = g.model.net; let board = 0;
  const W = C.CFG.trips.weekWeights;
  for (const dt of ['wd', 'we']) {
    const res = g.model.resultsFor(dt), pH = g.model.pHours;
    for (let p = 0; p < res.per.length; p++) {
      const per = res.per[p], h = pH[p] * (p === 3 ? 0.9 : 1);
      for (let r = 0; r < n.R; r++) {
        if (n.C.routes[r].lineId !== lid) continue;
        const be = n.boardEdge[r]; let v = 0;
        for (let q = 0; q < be.length; q++) v += per.load[be[q]];
        board += v * h * (W[dt] || 0);
      }
    }
  }
  return board;
};
const cheap = apply({ mode: 'flat', flat: 2 }), pricey = apply({ mode: 'flat', flat: 6 });
console.log('  电车日上车：2 元 ' + Math.round(cheap).toLocaleString() + ' ｜ 6 元 ' + Math.round(pricey).toLocaleString());
assert.ok(cheap > 0 && cheap > pricey, '票价越高客流越少（拆段计费生效）');

// ---- 5. 自动命名：电车用「有轨N号线」独立序列，不与地铁 N 号线混 ----
const nn = M.clone(net);
const t1 = M.newLine(nn, null, 'tram'), t2 = M.newLine(nn, null, 'tram'), m1 = M.newLine(nn, null);
assert.equal(nn.lines[t1].name, '有轨1号线', '电车自动命名为有轨1号线');
assert.equal(nn.lines[t2].name, '有轨2号线', '第二条电车线为有轨2号线');
assert.match(nn.lines[m1].name, /^\d+ 号线$/, '地铁仍用 N 号线');
assert.equal(M.tramLineNumber(nn), 3, '已用 1、2 之后下一个是 3');
// 车型速度与运营速度对齐：2000 年买不到 70 km/h 的车
const F = C.Fleet;
assert.ok(F.available('ms', 2000, 'tram').every(m => m.kmh <= 60), '2000 年电车车型最高 60 km/h');
assert.equal(F.speedOpen('ms', 2000, 70, 'tram').ok, false, '2000 年选 70 km/h 应提示车型不足');
assert.equal(F.speedOpen('ms', 2027, 70, 'tram').ok, true, '2027 年有 70 km/h 的车型');
assert.ok(F.MODELS.filter(m => m.tram).length === 6, '6 款通用电车车型');

// ---- 6. 电车之间的同站规则（v3.26）：默认完全不允许，开关打开后按平面区分 ----
{
  const n2 = M.clone(net);
  const tr = M.compile(net, city).routes.find(r => r.lineId === lid);
  const share = tr && tr.stIds;
  const stx = share && share.length > 3 ? net.stations[share[3]] : null;
  assert.ok(stx, '取到一条电车线中段的车站');
  if (stx) {
    const l2 = M.newLine(n2, '有轨换乘线', 'tram');
    n2.lines[l2].grade = 'T2'; n2.lines[l2].speed = 40;
    const far = nudge(stx.x + 3, stx.y + 0.4) || [stx.x + 3, stx.y];
    const sidB = M.addStation(n2, far[0], far[1], { size: 'M', type: 'surface' }, city);
    M.addSegment(n2, l2, share[3], sidB, [], 'surface');
    M.normalizeLines(n2);

    // 默认（v3.27）：不同平面可以同站换乘，同层不行
    let ev = M.evaluate(n2, g.net, city, 2027);
    assert.ok(!ev.conflicts.some(c => c.type === 'tramShare'), '默认允许电车同站（跨层）');
    assert.ok(ev.conflicts.some(c => c.type === 'tramLevel'), '两条都在地面要拦下');
    const cv = ev.conflicts.filter(c => c.type === 'tramLevel')[0];
    assert.ok(cv.fixes.some(f => f.op === 'platType'), '给出改站台层的一键修复');
    M.setPlatform(n2, share[3], l2, 'underground');
    ev = M.evaluate(n2, g.net, city, 2027);
    assert.ok(!ev.conflicts.some(c => c.type === 'tramLevel'), '一地面一地下可以同站换乘');
    assert.equal(M.platType(n2.stations[share[3]], l2), 'underground', '站台层按线路记录');
    assert.ok(M.stationLevels(n2, share[3]).length === 2, '车站有地面与地下两层');
    // 关掉开关：完全禁止电车之间共用车站
    C.CFG.tram.sameStationTransfer = false;
    M.setPlatform(n2, share[3], l2, 'surface');
    const evOff = M.evaluate(n2, g.net, city, 2027);
    assert.ok(evOff.conflicts.some(c => c.type === 'tramShare'), '开关为 false 时完全不许共用车站');
    C.CFG.tram.sameStationTransfer = true;

    // 电车与地铁共用同一座车站仍然不允许（任何开关下）
    const n3 = M.clone(net);
    const l3 = M.newLine(n3, '测试地铁', null);
    const far2 = nudge(stx.x + 3, stx.y - 0.4) || [stx.x + 3, stx.y];
    const sidC = M.addStation(n3, far2[0], far2[1], { size: 'M', type: 'underground' }, city);
    M.addSegment(n3, l3, share[3], sidC, [], 'underground');
    M.normalizeLines(n3);
    const ev3 = M.evaluate(n3, g.net, city, 2027);
    assert.ok(ev3.conflicts.some(c => c.type === 'tramShare'), '电车与地铁仍不能同站');
  }
}

// ---- 7. 接驳半径：电车站按规模收窄（v3.26） ----
{
  const sSmall = { id: 'x1', size: 'S', type: 'surface' }, sMid = { id: 'x2', size: 'M', type: 'surface' };
  const fakeNet = { lines: { a: { id: 'a', sys: 'tram', grade: 'T2', speed: 40 }, b: { id: 'b', num: 1, name: '1 号线' } }, segments: { s1: { id: 's1', line: 'a', a: 'x1', b: 'x2' }, s2: { id: 's2', line: 'b', a: 'x2', b: 'x3' } } };
  assert.equal(M.accessMOf(fakeNet, sSmall), C.CFG.tram.accessM.S, '电车站（小）接驳半径 ' + C.CFG.tram.accessM.S + ' m');
  assert.equal(M.accessMOf(fakeNet, sMid), C.CFG.walk.maxAccessM, '有地铁线路的车站仍按地铁口径');
  assert.ok(C.CFG.tram.accessM.M > C.CFG.tram.accessM.S && C.CFG.tram.accessM.M < C.CFG.walk.maxAccessM, '中型电车站介于小型与地铁之间');
  // 编译产物里带上每站半径
  const comp = M.compile(net, city);
  assert.ok(comp.accM && comp.accM.length === comp.stations.length, '编译产物带 C.accM');
  const compNet = g.model.net;
  assert.ok(compNet && compNet.C && compNet.C.accM, '模型网络可用 accM');
}

// ---- 8. 拆分派生线路沿用制式（v3.26 修：以前拆出来会变成「地铁」） ----
{
  const ns = M.clone(net);
  const lidT = M.newLine(ns, null, 'tram');
  ns.lines[lidT].grade = 'T3'; ns.lines[lidT].speed = 50;
  const ids = []; let prev = null;
  for (let k = 0; k < 7; k++) {
    const p = nudge(252 + k * 3, 164);
    if (!p) continue;
    const sid = M.addStation(ns, p[0], p[1], { size: 'S', type: 'surface' }, city);
    ids.push(sid);
    if (prev) M.addSegment(ns, lidT, prev, sid, [], 'surface');
    prev = sid;
  }
  M.normalizeLines(ns);
  assert.ok(ids.length >= 6, '建成一条电车线：' + ids.length + ' 站');

  // ① 在中间车站拆开
  const sp = M.splitLineAt(ns, lidT, ids[Math.floor(ids.length / 2)]);
  assert.ok(sp.lines && sp.lines.length, '在中间站拆开线路');
  const nl = sp.lines[0];
  assert.equal(ns.lines[nl].sys, 'tram', '拆出来的仍是电车（不是地铁）');
  assert.equal(ns.lines[nl].grade, 'T3', '拆出来的沿用服务等级');
  assert.equal(ns.lines[nl].speed, 50, '拆出来的沿用运营速度');
  assert.match(ns.lines[nl].name, /^有轨\d+号线$/, '按电车规则命名：' + ns.lines[nl].name);

  // ② 拆除中间一段导致断开 → normalizeLines 自动拆分，也要保持电车
  const ns2 = M.clone(net);
  const l2 = M.newLine(ns2, null, 'tram'); ns2.lines[l2].grade = 'T1'; ns2.lines[l2].speed = 40;
  const ids2 = []; let pv = null;
  for (let k = 0; k < 6; k++) {
    const p = nudge(252 + k * 3, 172);
    if (!p) continue;
    const sid = M.addStation(ns2, p[0], p[1], { size: 'S', type: 'surface' }, city);
    ids2.push(sid);
    if (pv) M.addSegment(ns2, l2, pv, sid, [], 'surface');
    pv = sid;
  }
  M.normalizeLines(ns2);
  const mid = Object.values(ns2.segments).find(s => s.line === l2 && ids2.indexOf(s.a) > 0 && ids2.indexOf(s.b) > 0 && ids2.indexOf(s.a) < ids2.length - 1 && ids2.indexOf(s.b) < ids2.length - 1);
  assert.ok(mid, '找到中间区段');
  const before = new Set(Object.keys(ns2.lines));
  delete ns2.segments[mid.id];
  M.normalizeLines(ns2);
  const added = Object.keys(ns2.lines).filter(k => !before.has(k));
  assert.ok(added.length >= 1, '拆除后自动拆出新线路');
  assert.ok(added.every(k => ns2.lines[k].sys === 'tram'), '自动拆出的仍是电车，不是地铁');
  assert.ok(added.every(k => ns2.lines[k].grade === 'T1'), '拆出的线保留服务等级');
  assert.equal(ns2.lines[l2].sys, 'tram', '原线仍是电车');
}

console.log('PASS 有轨电车：档位与速度解耦/无站距/道口算法/车站造价与规模/容量/不共用车站/票价/命名/车型速度/跨层换乘/接驳半径');
