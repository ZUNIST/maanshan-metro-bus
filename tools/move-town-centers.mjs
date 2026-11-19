// 把还留在旧（错误）锚点上的镇区整体搬到高德核对后的真实镇区位置。
// 只处理"搬迁后完全没格"的镇：西埠（原在腰埠）、年陡、丹阳、博望。
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const DATA = ROOT + '/city-and-metro/js/data_ms.js';
const DRY = process.env.DRY === '1';

// 旧锚点 -> 新锚点（新值取自高德镇政府 POI），以及要搬运的旧范围 / 新区块半径
const MOVES = [
  { name: '西埠镇', from: [152.5, 148.5], to: [178.4, 132.3], oldBox: [147, 159, 142, 155], r: 3.2, cells: 20 },
  { name: '年陡镇', from: [252.6, 284.5], to: [242.9, 279.8], oldBox: [247, 259, 279, 291], r: 3.0, cells: 16 },
  { name: '丹阳镇', from: [329.8, 204.1], to: [344.5, 195.9], oldBox: [324, 336, 199, 210], r: 3.0, cells: 15 },
  { name: '博望镇', from: [388.9, 216.3], to: [391.3, 224.4], oldBox: [383, 395, 211, 222], r: 3.0, cells: 20 },
];

const src = await readFile(DATA, 'utf8');
const m = src.match(/\ncenters: \[\n([\s\S]*?)\n    \],\n/);
if (!m) throw new Error('找不到 centers 段');
let rows = [...m[1].matchAll(/^\s*\{ x: ([\d.]+), y: ([\d.]+), pop: (\d+), jobs: (\d+), r: ([\d.]+) \},$/gm)]
  .map(x => ({ x: +x[1], y: +x[2], pop: +x[3], jobs: +x[4], r: +x[5] }));
const before = rows.length;

const TW = JSON.parse(src.match(/const TOWN_W = (\[\[[\s\S]*?\]\]);/)[1]);
const afOf = (c) => {
  let a = 0.5;
  if (c.x >= 235 && c.x <= 315 && c.y >= 135 && c.y <= 210) a = 1.5;
  else if (c.x >= 245 && c.x <= 277 && c.y >= 210 && c.y <= 238) a = 1.0;
  else if (c.x >= 366 && c.x <= 402 && c.y >= 202 && c.y <= 242) a = 0.9;
  else if (c.x >= 190 && c.x <= 216 && c.y >= 140 && c.y <= 168) a = 0.9;
  else if (c.x >= 94 && c.x <= 114 && c.y >= 140 && c.y <= 168) a = 0.9;
  return a;
};
const coefOf = (x, y) => {
  let bd = 1e9, w = 1;
  for (const t of TW) { const q = Math.hypot(x - t[0], y - t[1]); if (q < bd) { bd = q; w = t[2]; } }
  const f = bd <= 3 ? 1 : bd <= 8 ? 0.6 : 0.28;
  return f * w * afOf({ x, y });
};

const has = (x, y) => rows.some(c => Math.abs(c.x - x) < 0.6 && Math.abs(c.y - y) < 0.6);

for (const mv of MOVES) {
  const [ox0, ox1, oy0, oy1] = mv.oldBox;
  const removed = rows.filter(c => c.x >= ox0 && c.x <= ox1 && c.y >= oy0 && c.y <= oy1);
  const popSum = removed.reduce((s, c) => s + c.pop, 0);
  const jobSum = removed.reduce((s, c) => s + c.jobs, 0);
  rows = rows.filter(c => !(c.x >= ox0 && c.x <= ox1 && c.y >= oy0 && c.y <= oy1));

  const [tx, ty] = mv.to;
  const k = coefOf(tx, ty);
  const perCell = Math.round((2800 / (k || 0.3)) * 1.15);   // 保证过建成区阈值
  const picked = [];
  for (let dj = -4; dj <= 4 && picked.length < mv.cells; dj++) {
    for (let di = -4; di <= 4 && picked.length < mv.cells; di++) {
      if (di * di + dj * dj > mv.r * mv.r) continue;
      const gx = Math.round(tx) + di, gy = Math.round(ty) + dj;
      if (has(gx + 0.5, gy + 0.5)) continue;
      picked.push([gx + 0.5, gy + 0.5, di, dj]);
    }
  }
  for (const [x, y, di, dj] of picked) {
    const d = Math.hypot(di, dj);
    const wt = d < 1.2 ? 1 : d < 2.2 ? 0.78 : 0.58;          // 中心密、边缘疏
    rows.push({ x, y, pop: Math.round(perCell * 0.82 * wt), jobs: Math.round(perCell * 0.18 * wt), r: 0.09 });
  }
  console.log(`${mv.name}: 移除 ${removed.length} 格(pop ${popSum}) -> 新位置 ${picked.length} 格，每格基准 ${perCell}`);
}

console.log(`centers: ${before} -> ${rows.length}`);
const fmt = v => Number.isInteger(v) ? String(v) : String(+v.toFixed(1));
const lines = ['centers: [',
  ...rows.sort((a, b) => a.y - b.y || a.x - b.x).map(c => `      { x: ${fmt(c.x)}, y: ${fmt(c.y)}, pop: ${c.pop}, jobs: ${c.jobs}, r: ${c.r} },`),
  '    ],'].join('\n');
if (DRY) console.log('[DRY RUN] 未写入');
else { await writeFile(DATA, src.replace(m[0], '\n' + lines + '\n'), 'utf8'); console.log('已写入'); }
