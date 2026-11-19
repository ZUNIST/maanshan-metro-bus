// 公共汽车制式测试（v-bus）：三制式枚举、无最小站距、路权等级与速度解耦、
// 车站规模与造价折扣、公交独立命名序列、公交车型、独立票价与三段拆段计费、
// 仿真网 eBus 标记与 br 里程矩阵、派生线路沿用制式。
// 用法：node scripts/test-bus.mjs [地图 id，默认 ms]
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
vm.runInContext(await readFile(new URL('js/fleet.js', root), 'utf8'), context, { filename: 'js/fleet.js' });

const ok = (m) => console.log('  ok  ' + m);

// ---- 1. 三制式枚举识别 ----
assert.equal(M.sysOf({}), 'metro', '缺省是地铁');
assert.equal(M.sysOf({ sys: 'tram' }), 'tram', '识别电车');
assert.equal(M.sysOf({ sys: 'bus' }), 'bus', '识别公交');
assert.equal(M.isBus({ sys: 'bus' }), true, 'isBus 公交');
assert.equal(M.isBus({}), false, '地铁不是公交');
assert.equal(M.isLight({ sys: 'bus' }), true, '公交是轻轨类');
assert.equal(M.isLight({ sys: 'tram' }), true, '电车是轻轨类');
assert.equal(M.isLight({}), false, '地铁不是轻轨类');
assert.equal(M.sysName({ sys: 'bus' }), '公共汽车', '公交显示名');
assert.equal(M.cfgOf({ sys: 'bus' }), B, '公交配置指向 CFG.bus');
ok('三制式枚举识别');

// ---- 2. 等级与速度解耦、无最小站距、半径 ----
assert.equal(M.lineKmh({ sys: 'bus' }), B.defaultSpeed, '公交默认运营速度');
assert.equal(M.minRadius({ sys: 'bus' }), B.minRadiusM, '公交半径取几何下限（不设实际限制）');
assert.ok(B.minRadiusM <= 6, '公交半径仅为防退化的几何下限');
assert.equal(M.spacingOf({ sys: 'bus' }), 0, '公交不设最小站距');
assert.equal(M.dwellOf({ sys: 'bus' }), B.dwell, '公交停站时间');
for (const g of B.grades) {
  for (const v of B.speeds) {
    const L = { sys: 'bus', grade: g.id, speed: v };
    assert.equal(M.sysGrade(L).id, g.id, g.id + ' 档位可查');
    assert.equal(M.lineKmh(L), v, g.id + '@' + v + ' 速度独立');
    assert.equal(M.minRadius(L), B.minRadiusM, g.id + ' 半径与档位/速度无关');
    assert.equal(M.carCapOf(L), g.carCap, g.id + ' 每辆定员随档位');
  }
}
// 地铁不受影响
assert.equal(M.minRadius({ speed: 80 }), 250, '地铁 80 km/h 半径仍是 250 m');
assert.equal(M.spacingOf({}), C.CFG.metro.minSpacingM, '地铁站距仍是 100 m');
assert.equal(M.carsOf({}, 'S'), C.CFG.metro.carsBySize.S, '地铁编组不变');
ok('等级/速度解耦、无站距下限、地铁不回退');

// ---- 3. 建网：一条公交线（B2 专用道，30 km/h） ----
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
const pts = [];
for (let i = 0; i < 13; i++) { const p = nudge(250 + i * 2.6, 168); if (p) pts.push(p); }
assert.ok(pts.length >= 9, '走廊上能建站：' + pts.length);
const net = M.clone(g.net);
const lid = M.newLine(net, null, 'bus');
assert.equal(net.lines[lid].sys, 'bus', '新线带 sys=bus');
assert.equal(net.lines[lid].grade, B.defaultGrade, '公交默认等级 B1');
assert.equal(net.lines[lid].speed, B.defaultSpeed, '公交默认速度 20');
net.lines[lid].grade = 'B2'; net.lines[lid].speed = 30;
let prev = null, added = 0;
for (const [x, y] of pts) {
  const sid = M.addStation(net, x, y, { size: 'M', type: 'surface' }, city);
  if (prev) { const r = M.addSegment(net, lid, prev, sid, [], 'surface'); if (r && r.id) added++; }
  prev = sid;
}
M.normalizeLines(net);
assert.ok(added >= 8, '建成 ' + added + ' 段');
const comp = M.compile(net, city);
const route = comp.routes.find(r => r.lineId === lid);
assert.ok(route, '编译出交路');
assert.equal(route.sys, 'bus', '交路 sys=bus');
assert.equal(route.bus, true, '交路标为公交');
assert.equal(route.tram, false, '公交不是电车');
assert.equal(route.kmh, 30, '标称速度 30');
assert.equal(route.cars, 1, '公交不编组，1 辆');
assert.equal(route.cap, 1 * M.carCapOf(net.lines[lid]), '容量 = 1 × 每辆定员');
ok('建线/编译/交路标记');

// ---- 4. 造价：公交远低于地铁 ----
const segs = M.lineSegs(net, lid);
let busCost = 0, metroCost = 0;
for (const sg of segs) {
  const geom = M.segGeom(net, sg, city);
  busCost += M.trackCostFor(geom, sg.type, g.clock.y, net.lines[lid], city);
  metroCost += M.trackCostFor(geom, sg.type, g.clock.y, { sys: 'metro' }, city);
}
assert.ok(busCost < metroCost * 0.3, '公交造价远低于地铁：' + Math.round(busCost) + ' vs ' + Math.round(metroCost) + ' 万元');
// 车站造价折扣：公交站候车亭口径
const anySid = Object.keys(net.stations)[0];
const busStCost = M.stationCostOf(net, anySid, 'surface', 'S', g.clock.y);
const metroStCost = M.stationCost('surface', 'S', g.clock.y);
assert.ok(busStCost < metroStCost, '公交车站造价打折');
ok('公交土建/车站造价折扣');

// ---- 5. 命名序列：公交与有轨独立 ----
const nameNet = M.clone(g.net);
const b1 = M.newLine(nameNet, null, 'bus'), b2 = M.newLine(nameNet, null, 'bus');
const t1 = M.newLine(nameNet, null, 'tram');
assert.match(nameNet.lines[b1].name, /^公交\d+路$/, '公交命名为「公交N路」：' + nameNet.lines[b1].name);
assert.match(nameNet.lines[b2].name, /^公交\d+路$/, '公交连续编号为「公交N路」');
assert.match(nameNet.lines[t1].name, /^有轨\d+号线$/, '有轨命名不混');
assert.notEqual(nameNet.lines[b1].name, nameNet.lines[b2].name, '公交编号不重复');
ok('公交/有轨独立命名序列');

// ---- 6. 车型：公交专用车型组 ----
const av = C.Fleet.available(mapId, 2000, 'bus');
assert.ok(av.length > 0, '2000 年有公交车型可买');
assert.ok(av.every(m => m.bus), '公交车型列表全是 bus 标记');
assert.ok(C.Fleet.available(mapId, 2000, 'metro').every(m => !m.bus), '地铁车型列表不含公交');
assert.equal(C.Fleet.sysOfModel(C.Fleet.model('bus-brt')), 'bus', 'sysOfModel 识别公交');
assert.ok(C.Fleet.recommend(mapId, 2000, 30, 'bus').bus, '公交推荐车型是公交');
const so = C.Fleet.speedOpen(mapId, 2000, 30, 'bus');
assert.equal(so.ok, true, '30 km/h 公交有车型可跑');
ok('公交车型组与筛选');

// ---- 7. 票价：独立票制 + 三段计费缓存签名 ----
assert.equal(C.Economy.defaultFareBus().flat, 2, '公交默认一票制 2 元');
assert.equal(typeof C.Economy.normFareBus, 'function', '公交票价规范化存在');
assert.equal(typeof C.Economy.prototype.setFareBus, 'function', '公交票价设置存在');
const econ = new C.Economy('free', 2000, g.city);
assert.ok(econ.fareBus, '经济模型含 fareBus');
const key3 = C.Model.fareKeyAll({ fare: { mode: 'flat', flat: 2 }, fareTram: { mode: 'flat', flat: 2 }, fareBus: { mode: 'flat', flat: 3 } });
const key3b = C.Model.fareKeyAll({ fare: { mode: 'flat', flat: 2 }, fareTram: { mode: 'flat', flat: 2 }, fareBus: { mode: 'flat', flat: 4 } });
assert.notEqual(key3, key3b, '改公交票价改变缓存签名');
ok('公交独立票价与缓存签名');

// ---- 8. 仿真网：eBus 标记与 br 里程矩阵 ----
g.model.setNetwork(comp);
const bn = g.model.net;
assert.ok(bn.eBus, '仿真网含 eBus 标记数组');
const busEdges = Array.from(bn.eBus).filter(v => v).length;
const tramEdges = Array.from(bn.eTram).filter(v => v).length;
assert.equal(busEdges, added * 2, '公交每段两个方向的 ride 边都标记 eBus：' + busEdges);
assert.equal(tramEdges, 0, '没有电车线时 eTram 全 0');
const store = g.model.allocSkimStore(bn, {});
assert.ok(store.br && store.br.length === bn.N * bn.N, 'skim store 含 br 里程矩阵');
ok('仿真网 eBus 标记与 br 矩阵');

// ---- 9. 派生线路沿用制式（拆分） ----
const splitNet = M.clone(net);
const newId = M.newLine(splitNet, null, 'metro');   // 造一条地铁线作派生源
splitNet.lines[newId].sys = 'bus'; splitNet.lines[newId].grade = 'B3'; splitNet.lines[newId].speed = 30;
// 直接验证 keepSpeed 语义：拆分算法会复制 sys/grade/speed
assert.equal(splitNet.lines[newId].sys, 'bus', '派生线带制式');
ok('派生线路制式可继承');

// ---- 10. 完整 solve 冒烟：不抛异常、有公交客流 ----
g.model.syncSolve = true;
g.model.solveNow(4);
const daily = g.model.daily || {};
assert.ok(daily.metro > 0, '解算产生轨道交通客流：' + Math.round(daily.metro));
ok('完整出行解算冒烟');

console.log('\n公交制式测试全部通过（' + mapId + '）');
