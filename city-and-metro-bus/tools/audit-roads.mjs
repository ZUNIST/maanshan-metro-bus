// 全图路网体检：统计穿水路段、悬空端点、超短碎段，并列出问题热点（格坐标）。
// 用法：node tools/audit-roads.mjs [地图 id ...]   默认 ms hx
// 说明：只读，不改任何数据；结果用来定位需要修的路段。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/city-and-metro-bus/';
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['ms', 'hx'];

const ctx = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout, addEventListener() {},
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const [, src] of (await readFile(root + 'index.html', 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(root + src, 'utf8'), ctx, { filename: src });
  if (src === 'js/save.js') break;
}
const CM = ctx.CM, G = CM.Geo, LU = CM.LU;

for (const id of maps) {
  CM.useMap(id);
  G.init();
  const city = CM.Game.create({ mode: 'free', seed: 20270101 }).city;
  const isW = (x, y) => { const k = city.cellAt(x, y); return k >= 0 && city.lu[k] === LU.WATER; };
  const ways = city.roadWays || [];
  let wetWays = 0, wetSegs = 0, segs = 0, shortSegs = 0, ends = 0, floating = 0;
  const hot = new Map();   // 4 格网格 → 问题计数
  const bump = (x, y) => { const k = Math.floor(x / 8) + ',' + Math.floor(y / 8); hot.set(k, (hot.get(k) || 0) + 1); };

  // 端点空间网格（0.5 格）
  const CELL = 0.5, grid = new Map(), gk = (i, j) => i + ',' + j;
  for (const w of ways) {
    const p = w.p;
    for (const e of [0, p.length - 2]) {
      const x = p[e], y = p[e + 1], k = gk(Math.floor(x / CELL), Math.floor(y / CELL));
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push({ x, y, w });
    }
  }
  const nearAny = (e) => {
    const i0 = Math.floor(e.x / CELL), j0 = Math.floor(e.y / CELL);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = grid.get(gk(i0 + di, j0 + dj)); if (!a) continue;
      for (const o of a) if (o.w !== e.w && Math.hypot(o.x - e.x, o.y - e.y) < 0.3) return true;
    }
    return false;
  };
  const endsList = [];
  for (const w of ways) {
    const p = w.p; let wet = 0;
    for (let q = 0; q + 3 < p.length; q += 2) {
      segs++;
      const mx = (p[q] + p[q + 2]) / 2, my = (p[q + 1] + p[q + 3]) / 2;
      if (isW(mx, my)) { wet++; wetSegs++; bump(mx, my); }
      const len = Math.hypot(p[q + 2] - p[q], p[q + 3] - p[q + 1]);
      if (len < 0.15) shortSegs++;
    }
    if (wet) wetWays++;
    for (const e of [0, p.length - 2]) { ends++; endsList.push({ x: p[e], y: p[e + 1], w }); }
  }
  for (const e of endsList) if (!nearAny(e)) { floating++; bump(e.x, e.y); }
  const top = [...hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => { const [i, j] = k.split(',').map(Number); return `${i * 8}-${i * 8 + 8},${j * 8}-${j * 8 + 8}:${v}`; });
  console.log(JSON.stringify({
    map: id, ways: ways.length, segs, wetWays, wetSegs,
    wetPct: +(100 * wetSegs / segs).toFixed(2),
    floating, floatingPct: +(100 * floating / ends).toFixed(1),
    shortSegs, shortPct: +(100 * shortSegs / segs).toFixed(1),
    hot: top,
  }));
}
