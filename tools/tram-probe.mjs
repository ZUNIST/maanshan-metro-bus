// 数值验证：用现有引擎近似有轨电车（40 km/h 档 · 地面 · S 站台），对比不同走廊的客流与旅速。
// 目的：确认 T2 档能否达到现实的 1–2.5 万人次/日，以及走廊选址的影响有多大。
// 用法：node tools/tram-probe.mjs
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'city-and-metro');
const context = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
context.window = context; vm.createContext(context);
for (const [, src] of (await readFile(path.join(root, 'index.html'), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(path.join(root, src), 'utf8'), context, { filename: src });
  if (src === 'js/save.js') break;
}
const C = context.CM, M = C.Metro;
C.UI = function () {}; C.useMap('ms27');
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const city = g.city, baseNet = g.net, W = C.CFG.trips.weekWeights;

const settle = () => { g.model.setNetwork(g.compiled); g.model.solveNow(3); };
const boardOf = (lid) => {
  const net = g.model.net; let out = 0;
  for (const dt of ['wd', 'we']) {
    const res = g.model.resultsFor(dt), pH = g.model.pHours;
    for (let p = 0; p < res.per.length; p++) {
      const per = res.per[p], h = pH[p] * (p === 3 ? 0.9 : 1);
      for (let r = 0; r < net.R; r++) {
        if (net.C.routes[r].lineId !== lid) continue;
        const be = net.boardEdge[r]; let v = 0;
        for (let q = 0; q < be.length; q++) v += per.load[be[q]];
        out += v * h * (W[dt] || 0);
      }
    }
  }
  return out;
};

// 站点微调：不可建时在 ±1 格内找一个能站的点
function nudge(x, y) {
  if (M.checkSite(city, x, y, 'surface').ok) return [x, y];
  for (const d of [0.5, -0.5, 1, -1, 1.5, -1.5]) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) {
      if (M.checkSite(city, x + dx, y + dy, 'surface').ok) return [x + dx, y + dy];
    }
  }
  return null;
}

function run(label, pts, speed, size) {
  const n = M.clone(baseNet);
  const lid = M.newLine(n, label);
  n.lines[lid].speed = speed; n.lines[lid].color = '#c2456f';
  let prev = null;
  for (const [x, y] of pts) {
    const sid = M.addStation(n, x, y, { size, type: 'surface' }, city);
    if (prev) M.addSegment(n, lid, prev, sid, [], 'surface');
    prev = sid;
  }
  M.normalizeLines(n);
  g.net = n; g.compiled = M.compile(n, city); settle();
  const board = boardOf(lid), d = g.model.daily;
  let lenM = 0, runSec = 0, st = 0;
  for (const rt of g.compiled.routes) if (rt.lineId === lid) { lenM = Math.max(lenM, rt.lenM); runSec = Math.max(runSec, rt.runSec); st = Math.max(st, rt.stIds.length); }
  const travel = lenM / (runSec + 25 * st) * 3.6;   // 含 25 s 停站
  return { board, lenM, st, travel, metro: d.metro, share: d.metroShare };
}

const corridor = (x0, y0, x1, y1, n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), p = nudge(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    if (!p) return null;
    out.push(p);
  }
  return out;
};

g.net = M.clone(baseNet); g.compiled = M.compile(g.net, city); settle();
const d0 = g.model.daily;
console.log('基线：全网地铁 ' + Math.round(d0.metro).toLocaleString() + ' 人次/日 ｜ 小汽车 ' + (d0.car / 10000).toFixed(0) + ' 万 ｜ 分担率 ' + (d0.metroShare * 100).toFixed(2) + '%');

const CASES = [
  ['市区东西向 · 穿花山老城（与宁马线换乘）', corridor(250, 168, 282, 168, 13)],
  ['当涂县城 · 沿 205 国道走廊', corridor(248, 225, 270, 225, 13)],
  ['秀山新区空地（对照）', corridor(272, 158, 304, 158, 13)],
];

for (const [label, pts] of CASES) {
  if (!pts) { console.log('\n' + label + '：走廊无法布线，跳过'); continue; }
  const tram = run('电车', pts, 40, 'S');
  const metro = run('地铁', pts, 80, 'M');
  const lenKm = tram.lenM / 1000;
  console.log('\n' + label);
  console.log('  ' + lenKm.toFixed(1) + ' km · ' + tram.st + ' 站 · 站距 ' + Math.round(tram.lenM / Math.max(1, tram.st - 1)) + ' m');
  console.log('  电车版  日上车 ' + Math.round(tram.board).toLocaleString().padStart(7) +
    ' ｜旅速 ' + tram.travel.toFixed(1) + ' km/h ｜强度 ' + (tram.board / 10000 / lenKm).toFixed(2) + ' 万/km·日 ｜全网 ' + Math.round(tram.metro).toLocaleString());
  console.log('  地铁版  日上车 ' + Math.round(metro.board).toLocaleString().padStart(7) +
    ' ｜旅速 ' + metro.travel.toFixed(1) + ' km/h ｜强度 ' + (metro.board / 10000 / lenKm).toFixed(2) + ' 万/km·日 ｜全网 ' + Math.round(metro.metro).toLocaleString());
}
console.log('\n现实参照：客流强度 0.03–0.6 万人次/km·日；单线 0.3–2.5 万人次/日');
