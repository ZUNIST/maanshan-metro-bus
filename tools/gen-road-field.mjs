// 生成马鞍山 2000 剧本的「道路位置年代场」。
// 思路：现状路网密度高的地方，2000 年多半已是城区或县城；密度低的外围，硬化路要等
// 「村村通」（2006 起）与新区开发之后。再叠加到城镇点的距离，保证县城核心不被推后。
// city.js 在没有名称、或名称没有考据年份时用它，替代原来「整片随片区开放年份一起出现」的兜底。
//
// 用法：node tools/gen-road-field.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/maanshan-metro-repo/city-and-metro-bus';
const DATA = ROOT + '/js/data_ms.js';
const src = readFileSync(DATA, 'utf8');

const vm = await import('node:vm');
const ctx = { CM: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(ROOT + '/js/geo_ms.js', 'utf8'), ctx, { filename: 'geo_ms.js' });
const G = ctx.CM.GEOS.ms, roads = G.roads || [];
const places = G.places || [];
const towns = places.filter(p => p[3] <= 1).map(p => ({ x: p[1], y: p[2] }));   // 城镇点

const B = 2, W = 416, H = 328, BW = W / B, BH = H / B;
const BLOCK_KM2 = (B * 0.25) * (B * 0.25);   // 2 格 = 0.5 km，块面积 0.25 km²

function decode(s) {
  const pts = []; let x = 0, y = 0, i = 0;
  const next = () => { let u = 0, sh = 0; for (;;) { const c = s.charCodeAt(i++) - 63; u |= (c & 31) << sh; if (c < 32) break; sh += 5; } return (u & 1) ? ~(u >> 1) : (u >> 1); };
  while (i < s.length) { x += next(); y += next(); pts.push([x / 64, y / 64]); }
  return pts;
}

// ---- 每块现状道路里程 ----
const km = new Float32Array(BW * BH);
for (const r of roads) {
  const pts = decode(r[3]);
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
    const segLen = Math.hypot(bx - ax, by - ay);
    if (!segLen) continue;
    // 按 0.5 格步长采样，长度均摊到经过的块：整段记到中点会让长段所在块密度虚高
    const step = 0.5, n = Math.max(1, Math.ceil(segLen / step)), dl = segLen / n;
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n;
      const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
      const ex = Math.min(BW - 1, Math.max(0, Math.floor(mx / B))), ey = Math.min(BH - 1, Math.max(0, Math.floor(my / B)));
      km[ey * BW + ex] += dl * 0.25;
    }
  }
}

let sumKm = 0; for (const v of km) sumKm += v;
const densArr = Array.from(km, v => v / BLOCK_KM2).sort((a, b) => a - b);
const pct = q => densArr[Math.floor(densArr.length * q)].toFixed(2);
console.log('块内总里程 ' + sumKm.toFixed(0) + ' km（应≈20713），密度分位 p50=' + pct(0.5) + ' p75=' + pct(0.75) + ' p90=' + pct(0.9) + ' p99=' + pct(0.99));

// ---- 分档（km / km²）----
// 阈值按当前密度的分位数定（p50≈1.4、p75≈3.6、p90≈6.7 km/km²）：
// 2000 年只留最密的成熟街区，2002 一档接县城外围，2010 覆盖乡镇，2016 之后是村村通
const DENS = [
  [6.5, 1995],
  [3.6, 2002],
  [1.8, 2010],
  [0.6, 2016],
  [-1, 2022],
];
const YEARS = [1995, 2002, 2010, 2016, 2022];

function yearOf(bx, by) {
  const dens = km[by * BW + bx] / BLOCK_KM2;
  const cx = bx * B + B / 2, cy = by * B + B / 2;
  let d = Infinity;
  for (const t of towns) { const v = Math.hypot(cx - t.x, cy - t.y); if (v < d) d = v; }
  // 城镇点 1.5 km 内且已有基本路网：按 1995 处理（县城核心不因密度略低被推后）
  if (d <= 6 && dens >= 0.8) return 1995;
  for (const [lim, yr] of DENS) if (dens >= lim) return yr;
  return 2022;
}

const cells = new Uint8Array(BW * BH);
const hist = {};
for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) cells[by * BW + bx] = YEARS.indexOf(yearOf(bx, by));
for (const v of cells) hist[YEARS[v]] = (hist[YEARS[v]] || 0) + 1;
console.log(`栅格 ${BW}×${BH}，分档块数：`, hist);

const enc = Array.from(cells, v => String.fromCharCode(48 + v)).join('');
const snippet =
`    // 道路位置年代场（v3.77）：按现状路网密度推断每条道路的出现年份，2 格（500 m）一块。
    // city.js 只在「没有名称」或「名称没有考据年份」时用它，考据过的 roadYears 仍然优先。
    roadYearField: { b: ${B}, w: ${BW}, h: ${BH}, years: [${YEARS.join(', ')}], data: '${enc}' },\n`;

if (process.argv.includes('--write')) {
  let out;
  if (src.includes('roadYearField:')) {
    const s = src.indexOf('    // 道路位置年代场');
    const e = src.indexOf('\n', src.indexOf("data: '", s)) + 1;
    out = src.slice(0, s) + snippet + src.slice(e);
    console.log('已替换现有字段');
  } else {
    const i = src.indexOf('    roadYearShots: {');
    if (i < 0) throw new Error('找不到 roadYearShots 插入点');
    out = src.slice(0, i) + snippet + src.slice(i);
    console.log('已插入字段');
  }
  writeFileSync(DATA, out);
  console.log('写入 data_ms.js，' + (out.length - src.length) + ' 字符');
} else {
  console.log('（预览，未写入；加 --write 写入）');
}
