// 列出底图道路：node tools/roads.mjs 湖东路 江东大道 ...
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
const kws = process.argv.slice(2);
for (const kw of kws) {
  const hit = Geo.roads.filter(r => r.name.indexOf(kw) >= 0);
  console.log('##', kw, hit.length);
  const agg = {};
  for (const r of hit) {
    const k = r.name;
    if (!agg[k]) agg[k] = { cls: r.cls, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, n: 0, pts: [] };
    const a = agg[k];
    for (let i = 0; i + 1 < r.p.length; i += 2) {
      a.x0 = Math.min(a.x0, r.p[i]); a.x1 = Math.max(a.x1, r.p[i]);
      a.y0 = Math.min(a.y0, r.p[i + 1]); a.y1 = Math.max(a.y1, r.p[i + 1]);
      a.pts.push([r.p[i], r.p[i + 1]]);
    }
    a.n++;
  }
  for (const [k, a] of Object.entries(agg).slice(0, 8)) {
    console.log('   ', k, 'cls', a.cls, 'x', a.x0.toFixed(1), '~', a.x1.toFixed(1), 'y', a.y0.toFixed(1), '~', a.y1.toFixed(1), 'seg', a.n, 'pts', a.pts.length);
  }
}
