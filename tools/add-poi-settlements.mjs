// 用高德 POI 补「OSM 没标到的聚落」：当涂、博望的 OSM 自然村只有个位数，
// 但高德在两地有 1300+ 个 POI。把远离现有建成区的聚落型 POI 聚类成低密度中心，
// 让这些区域的空白地带有零星建筑（人口仍保持很低，只为视觉密度）。
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const DATA = ROOT + '/city-and-metro/js/data_ms.js';
const DRY = process.env.DRY === '1';

const src = await readFile(DATA, 'utf8');
const m = src.match(/\ncenters: \[\n([\s\S]*?)\n    \],\n/);
if (!m) throw new Error('找不到 centers 段');
let rows = [...m[1].matchAll(/^\s*\{ x: ([\d.]+), y: ([\d.]+), pop: (\d+), jobs: (\d+), r: ([\d.]+) \},$/gm)]
  .map(x => ({ x: +x[1], y: +x[2], pop: +x[3], jobs: +x[4], r: +x[5] }));
const before = rows.length;

const amap = JSON.parse(await readFile(ROOT + '/tools/amap-places.json', 'utf8'));

// 建成格集合
const built = new Set(rows.map(c => Math.floor(c.x) + ',' + Math.floor(c.y)));
const nearBuilt = (x, y, r) => {
  const gx = Math.floor(x), gy = Math.floor(y);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (built.has((gx + di) + ',' + (gy + dj))) return true;
  }
  return false;
};

// 只补「聚落型」POI：住宅小区、学校、村委会、卫生院、小卖部这类出现在村子里的设施。
// 商业、机关、交通枢纽不参与（它们要么在城里，要么不是聚落标志）
const SETTLE_G = new Set(['home', 'gov', 'edu', 'scenic', 'trans']);
const SKIP_NAME = /超市|便利店|加油站|充电站|停车场|收费站|服务区|公交|车站|营业厅|公司|厂|银行|ATM|公厕|卫生室$|诊所|药店/;

// 750 m 网格去重（3 格），每格只留一个点；同一格按「先到先得」，避免小区内部多点堆叠
const bucket = new Set();
const added = [];
for (const p of amap.pois) {
  if (!SETTLE_G.has(p.g)) continue;
  if (SKIP_NAME.test(p.n)) continue;
  if (p.x < 0 || p.x > 416 || p.y < 0 || p.y > 328) continue;
  // 含山不补：OSM 在该县已有 843 个自然村核，密度本就高于其他区，再叠加会过密
  if (p.x >= 15 && p.x <= 148 && p.y >= 90 && p.y <= 305) continue;
  if (nearBuilt(p.x, p.y, 2)) continue;
  const bk = Math.floor(p.x / 3) + '|' + Math.floor(p.y / 3);
  if (bucket.has(bk)) continue;
  bucket.add(bk);
  added.push(p);
}

// 写入：低密度聚落（归一化后约 20~35 人/格，会画出零星房屋，低于外扩阈值 100 人/格）
for (const p of added) {
  const gx = Math.floor(p.x), gy = Math.floor(p.y);
  rows.push({ x: gx + 0.5, y: gy + 0.5, pop: 720, jobs: 95, r: 0.09 });
}

console.log(`高德 POI 聚落：新增 ${added.length} 个点（centers ${before} -> ${rows.length}）`);
const byZone = {};
const Z = [['含山', 20, 145, 95, 300], ['和县', 145, 235, 30, 275], ['主城', 235, 320, 130, 215], ['当涂', 235, 330, 215, 330], ['博望', 330, 420, 180, 330]];
for (const p of added) {
  for (const [n, x0, x1, y0, y1] of Z) { if (p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1) { byZone[n] = (byZone[n] || 0) + 1; break; } }
}
console.log('分布:', JSON.stringify(byZone));

const fmt = v => Number.isInteger(v) ? String(v) : String(+v.toFixed(1));
const lines = ['centers: [',
  ...rows.sort((a, b) => a.y - b.y || a.x - b.x).map(c => `      { x: ${fmt(c.x)}, y: ${fmt(c.y)}, pop: ${c.pop}, jobs: ${c.jobs}, r: ${c.r} },`),
  '    ],'].join('\n');
if (DRY) console.log('[DRY RUN] 未写入');
else { await writeFile(DATA, src.replace(m[0], '\n' + lines + '\n'), 'utf8'); console.log('已写入 data_ms.js'); }
