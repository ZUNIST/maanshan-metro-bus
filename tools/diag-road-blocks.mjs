// 分析：按 4 格（1 km）块统计 OSM 2013 / 2018 / 当前快照的道路覆盖，为「位置年代场」定标
import { readFile } from 'node:fs/promises';

const CACHE = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache';
const BBOX = { s: 31.325, w: 117.835, n: 32.070, e: 118.900 };
const W = 416, H = 328, B = 4;                 // 块 4 格 = 1 km
const BW = W / B, BH = H / B;
const KX = W / (BBOX.e - BBOX.w), KY = H / (BBOX.n - BBOX.s);
const toCell = (lat, lon) => [(lon - BBOX.w) * KX, (BBOX.n - lat) * KY];

const load = async f => JSON.parse(await readFile(`${CACHE}/${f}.json`, 'utf8')).elements;

function blockHits(elements) {
  const km = new Float32Array(BW * BH);
  for (const e of elements) {
    if (!e.geometry || e.geometry.length < 2) continue;
    const t = e.tags || {};
    if (!t.highway) continue;
    let prev = null;
    for (const g of e.geometry) {
      const [x, y] = toCell(g.lat, g.lon);
      if (prev) {
        const bx = Math.min(BW - 1, Math.max(0, Math.floor(x / B))), by = Math.min(BH - 1, Math.max(0, Math.floor(y / B)));
        const px = Math.min(BW - 1, Math.max(0, Math.floor(prev[0] / B))), py = Math.min(BH - 1, Math.max(0, Math.floor(prev[1] / B)));
        const d = Math.hypot(x - prev[0], y - prev[1]) * 0.25;
        if (bx === px && by === py) km[by * BW + bx] += d;
        else { km[by * BW + bx] += d / 2; km[py * BW + px] += d / 2; }
      }
      prev = [x, y];
    }
  }
  return km;
}

const [r13, r18, cur] = await Promise.all([load('roads2013'), load('roads2018'), load('roads')]);
console.log('ways: 2013=' + r13.length + ' 2018=' + r18.length + ' now=' + cur.length);
const b13 = blockHits(r13), b18 = blockHits(r18), bNow = blockHits(cur);

let n13 = 0, n18 = 0, nNew = 0, nNone = 0, km13 = 0, km18 = 0, kmNew = 0;
for (let i = 0; i < BW * BH; i++) {
  if (b13[i] > 0.05) { n13++; km13 += bNow[i]; }
  else if (b18[i] > 0.05) { n18++; km18 += bNow[i]; }
  else if (bNow[i] > 0.05) { nNew++; kmNew += bNow[i]; }
  else nNone++;
}
const total = km13 + km18 + kmNew;
console.log(`块 ${BW}×${BH} = ${BW * BH}`);
console.log(`2013 已有路: ${n13} 块, 当前里程 ${km13.toFixed(0)} km (${(km13 / total * 100).toFixed(0)}%)`);
console.log(`2018 才有路: ${n18} 块, 当前里程 ${km18.toFixed(0)} km (${(km18 / total * 100).toFixed(0)}%)`);
console.log(`2018 后才有路: ${nNew} 块, 当前里程 ${kmNew.toFixed(0)} km (${(kmNew / total * 100).toFixed(0)}%)`);
console.log(`无路块: ${nNone}`);

// 城区核心（人口密集的 2000 年片区）在 2013 快照里覆盖率如何
console.log('\n2013 快照每块平均里程（前 10 密集块）:');
const idx = [...bNow.keys()].sort((a, b) => bNow[b] - bNow[a]).slice(0, 10);
for (const i of idx) console.log(`  块(${i % BW},${Math.floor(i / BW)}) 现在 ${bNow[i].toFixed(1)} km, 2013 ${b13[i].toFixed(1)} km, 2018 ${b18[i].toFixed(1)} km`);
