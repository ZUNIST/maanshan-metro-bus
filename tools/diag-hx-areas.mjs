// 诊断：和县图（hx / hx27）若干关注点的建成区与设施情况
// 用法：node tools/diag-hx-areas.mjs [hx|hx27]
import fs from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('file:///C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/city-and-metro-bus/');
const mem = new Map();
const c = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  setInterval: () => 0, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
c.window = c; vm.createContext(c);
const load = async f => vm.runInContext(await fs.readFile(new URL(f, root), 'utf8'), c, { filename: f });
const scripts = [...(await fs.readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const f of scripts) { await load(f); if (f === 'js/save.js') break; }
const C = c.CM; C.UI = function () {};
for (const f of ['settings', 'icons', 'pages', 'corp', 'fleet', 'opsapp', 'render', 'sites', 'scenery']) await load('js/' + f + '.js');

const MID = process.argv[2] || 'hx';
C.useMap(MID);
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const D = C.DATA, city = g.city, towns = D.towns || [];

const points = [
  ['和县经开区', 159.5, 132.1],
  ['郑蒲港新城商业', 148.4, 185.2],
  ['郑蒲港综合保税区', 154.1, 172.1],
  ['祁门', 88.55, 126.49],
  ['腰埠', 108.88, 137.47],
  ['褒禅山', 62.7, 119.0],
  ['华阳洞', 71.18, 115.54],
];

const cells = [];
const urban = [];
for (let j = 0; j < city.H; j++) for (let i = 0; i < city.W; i++) {
  const k = j * city.W + i;
  if (city.pop[k] > 60) cells.push([i + 0.5, j + 0.5]);
  if (city.street[k] === 1) urban.push([i + 0.5, j + 0.5]);
}
console.log('地图', MID, '| pop>60 格', cells.length, '| street=1 格', urban.length, '| TOWNS 锚点数', towns.length);

for (const [name, x, y] of points) {
  // 半径 8 格内的 street=1 格，做 4 邻接连通块统计（判断是「成片街区」还是「麻点」）
  const local = urban.filter(p => Math.abs(p[0] - x) <= 8 && Math.abs(p[1] - y) <= 8);
  const set = new Set(local.map(p => p[0] + ',' + p[1]));
  let best = 0, seen = new Set();
  for (const p of local) {
    const k0 = p[0] + ',' + p[1];
    if (seen.has(k0)) continue;
    let size = 0; const st = [p];
    seen.add(k0);
    while (st.length) {
      const q = st.pop(); size++;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const kk = (q[0] + d[0]) + ',' + (q[1] + d[1]);
        if (set.has(kk) && !seen.has(kk)) { seen.add(kk); st.push([q[0] + d[0], q[1] + d[1]]); }
      }
    }
    if (size > best) best = size;
  }
  let n = 0, nu = 0;
  for (const p of cells) if (Math.abs(p[0] - x) <= 6 && Math.abs(p[1] - y) <= 6) n++;
  for (const p of urban) if (Math.abs(p[0] - x) <= 6 && Math.abs(p[1] - y) <= 6) nu++;
  let bt = null, bd = 1e9;
  for (const t of towns) { const d = Math.hypot(t[1] - x, t[2] - y); if (d < bd) { bd = d; bt = t; } }
  const facs = C.Fac.list(city).filter(f => Math.hypot(f.x - x, f.y - y) < 4).map(f => f.t + ':' + f.name);
  console.log(`\n${name} (${x}, ${y})`);
  console.log('  pop>60:', n, '| 真建成(street=1):', nu, '| 最大连片:', best, '| 最近锚点:', bt[0], '距', bd.toFixed(1));
  console.log('  4 格内设施:', facs.length ? facs.join(' / ') : '（无）');
}
