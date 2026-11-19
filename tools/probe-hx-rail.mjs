// 检查 hx27 两条运营权线路的站序与区间折点
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
const g = C.Game.create({ mode: 'free', seed: 20270101 });
for (const d of C.RailConcessions.definitions(g)) {
  const st = g.compiled.stations.filter(s => s.rail === d.id);
  console.log('==', d.id, d.name, 'stations', st.length, '->', st.map(s => s.name + '@' + s.x.toFixed(1) + ',' + s.y.toFixed(1)).join(' | '));
  for (const s of st) {
    const rg = g.city.regions[g.city.region[g.city.cellAt(s.x, s.y)]];
    console.log('   ', s.name, 'region', rg ? rg.id : '-', 'open', rg ? rg.open : '-');
  }
  const segs = Object.values(g.compiled.net.segments).filter(s => s.line === 'l' + (900000 + d.seg));
  console.log('    segments:', segs.map(s => s.pts.length / 2 + 'pts').join(', '));
  const L = g.compiled.net.lines['l' + (900000 + d.seg)];
  if (L && L.len) console.log('    length km', (L.len / 1000).toFixed(1));
}
