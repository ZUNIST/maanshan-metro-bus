// 打印某条道路在 y 区间内的点（x,y 逐点）：node tools/road-pts.mjs 江东大道南段 180 220
import fs from 'node:fs/promises'; import vm from 'node:vm';
const root = new URL('file:///C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/city-and-metro-bus/'), mem = new Map();
const c = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  setInterval: () => 0, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
c.window = c; vm.createContext(c);
const load = async f => vm.runInContext(await fs.readFile(new URL(f, root), 'utf8'), c, { filename: f });
const scripts = [...(await fs.readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const f of scripts) { await load(f); if (f === 'js/save.js') break; }
const C = c.MM = c.CM; C.UI = function () {};
C.useMap('hx27');
const Geo = C.Geo.init();
const name = process.argv[2], y0 = Number(process.argv[3] || -1e9), y1 = Number(process.argv[4] || 1e9);
const rows = Geo.roads.filter(r => r.name === name);
const pts = [];
for (const r of rows) for (let i = 0; i + 1 < r.p.length; i += 2) {
  const x = r.p[i], y = r.p[i + 1];
  if (y >= y0 && y <= y1) pts.push([+x.toFixed(1), +y.toFixed(1)]);
}
pts.sort((a, b) => a[1] - b[1]);
console.log(name, 'pts in y[' + y0 + ',' + y1 + ']:', pts.length);
console.log(JSON.stringify(pts));
