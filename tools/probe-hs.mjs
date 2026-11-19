// 探查含山县各镇在本图内的覆盖范围
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('city-and-metro-bus/js/geo_hx.js', 'utf8');
const CM = { GEOS: {} };
vm.runInNewContext(src, { CM, console, window: { CM } });
const G = CM.GEOS.hx;
const W = 232, H = 288;

function dec(s, from) {
  const out = []; let i = from || 0, x = 0, y = 0;
  while (i < s.length) {
    let r = 0, sh = 0, b;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    x += (r & 1) ? ~(r >> 1) : (r >> 1);
    r = 0; sh = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    y += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push(x / 64, y / 64);
  }
  return out;
}

const targets = ['环峰镇','清溪镇','陶厂镇','林头镇','运漕镇','仙踪镇','昭关镇','铜闸镇','含山县','护河镇', '石桥镇', '黄池镇', '乌溪镇', '塘南镇', '大陇镇', '湖阳镇', '姑孰镇', '太白镇', '年陡镇', '江心乡'];
const rows = [];
for (const raw of G.admin) {
  const name = G.names[raw[1]] || '';
  if (targets.indexOf(name) < 0) continue;
  const rings = [];
  for (let k = 2; k < raw.length; k++) rings.push(dec(raw[k], 1));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of rings) for (let k = 0; k < p.length; k += 2) {
    x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]);
    y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]);
  }
  const cellIn = (px, py) => {
    let inside = false;
    for (const p of rings) {
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  };
  let inCells = 0;
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) if (cellIn(cx + 0.5, cy + 0.5)) inCells++;
  rows.push({ name, level: raw[0], bbox: [x0, y0, x1, y1].map(v => +v.toFixed(1)), inCells });
}
for (const r of rows.sort((a, b) => b.inCells - a.inCells)) console.log(r.name.padEnd(6), 'L' + r.level, 'bbox', r.bbox.join(','), 'inMapCells', r.inCells);
