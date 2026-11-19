// 从生成的 geo_ms.js 中提取指定地名的格坐标（places / 水面 / 公园），供手写地标使用
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const src = await readFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/city-and-metro/js/geo_ms.js', 'utf8');
const CM = {};
vm.runInNewContext(src, { window: { CM } });
const G = CM.GEOS.ms;
const P = G.proj;
const toLL = (x, y) => [P.lat0 - y / P.ky, P.lon0 + x / P.kx];
const names = G.names;

// 解码折线，取外包框中心
function dec(str, from = 0) {
  const out = []; let i = from, x = 0, y = 0;
  while (i < str.length) {
    let r = 0, sh = 0, b;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    x += (r & 1) ? ~(r >> 1) : (r >> 1);
    r = 0; sh = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    y += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push(x / 64, y / 64);
  }
  return out;
}
const center = (p) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } return [(x0 + x1) / 2, (y0 + y1) / 2, +(x1 - x0).toFixed(2), +(y1 - y0).toFixed(2)]; };

const want = process.argv.slice(2);
const hit = new Set(want);
const rows = [];
const push = (kind, name, c) => { if (!name || (hit.size && !hit.has(name))) return; const ll = toLL(c[0], c[1]); rows.push(`${kind}\t${name}\t格(${c[0].toFixed(1)},${c[1].toFixed(1)})\t尺寸 ${c[2]}×${c[3]}\t${ll[0].toFixed(4)}, ${ll[1].toFixed(4)}`); };
for (const r of G.water) {
  if (typeof r[1] === 'number') { const p = dec(r[2]); push('水线', names[r[0]], center(p)); continue; }
  const p = dec(r[1], 1); push('水面', names[r[0]], center(p));
}
for (const r of G.parks) push('公园', names[r[0]], center(dec(r[1], 1)));
for (const r of G.woods) push('林地', names[r[0]], center(dec(r[1], 1)));
for (const r of G.reserves) push('保护区', names[r[0]], center(dec(r[1], 1)));
for (const r of G.admin) { const rings = r.slice(2); if (!rings.length) continue; push('界线' + r[0], names[r[1]], center(dec(rings[0], 1))); }
for (const p of G.places) push('地名', p[0], [p[1], p[2], 0, 0]);
console.log(rows.join('\n'));
console.log('--- 总数', rows.length);
