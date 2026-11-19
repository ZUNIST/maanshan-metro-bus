// 线路示意图排版几何回归（v3.31）：位置不漂、长度不膨胀、八方向合规
//   ① 排版可复现：同一线网两次求解结果完全一致
//   ② 尺寸闸：排版包围盒对角线不超过地理等比投影的 1.15 倍（「长度太长」的主因）
//   ③ 站距：中位区段长度贴近地理等比；线网总长不膨胀；没有超长单段
//   ④ 八方向：直线段落在 0/45/90° 上；走廊拐点登记成画线必经点（via），站位与线路共用同一套抽象
//   ⑤ 与地理图同一尺度：netmap 的 projection 与 straighten 必须用同一个 unit（原先差 10%）
//   ⑥ 性能：150 站量级的线网排版在预算内（打开线路图时同步计算）
// 只加载 util.js（CM.U）与 netlayout.js；排版只吃 { stations } 与 { st, edges }，不需要 Game / DOM。
// 用法：node scripts/test-netlayout.mjs
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = { console, performance, TextEncoder, TextDecoder, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
for (const src of ['js/util.js', 'js/netlayout.js']) vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
const C = context.CM;
assert.ok(C.NetLayout && C.U, 'util.js / netlayout.js 已加载');
const UNIT = 96;
const bbox = function (pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return { w: x1 - x0, h: y1 - y0, diag: Math.hypot(x1 - x0, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};

// 用「折线列表」描述一张线网；同一个坐标自动视为同一个换乘站
function build(lines) {
  const stations = {}, edges = [], st = [], byPos = new Map(), idx = new Map();
  function node(x, y) {
    const key = x + ',' + y;
    if (byPos.has(key)) return idx.get(byPos.get(key));
    const id = 's' + st.length, k = st.length;
    stations[id] = { x, y }; byPos.set(key, id); idx.set(id, k); st.push(id);
    return k;
  }
  lines.forEach(function (pts, li) {
    const ids = pts.map((p) => node(p[0], p[1]));
    for (let i = 1; i < ids.length; i++) {
      if (edges.some((e) => (e.a === ids[i - 1] && e.b === ids[i]) || (e.a === ids[i] && e.b === ids[i - 1]))) continue;
      edges.push({ a: ids[i - 1], b: ids[i], geo: Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), lines: [{ lid: 'L' + li }] });
    }
  });
  return { stations, edges, st, lay: { st, edges, xEdges: [] } };
}

function check(name, built, opts) {
  opts = opts || {};
  const { stations, edges, st, lay } = built;
  const medOf = (lens) => { const s = lens.slice().sort((a, b) => a - b); return Math.max(0.5, s[s.length >> 1] || 1); };
  const med = medOf(edges.map((e) => e.geo)), scale = UNIT / med;
  const t0 = performance.now();
  const pos = C.NetLayout.solve(lay, { stations }, UNIT);
  const ms = performance.now() - t0;
  const P = st.map((sid) => pos.get(sid));
  assert.ok(P.every((p) => p && isFinite(p[0]) && isFinite(p[1])), name + '：每座车站都有有限坐标');

  const bP = bbox(P), bG = bbox(st.map((sid) => [stations[sid].x * scale, stations[sid].y * scale]));
  const viaKeys = new Set(pos.via ? pos.via.keys() : []);
  const bentKeys = new Set(pos.bent ? Array.from(pos.bent) : []);
  const has = (set, e) => { const k = st[e.a] + '|' + st[e.b]; return set.has(k) || set.has(st[e.b] + '|' + st[e.a]); };
  const isVia = (e) => has(viaKeys, e), isBent = (e) => has(bentKeys, e);
  const segs = edges.map((e) => {
    const a = P[e.a], b = P[e.b], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    return { len: len, perp: Math.abs(dx * Math.sin(k) - dy * Math.cos(k)), ratio: len / (e.geo * scale), via: isVia(e), bent: isBent(e) };
  });
  const ratios = segs.map((s) => s.ratio).sort((a, b) => a - b);
  const loose = segs.filter((s) => s.via || s.bent);      // 拐点段 / 需要走台阶的段：画线时会拐，不要求站心连线严格八方向
  const straight = segs.filter((s) => !s.via && !s.bent);
  const oct = straight.filter((s) => s.perp < 1.6).length / Math.max(1, straight.length);
  const worst = Math.max.apply(null, straight.map((s) => s.perp));
  const spread = bP.diag / bG.diag;
  const totalP = segs.reduce((s, v) => s + v.len, 0), totalG = edges.reduce((s, e) => s + e.geo * scale, 0);
  const longest = Math.max.apply(null, segs.map((s) => s.len));

  console.log('\n[' + name + '] ' + st.length + ' 站 / ' + edges.length + ' 区间（' + segs.filter((s) => s.via).length + ' 段跨拐点或交叉点）' + (opts.perf ? '  ' + ms.toFixed(0) + ' ms' : ''));
  console.log('  包围盒 ' + bP.w.toFixed(0) + '×' + bP.h.toFixed(0) + ' vs 地理等比 ' + bG.w.toFixed(0) + '×' + bG.h.toFixed(0) +
    '  对角线倍率 ' + spread.toFixed(2) + '  中心偏移 ' + Math.hypot(bP.cx - bG.cx, bP.cy - bG.cy).toFixed(0) + 'px');
  console.log('  区段长度倍率 中位 ' + ratios[ratios.length >> 1].toFixed(2) + '  最大 ' + ratios[ratios.length - 1].toFixed(2) +
    '  总长比 ' + (totalP / totalG).toFixed(2) + '  最长单段 ' + (longest / UNIT).toFixed(2) + ' 站距');
  console.log('  严格八方向段 ' + (oct * 100).toFixed(1) + '%（' + straight.length + ' 段）  最大残差 ' + worst.toFixed(2) + 'px' +
    '  需走台阶 ' + segs.filter((s) => s.bent && !s.via).length + ' 段');

  // ① 可复现
  const again = C.NetLayout.solve(lay, { stations }, UNIT);
  assert.ok(st.every((sid) => { const a = pos.get(sid), b = again.get(sid); return a[0] === b[0] && a[1] === b[1]; }), name + '：两次排版结果一致（无随机数）');
  // ② 尺寸闸
  assert.ok(spread <= 1.16, name + '：对角线不超过地理等比的 1.15 倍：' + spread.toFixed(2));
  assert.ok(Math.hypot(bP.cx - bG.cx, bP.cy - bG.cy) < UNIT * 2, name + '：中心不整体漂移');
  // ③ 站距与总长
  const mid = ratios[ratios.length >> 1];
  assert.ok(mid > 0.72 && mid < 1.35, name + '：中位区段长度贴近地理等比：' + mid.toFixed(2));
  assert.ok(totalP / totalG < 1.25, name + '：线网总长不超过地理等比的 1.25 倍：' + (totalP / totalG).toFixed(2));
  assert.ok(longest / UNIT < 2.1, name + '：没有超长单段（≤2 站距）：' + (longest / UNIT).toFixed(2));
  // ④ 八方向
  assert.ok(straight.length >= edges.length * 0.6, name + '：多数区段无需拐折：' + straight.length + '/' + edges.length);
  assert.ok(oct >= 0.95, name + '：严格八方向比例 ≥95%：' + (oct * 100).toFixed(1) + '%');
  assert.ok(worst < 3.2, name + '：未标记拐折的段残差 < 3.2px：' + worst.toFixed(2));
  assert.ok(loose.length <= edges.length * 0.4, name + '：拐折段不超过 40%：' + loose.length + '/' + edges.length);
  // 标成「需走台阶」的段，画线时不能再选直连（netmap.js octilinearOptions 的 noStraight）
  assert.ok(pos.bent && typeof pos.bent.has === 'function' && typeof pos.bent.size === 'number', name + '：solve 输出 bent 声明');
  for (const k of viaKeys) assert.ok(/^s\d+\|s\d+$/.test(k), name + '：拐点键是车站对：' + k);
  if (opts.perf) assert.ok(ms < 900, name + '：排版耗时 ' + ms.toFixed(0) + 'ms < 900ms');
  return { ms: ms };
}

// —— 线网 A：东西主干（带折弯）+ 南北向 + 斜线 + 支线 + 环线，接近真实城市 ——
check('线网 A', build([
  [[0, 0], [800, 30], [1600, 40], [2400, 60], [3200, 150], [4000, 260], [4800, 300], [5600, 320], [6400, 330]],
  [[3150, -2600], [3180, -1750], [3200, -900], [3200, -100], [3200, 150], [3230, 900], [3260, 1700], [3300, 2500]],
  [[900, -2200], [1600, -1500], [2300, -800], [2950, -180], [3900, 700], [4700, 1400], [5500, 2100]],
  [[1600, 40], [1560, 820], [1500, 1600], [1420, 2350]],
  [[3200, 150], [4100, 200], [4300, 700], [3600, 900], [3230, 900], [3200, 150]],
]));

// —— 线网 B：正交网格 + 一条对角线（换乘站密集、过约束最多，压力测试）——
const grid = [];
for (let i = 0; i < 4; i++) grid.push(Array.from({ length: 11 }, (_, j) => [j * 900, i * 900]));
for (let i = 0; i < 11; i += 2) grid.push(Array.from({ length: 4 }, (_, j) => [i * 900, j * 900]));
grid.push([[0, 0], [900, 850], [1800, 1750], [2700, 2700], [3600, 3550], [4500, 4400]]);
check('线网 B 网格', build(grid), { perf: true });

// ⑤ 两种模式同一个 unit
{
  const src = await readFile(new URL('js/netmap.js', root), 'utf8');
  assert.ok(!/UNIT \* 0\.9 \* spacing/.test(src), 'straighten 不再单独用 0.9 的尺度');
  assert.ok(/const unit = unitOf\(spacing\)/.test(src), 'projection 用统一的 unit');
  assert.ok(/solve\(lay, net, unitOf\(spacing\)\)/.test(src), 'straighten 把同一个 unit 交给排版');
  assert.ok(/pos\.via/.test(src), 'straighten 把排版给出的必经点交给画线');
  assert.ok(/base\.bent = pos\.bent/.test(src), 'straighten 把需走台阶的站间连线交给画线');
  assert.ok(/octilinearOptions\(a, b, bent\)/.test(src), '画线遵守 bent 声明、不画斜线');
}
console.log('\n  ok ⑤ 地理图与简洁图同一尺度，画线吃排版给的必经点');

console.log('\n线路示意图排版测试全部通过');
