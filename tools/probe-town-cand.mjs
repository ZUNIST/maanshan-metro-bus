// 统计 hx27 每个镇的候选建成格（掩膜）与按人口应有的格数
import fs from 'node:fs/promises'; import vm from 'node:vm';
const root = new URL('../city-and-metro-bus/', import.meta.url), mem = new Map();
const c = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  setInterval: () => 0, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
c.window = c; vm.createContext(c);
const load = async f => vm.runInContext(await fs.readFile(new URL(f, root), 'utf8'), c, { filename: f });
const scripts = [...(await fs.readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const f of scripts) { await load(f); if (f === 'js/save.js') break; }
const C = c.CM; C.UI = function () {};
for (const f of ['settings', 'icons', 'pages', 'corp', 'fleet', 'opsapp', 'render', 'sites', 'scenery']) await load('js/' + f + '.js');
C.useMap('hx27');
const D = C.DATA;
const TOWNS = D.towns || [];
const cells = D.centers;
const buckets = TOWNS.map(() => []);
for (const c2 of cells) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < TOWNS.length; i++) { const q = Math.hypot(c2.x - TOWNS[i][1], c2.y - TOWNS[i][2]); if (q < bd) { bd = q; bi = i; } }
  buckets[bi].push(bd);
}
const DENS = 8000, CELL = 0.0625;
console.log('镇'.padEnd(6), '2027人口(万)', 'n应有', 'cand', '缺口');
for (let i = 0; i < TOWNS.length; i++) {
  const t = TOWNS[i], n = Math.round(t[4] * 1e4 / DENS / CELL);
  console.log(t[0].padEnd(6), String(t[4]).padEnd(11), String(n).padEnd(5), String(buckets[i].length).padEnd(5), n - buckets[i].length);
}
