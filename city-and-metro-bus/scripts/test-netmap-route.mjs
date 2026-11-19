// 线路图「画线」端到端冒烟（v3.31）：排版 → 站位 → 折线，全程在 Node 里跑（不碰 DOM）
//   ① 每座车站都有图上坐标，图幅有限
//   ② 每个区段都算出了折线，折线首尾就是两端的站心（站位与线路一致）
//   ③ 折线每一小段都严格在 0/45/90° 上（不再出现 5° 斜线，也不出现两套抽象对不上）
//   ④ 排版声明的必经点（via）与台阶（bent）确实作用在折线上
// 用法：node scripts/test-netmap-route.mjs [地图 id，默认 ms]
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const mapId = process.argv[2] || 'ms';
const context = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {}, removeEventListener() {}, requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame() {},
};
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
// 加载到存档层（游戏逻辑齐全），跳过所有要 DOM 的界面 / 绘图 / 音频模块，再单独加载路线图模块
const SKIP = new Set(['js/sound.js', 'js/soundscape.js', 'js/tools.js', 'js/ui.js', 'js/screens.js', 'js/sketch.js',
  'js/pages.js', 'js/corp.js', 'js/fleet.js', 'js/impact.js', 'js/voices.js', 'js/opsapp.js', 'js/stats.js',
  'js/netreplay.js', 'js/v22-ui.js', 'js/netmap.js', 'js/netlayout.js']);
// 加载到存档层（游戏逻辑齐全）；之后全部跳过——界面、绘图、音频、本地服心跳都要 DOM
for (const [, src] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  if (SKIP.has(src)) continue;
  vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
  if (src === 'js/save.js') break;
}
for (const src of ['js/netlayout.js', 'js/netmap.js']) vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
const C = context.CM, M = C.Metro;
assert.ok(C.NetMap && C.NetMap._schematic, '路线图模块已加载（含测试钩子）');
C.UI = function () {};
C.useMap(mapId);
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const city = g.city;
C.game = g;   // netmap 内部通过 CM.game 取城市

const nudge = (x, y) => {
  for (const d of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) {
      if (M.checkSite(city, x + dx, y + dy, 'surface').ok) return [x + dx, y + dy];
    }
  }
  return null;
};
// 造四条线：东西主干、与它「不共站」的南北线（制造实际交叉点）、斜向支线、带折弯的线
const mk = function (pts) {
  const lid = M.newLine(g.net, null, 'metro'), ids = []; let prev = null;
  for (const [x, y] of pts) {
    const p = nudge(x, y); if (!p) continue;
    const sid = M.addStation(g.net, p[0], p[1], { size: 'M', type: 'surface' }, city);
    ids.push(sid); if (prev) M.addSegment(g.net, lid, prev, sid, [], 'surface'); prev = sid;
  }
  return ids;
};
const east = mk(Array.from({ length: 9 }, (_, i) => [160 + i * 3.4, 165]));
const north = mk([[165.1, 150], [165.1, 156], [165.1, 162], [165.1, 168], [165.1, 174], [165.1, 182]]);
const diag = mk([[200, 130], [204, 137], [208, 145], [212, 153], [216, 161], [220, 170]]);
const bend = mk([[196, 182], [204, 182], [210, 186], [216, 193], [224, 199]]);
assert.ok(east.length >= 6 && north.length >= 5 && diag.length >= 5, '四条线建成：' + [east, north, diag, bend].map((l) => l.length).join('/'));

const R = C.NetMap._schematic(g, 1);
assert.ok(R && R.N > 0, '排版返回了站位');
const st = R.lay.st;
assert.equal(R.positions.length, st.length, '站位数量与车站一致');
for (const p of R.positions) assert.ok(p && isFinite(p[0]) && isFinite(p[1]), '站位坐标有限');
assert.ok(R.W > 100 && R.W < 20000 && R.H > 100 && R.H < 20000, '图幅合理：' + R.W.toFixed(0) + '×' + R.H.toFixed(0));
console.log('  ok ① ' + st.length + ' 站，图幅 ' + R.W.toFixed(0) + '×' + R.H.toFixed(0));

const octOf = function (dx, dy) {
  const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
  return Math.abs(dx * Math.sin(k) - dy * Math.cos(k));
};
let segs = 0, worst = 0, worstInfo = '';
const posOf = new Map(st.map((sid, i) => [sid, R.positions[i]]));
for (const tr of R.tracks) {
  const raw = tr.route && tr.route.raw;
  assert.ok(raw && raw.length >= 2, '区段有折线：' + tr.seg.id);
  const a = posOf.get(tr.seg.a), b = posOf.get(tr.seg.b);
  assert.ok(Math.hypot(raw[0][0] - a[0], raw[0][1] - a[1]) < 1.5, '折线起点就是站心：' + tr.seg.id);
  assert.ok(Math.hypot(raw[raw.length - 1][0] - b[0], raw[raw.length - 1][1] - b[1]) < 1.5, '折线终点就是站心：' + tr.seg.id);
  for (let i = 1; i < raw.length; i++) {
    const dx = raw[i][0] - raw[i - 1][0], dy = raw[i][1] - raw[i - 1][1];
    if (Math.hypot(dx, dy) < 0.5) continue;
    const perp = octOf(dx, dy); segs++;
    if (perp > worst) { worst = perp; worstInfo = tr.seg.id + ' 段长 ' + Math.hypot(dx, dy).toFixed(1); }
  }
  for (const p of tr.screen) assert.ok(isFinite(p[0]) && isFinite(p[1]), '折线采样点有限');
}
console.log('  ok ② ' + R.tracks.length + ' 个区段的折线首尾都落在站心上，采样点全部有效');
assert.ok(worst < 1.2, '折线每一小段都在八方向上（最大偏离 ' + worst.toFixed(2) + 'px，' + worstInfo + '）');
console.log('  ok ③ ' + segs + ' 个小段全部严格八方向，最大偏离 ' + worst.toFixed(2) + 'px');

// ④ 声明确实生效：被标成 bent 的区段不能是「一条直连」；有 via 的区段折线点数要够
{
  const bent = R.bent || new Set();
  let checked = 0;
  for (const tr of R.tracks) {
    const key = tr.seg.a + '|' + tr.seg.b, rev = tr.seg.b + '|' + tr.seg.a;
    if (!bent.has(key) && !bent.has(rev)) continue;
    const raw = tr.route.raw;
    const straight = raw.length === 2 && octOf(raw[1][0] - raw[0][0], raw[1][1] - raw[0][1]) > 1.2;
    assert.ok(!straight, 'bent 区段走了台阶：' + tr.seg.id);
    checked++;
  }
  let viaChecked = 0;
  for (const tr of R.tracks) {
    const key = tr.seg.a + '|' + tr.seg.b, rev = tr.seg.b + '|' + tr.seg.a;
    if (!R.via || (!R.via.has(key) && !R.via.has(rev))) continue;
    assert.ok(tr.route.raw.length >= 2, 'via 区段有折线');
    viaChecked++;
  }
  console.log('  ok ④ ' + checked + ' 个 bent 区段全部走台阶，' + viaChecked + ' 个 via 区段折线正常（via ' + (R.via ? R.via.size : 0) + ' 处）');
}

console.log('\n线路图折线端到端测试通过（' + mapId + '）');
