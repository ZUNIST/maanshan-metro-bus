// 公交版 v3.29 专项测试：几何、命名、站点服务人流量、车型现实数据
//   ① 公交不设转弯半径限制（地铁/电车不变）
//   ② 自动命名「公交N路」，与地铁/电车分开，旧存档「公交N号线」不重号
//   ③ 站点服务人流量按现实与游戏内运力重校
//   ④ 公交车型定员 / 购价 / 运营费 / 寿命按现实重做
// 用法：node scripts/test-bus-v329.mjs [地图 id，默认 ms]
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
const C = context.CM, M = C.Metro, CFG = C.CFG, B = CFG.bus;
C.UI = function () {};
// fleet.js 排在 save.js 之后，加载循环已 break，这里补载（与 test-bus.mjs 一致）
const fleetSrc = await readFile(new URL('js/fleet.js', root), 'utf8');
vm.runInContext(fleetSrc, context, { filename: 'js/fleet.js' });
const F = C.Fleet;
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

// 造一条简单的地面公交线，返回 net / lid / 站点 id
function busLine(sys, grade) {
  const net = M.clone(g.net), lid = M.newLine(net, null, sys || 'bus');
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

// ---- ① 公交不设转弯半径限制 ----
{
  assert.ok(B.minRadiusM <= 6 && B.warnRadiusM <= 8, '公交半径阈值只是极小的几何下限：' + B.minRadiusM + '/' + B.warnRadiusM);
  assert.equal(M.minRadius({ sys: 'bus' }), B.minRadiusM, 'M.minRadius 取公交配置');
  assert.equal(M.warnRadius({ sys: 'bus' }), B.warnRadiusM, 'M.warnRadius 取公交配置');
  assert.equal(M.minRadius({ sys: 'tram' }), CFG.tram.minRadiusM, '电车半径不变（25 m）');
  assert.equal(M.minRadius({ speed: 80 }), 250, '地铁 80 km/h 半径不变（250 m）');

  // 对照实验：把两套半径阈值都临时调到极大（任何真实弯道都「过急」）。
  // 地铁应按常规校验报 radius 冲突；公交因 evaluate 里显式跳过，仍应 0 冲突。
  const savedBus = B.minRadiusM, savedWarn = B.warnRadiusM;
  const savedMinR = CFG.metro.speedGrades.map(function (x) { return x.minR; });
  const { net } = busLine('bus', 'B1');
  try {
    B.minRadiusM = 100000; B.warnRadiusM = 100000;
    CFG.metro.speedGrades.forEach(function (x) { x.minR = 100000; });
    const evBus = M.evaluate(net, g.net, city, year);
    assert.equal(evBus.conflicts.filter(function (c) { return c.type === 'radius'; }).length, 0,
      '公交即使半径阈值调到 100000 m 也不报弯道冲突（已跳过校验）');
    const mnet = M.clone(net);
    for (const k in mnet.lines) mnet.lines[k].sys = 'metro';
    const evMetro = M.evaluate(mnet, g.net, city, year);
    assert.ok(evMetro.conflicts.some(function (c) { return c.type === 'radius'; }),
      '对照：同线位地铁在同样阈值下会报「弯道过急」（证明阈值确实生效）');
  } finally {
    B.minRadiusM = savedBus; B.warnRadiusM = savedWarn;
    CFG.metro.speedGrades.forEach(function (x, i) { x.minR = savedMinR[i]; });
  }
}
ok('① 无转弯半径限制：公交跳过弯道冲突与限速，地铁/电车规则不变');

// ---- ② 自动命名「公交N路」 ----
{
  const net = M.clone(g.net);
  const b1 = M.newLine(net, null, 'bus'), b2 = M.newLine(net, null, 'bus'), b3 = M.newLine(net, null, 'bus');
  const t1 = M.newLine(net, null, 'tram'), m1 = M.newLine(net, null, 'metro');
  assert.equal(net.lines[b1].name, '公交1路', '第一条公交线：公交1路');
  assert.equal(net.lines[b2].name, '公交2路', '第二条公交线：公交2路');
  assert.equal(net.lines[b3].name, '公交3路', '第三条公交线：公交3路');
  assert.equal(net.lines[t1].name, '有轨1号线', '电车仍是「有轨N号线」，不与公交混排');
  assert.match(net.lines[m1].name, /^\d+ 号线$/, '地铁仍是「N 号线」');
  assert.equal(M.lineNumberFor(net, 'bus'), 4, '公交序列已占用 1/2/3，下一号为 4');
  assert.equal(M.lineNumberFor(net, 'tram'), 2, '电车序列独立，下一号为 2');
  // 徽标可用且不把「路」当成轨道的「号线」
  assert.ok(M.lineBadge({ name: '公交1路', num: 1 }), '公交新名的线路徽标可生成');
  // 旧存档兼容：把一条线改回首发版的名字，不应造成重号
  net.lines[b1].name = '公交1号线';
  assert.equal(M.lineNumberFor(net, 'bus'), 4, '旧存档「公交1号线」仍被识别为 1 号，不与新名重号');
  const b4 = M.newLine(net, null, 'bus');
  assert.equal(net.lines[b4].name, '公交4路', '含旧名存档时新线顺延为「公交4路」');
}
ok('② 自动命名：公交N路独立编号，兼容旧存档「公交N号线」');

// ---- ③ 站点服务人流量 ----
{
  assert.equal(B.stationCap.S, 400, '公交小型站 400 人/h（v3.30 按现实再收紧）');
  assert.equal(B.stationCap.M, 1000, '公交中型站 1000 人/h（v3.30 按现实再收紧）');
  assert.ok(B.stationCap.S < CFG.tram.stationCap.S && B.stationCap.M < CFG.tram.stationCap.M, '公交站容小于电车站');
  assert.ok(B.stationCap.M < CFG.metro.stationCap.S, '公交站容远小于地铁站');
  // 与游戏内运力自洽：fMax × 单车定员 = 断面运力，单站集散应为其 10–20% 量级
  const sectionCap = B.fMax * B.grades[0].carCap;
  assert.ok(B.stationCap.S < sectionCap && B.stationCap.M < sectionCap * 1.2,
    '站容与单线断面运力 ' + sectionCap + ' 人/h 同量级');
  // stationCapOf 真正按公交取值
  const { net, ids } = busLine('bus', 'B1');
  const sM = M.stationCapOf(net, net.stations[ids[3]]);
  assert.equal(sM, 1000, 'M 型纯公交站返回 1000');
  net.stations[ids[3]].size = 'S';
  const sS = M.stationCapOf(net, net.stations[ids[3]]);
  assert.equal(sS, 400, 'S 型纯公交站返回 400');
  // 接入地铁后按地铁站台能力（证明不是全局改小）
  const lidM = M.newLine(net, '对照地铁', 'metro');
  const far = nudge(net.stations[ids[3]].x + 1.2, net.stations[ids[3]].y);
  if (far) {
    const sa = M.addStation(net, far[0], far[1], { size: 'S', type: 'surface' }, city);
    M.addSegment(net, lidM, sa, ids[3], [], 'surface');
    assert.equal(M.stationCapOf(net, net.stations[ids[3]]), CFG.metro.stationCap.S, '含地铁的站仍按地铁站台能力');
  }
}
ok('③ 站点服务人流量：400/1000 人/h，与线路运力自洽且明显小于轨道站');

// ---- ④ 公交车型现实数据 ----
{
  const ids = ['bus-early', 'bus-standard', 'bus-ac', 'bus-electric', 'bus-artic', 'bus-brt'];
  const mdl = ids.map(function (id) { const m = F.model(id); assert.ok(m, '车型存在：' + id); return m; });
  for (const m of mdl) {
    assert.ok(m.bus === true, m.id + ' 标记为公交');
    assert.equal(F.sysOfModel(m), 'bus', m.id + ' sysOfModel 识别公交');
    assert.ok(m.life >= 8 && m.life <= 10, m.id + ' 寿命 8–10 年（现实营运公交）：' + m.life);
    assert.equal(m.max, 1, m.id + ' 公交不编组');
  }
  const by = {}; for (const m of mdl) by[m.id] = m;
  // 定员按车长现实化
  assert.ok(by['bus-early'].cap < by['bus-standard'].cap, '早期车定员小于 10 米单机');
  assert.ok(by['bus-standard'].cap < by['bus-electric'].cap, '10 米柴油 < 12 米纯电');
  assert.ok(by['bus-electric'].cap <= by['bus-ac'].cap, '纯电因电池占重不高于同级空调车');
  assert.ok(by['bus-ac'].cap < by['bus-artic'].cap && by['bus-artic'].cap < by['bus-brt'].cap, '12 米 < 18 米铰接 < BRT');
  assert.ok(by['bus-brt'].cap >= 150, '18 米 BRT 定员 ≥150 人（现实 150–200）');
  // 购价梯度符合真实中标价（18 米车明显贵于 12 米纯电）
  const priceOrder = ['bus-early', 'bus-standard', 'bus-ac', 'bus-electric', 'bus-artic', 'bus-brt'];
  for (let i = 1; i < priceOrder.length; i++) {
    assert.ok(by[priceOrder[i]].price > by[priceOrder[i - 1]].price,
      priceOrder[i] + ' 购价高于 ' + priceOrder[i - 1] + '（现实价格梯度）');
  }
  assert.ok(by['bus-brt'].price < F.model('gen-steel').price, 'BRT 车购价仍低于地铁 B 型车量级');
  // 运营费：纯电最省、老旧车最贵、空调车高于普通柴油车
  const minOps = Math.min(...mdl.map(function (m) { return m.ops; }));
  const maxOps = Math.max(...mdl.map(function (m) { return m.ops; }));
  assert.equal(by['bus-electric'].ops, minOps, '纯电运营成本系数最低（能耗降 40–85%）');
  assert.equal(by['bus-early'].ops, maxOps, '早期老车运营成本系数最高');
  assert.ok(by['bus-ac'].ops > by['bus-standard'].ops, '空调车单公里运营费高于普通柴油车');
  assert.ok(by['bus-artic'].ops > by['bus-electric'].ops, '18 米大车单公里成本高于 12 米纯电（人均更低靠 cap）');
  // 最高速度：后期车型都能跑满 30 km/h 档（车型改动不能卡死速度解锁）
  for (const m of mdl) if (m.id !== 'bus-early') assert.ok(m.kmh >= 30, m.id + ' 可跑 30 km/h 档');
  assert.equal(by['bus-early'].kmh, 20, '早期车仅 20 km/h（年代限制）');
  assert.equal(F.speedOpen(mapId, 2000, 30, 'bus').ok, true, '2000 年剧本 30 km/h 档仍可用');
  assert.equal(F.speedOpen(mapId, 2027, 30, 'bus').ok, true, '2027 年 30 km/h 档可用');
  // 线路等级的典型定员与车型同量级（名义运力 rt.cap 不能还是旧值）
  const caps = B.grades.map(function (x) { return x.carCap; });
  assert.equal(caps.join(','), '70,95,150', '三档典型定员 70/95/150，与车型对齐');
  assert.equal(M.carCapOf({ sys: 'bus', grade: 'B1' }), 70, 'B1 名义运力按新定员');
  assert.equal(M.carCapOf({ sys: 'bus', grade: 'B3' }), 150, 'B3 名义运力按新定员');
  assert.ok(caps[0] >= by['bus-standard'].cap - 5 && caps[2] <= by['bus-brt'].cap + 5, '名义运力与车型定员同量级');
  // 购车界面必须按制式筛选：此前漏传 sys，公交线打开「购买列车」只会列出地铁车型、且选不到任何编组
  const busAvail = F.available(mapId, year, 'bus');
  assert.ok(busAvail.length >= 4, '2027 年可买到多款公交车型：' + busAvail.length);
  assert.ok(busAvail.every(function (x) { return x.bus === true; }), 'F.available(sys=bus) 只返回公交车型');
  assert.ok(!F.available(mapId, year).some(function (x) { return x.bus; }), '不传 sys 时默认只列地铁车型');
  assert.match(fleetSrc, /F\.available\(g\.mapId,\s*y,\s*sys\)/, '购车界面按线路制式筛选车型（不再漏传 sys）');
  assert.match(fleetSrc, /const baseOpts = bus \? \[1\]/, '公交编组只有 1 辆（不再写死 4/6/8 节）');
}
ok('④ 车型数据：定员/购价/运营费/寿命按现实重做，购车界面可买到公交车型');

console.log('\n公交版 v3.29 专项测试全部通过（' + mapId + '）');
