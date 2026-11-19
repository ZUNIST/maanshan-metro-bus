// 铁路折线探查：node tools/rail-line.mjs 合杭高速线 [x y]
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
const kw = process.argv[2];
const qx = Number(process.argv[3]), qy = Number(process.argv[4]);
const rows = Geo.rail.filter(r => r.name.indexOf(kw) >= 0);
console.log('##', kw, rows.length, 'segs');
let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, best = 1e9, bp = null;
for (const r of rows) {
  for (let i = 0; i + 1 < r.p.length; i += 2) {
    const x = r.p[i], y = r.p[i + 1];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (!isNaN(qx)) { const d = Math.hypot(x - qx, y - qy); if (d < best) { best = d; bp = [x, y]; } }
  }
}
console.log('bbox x', x0.toFixed(1), '~', x1.toFixed(1), 'y', y0.toFixed(1), '~', y1.toFixed(1));
if (bp) console.log('nearest to', qx, qy, '=', bp, 'dist', best.toFixed(2));
// 打印最长的一段的前 24 个点，便于看走向
rows.sort((a, b) => b.p.length - a.p.length);
const r0 = rows[0];
const pts = [];
for (let i = 0; i + 1 < r0.p.length; i += 2) pts.push([+r0.p[i].toFixed(1), +r0.p[i + 1].toFixed(1)]);
console.log('longest seg pts', pts.length);
console.log(JSON.stringify(pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 30)) === 0)));
