// 让每个镇区/园区都至少能过建成区判定阈值 (pop+jobs)*f*w*af > 2600。
// 只提升不足的格，不动已经达标的格；人口与岗位按原有比例分配（园区偏向岗位）。
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const DATA = ROOT + '/city-and-metro/js/data_ms.js';
const DRY = process.env.DRY === '1';
const TARGET = 2800;   // 略高于 2600 的阈值，留余量

const src = await readFile(DATA, 'utf8');
const m = src.match(/\ncenters: \[\n([\s\S]*?)\n    \],\n/);
if (!m) throw new Error('找不到 centers 段');
const rows = [...m[1].matchAll(/^\s*\{ x: ([\d.]+), y: ([\d.]+), pop: (\d+), jobs: (\d+), r: ([\d.]+) \},$/gm)]
  .map(x => ({ x: +x[1], y: +x[2], pop: +x[3], jobs: +x[4], r: +x[5] }));
const TW = JSON.parse(src.match(/const TOWN_W = (\[\[[\s\S]*?\]\]);/)[1]);

// 与 city.js 完全一致的权重逻辑
const afOf = (c) => {
  let a = 0.5;
  if (c.x >= 235 && c.x <= 315 && c.y >= 135 && c.y <= 210) a = 1.5;
  else if (c.x >= 245 && c.x <= 277 && c.y >= 210 && c.y <= 238) a = 1.0;
  else if (c.x >= 366 && c.x <= 402 && c.y >= 202 && c.y <= 242) a = 0.9;
  else if (c.x >= 190 && c.x <= 216 && c.y >= 140 && c.y <= 168) a = 0.9;
  else if (c.x >= 94 && c.x <= 114 && c.y >= 140 && c.y <= 168) a = 0.9;
  return a;
};
const coefOf = (c) => {
  let bd = 1e9, w = 1;
  for (const t of TW) { const q = Math.hypot(c.x - t[0], c.y - t[1]); if (q < bd) { bd = q; w = t[2]; } }
  const f = bd <= 3 ? 1 : bd <= 8 ? 0.6 : 0.28;
  return f * w * afOf(c);
};

// 园区锚点（判据同上，但补的是岗位）
const INDUSTRIAL = [[197.0, 186.5], [206.5, 141.0], [244.0, 106.5]];

const before = rows.reduce((s, c) => s + c.pop, 0);
let raised = 0, addPop = 0;
const touched = new Set();

for (const t of TW) {
  for (const c of rows) {
    const d = Math.hypot(c.x - t[0], c.y - t[1]);
    if (d > 3.6) continue;
    const k = coefOf(c);
    if (!k) continue;
    const cur = (c.pop + c.jobs) * k;
    if (cur >= TARGET) continue;
    const need = TARGET / k;                       // 需要的原始总量
    const ratio = need / Math.max(1, c.pop + c.jobs);
    const key = c.x + ',' + c.y;
    if (touched.has(key)) continue;
    touched.add(key);
    const isInd = INDUSTRIAL.some(([ix, iy]) => Math.hypot(c.x - ix, c.y - iy) < 3.6);
    const pShare = isInd ? 0.28 : 0.82;           // 园区以岗位为主
    const tot = Math.round(need * 1.02);
    c.pop = Math.round(tot * pShare);
    c.jobs = Math.round(tot * (1 - pShare));
    raised++; addPop += c.pop + c.jobs;
    const _ = ratio;
  }
}

const after = rows.reduce((s, c) => s + c.pop, 0);
console.log(`提升 ${raised} 格；原始总量 ${before} -> ${after}（+${after - before}，${((after / before - 1) * 100).toFixed(1)}%）`);

const fmt = v => Number.isInteger(v) ? String(v) : String(+v.toFixed(1));
const lines = ['centers: [',
  ...rows.sort((a, b) => a.y - b.y || a.x - b.x).map(c => `      { x: ${fmt(c.x)}, y: ${fmt(c.y)}, pop: ${c.pop}, jobs: ${c.jobs}, r: ${c.r} },`),
  '    ],'].join('\n');
const out = src.replace(m[0], '\n' + lines + '\n');
if (DRY) console.log('[DRY RUN] 未写入');
else { await writeFile(DATA, out, 'utf8'); console.log('已写入 data_ms.js'); }
