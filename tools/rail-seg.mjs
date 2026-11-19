// 检查某条铁路在图内的分段 flags 与范围：node tools/rail-seg.mjs 合杭高速线 220 260
import fs from 'node:fs/promises'; import vm from 'node:vm';
const root = new URL('file:///C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/city-and-metro-bus/'), mem = new Map();
const c = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  setInterval: () => 0, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
c.window = c; vm.createContext(c);
const load = async f => vm.runInContext(await fs.readFile(new URL(f, root), 'utf8'), c, { filename: f });
const scripts = [...(await fs.readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const f of scripts) { await load(f); if (f === 'js/save.js') break; }
const C = c.CM; C.UI = function () {};
C.useMap('hx27');
const Geo = C.Geo.init();
const kw = process.argv[2], y0 = Number(process.argv[3] || -1e9), y1 = Number(process.argv[4] || 1e9);
const rows = Geo.rail.filter(r => r.name.indexOf(kw) >= 0);
console.log(kw, rows.length, 'segs; D.hsrYear =', C.DATA.hsrYear);
for (const r of rows) {
  let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9, n = 0;
  const pts = [];
  for (let i = 0; i + 1 < r.p.length; i += 2) {
    const x = r.p[i], y = r.p[i + 1];
    xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y); n++;
    if (pts.length < 4) pts.push([+x.toFixed(1), +y.toFixed(1)]);
  }
  const mid = (ya + yb) / 2;
  if (mid < y0 || mid > y1) continue;
  console.log('flags', r.flags, 'year', r.year, 'n', n, 'x', xa.toFixed(1), '~', xb.toFixed(1), 'y', ya.toFixed(1), '~', yb.toFixed(1), 'head', JSON.stringify(pts));
}
