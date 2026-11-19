// 探查 hx27 图内东南角（当涂南部）的片区归属、建成格与人口
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

const MID = process.argv[2] || 'hx27'; C.useMap(MID);
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const city = g.city, W = city.W, H = city.H, D = C.DATA;
const names = D.regions.map(r => r.id);
const stat = {};
for (let k = 0; k < D.regions.length; k++) stat[k] = { id: names[k], cells: 0, pop: 0, jobs: 0, lit: 0 };
for (let cc = 0; cc < city.N; cc++) {
  if (city.landMax[cc] < 0.5) continue;
  const k = city.region[cc], s = stat[k];
  if (!s) continue;
  s.cells++; s.pop += city.pop[cc]; s.jobs += city.jobs[cc];
  if (city.pop[cc] + city.jobs[cc] > 1000) s.lit++;
}
console.log('--- 各区统计（'+MID+'）---');
for (const k in stat) { const s = stat[k]; if (!s.cells) continue; console.log(s.id.padEnd(8), 'cells', String(s.cells).padStart(5), 'lit', String(s.lit).padStart(4), 'pop', Math.round(s.pop), 'jobs', Math.round(s.jobs)); }
console.log('--- 东南角 x>=216,y>=228 逐格（pop>0）---');
let box = { cells: 0, pop: 0, lit: 0, regs: {} };
for (let y = 228; y < H; y++) for (let x = 216; x < W; x++) {
  const cc = y * W + x; if (city.landMax[cc] < 0.5) continue;
  box.cells++; box.pop += city.pop[cc];
  const rg = names[city.region[cc]]; box.regs[rg] = (box.regs[rg] || 0) + 1;
  if (city.pop[cc] > 500) box.lit++;
}
console.log(JSON.stringify(box));
console.log('--- 城镇标定表 ---');
for (const t of D.towns) console.log(t.join(', '));
console.log('--- districtLabels ---', JSON.stringify(D.districtLabels));
