// 验收：含山开放、马郑线马鞍山南站（地下）、接驳口站可调整
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

for (const MID of ['hx', 'hx27']) {
  C.useMap(MID);
  const g = C.Game.create({ mode: 'free', seed: 20270101 });
  const city = g.city, net = g.compiled.net, D = C.DATA;
  console.log('\n====', MID, '====');
  const hs = D.regions.findIndex(r => r.id === 'hs');
  console.log('含山片区:', D.regions[hs].name, 'open', D.regions[hs].open, 'empty', !!D.regions[hs].empty, 'regionOpen', city.regionOpen[hs]);
  let cells = 0, pop = 0, lit = 0;
  for (let k = 0; k < city.N; k++) if (city.landMax[k] >= 0.5 && city.region[k] === hs) { cells++; pop += city.pop[k]; if (city.pop[k] + city.jobs[k] > 1000) lit++; }
  console.log('  格', cells, '人口', Math.round(pop), '点亮', lit);
  console.log('  总人口', Math.round(city.totals().pop), ' 总岗位', Math.round(city.totals().jobs));

  if (MID === 'hx27') {
    console.log('\n-- 马郑线 --');
    const L = Object.values(net.lines).find(l => l.name === '马郑线');
    const segs = Object.values(net.segments).filter(s => s.line === L.id);
    const order = [];
    for (const s of segs) { const a = net.stations[s.a], b = net.stations[s.b]; order.push(a.name + '—' + b.name + ' [' + s.type + '] len ' + (s.len ? (s.len / 1000).toFixed(2) : '?') + 'km'); }
    order.forEach(x => console.log('  ', x));
    console.log('  长度 km', (L.len / 1000).toFixed(1), ' 站数', segs.length + 1);
    for (const s of Object.values(net.stations)) if (/马鞍山南/.test(s.name)) console.log('  马鞍山南站:', s.x, s.y, s.type, 'protected', city.protectedId[city.cellAt(s.x, s.y)]);

    console.log('\n-- 接驳口站 --');
    for (const s of Object.values(net.stations)) {
      if (!/高家冲|铜井/.test(s.name)) continue;
      console.log('  ', s.name, 'isPortal', !!C.Fac.isPortalStation(s), 'checkSite', JSON.stringify(C.Metro.checkSite(city, s.x, s.y, 'elevated')).slice(0, 120));
    }
    const cf = (g.compiled && g.compiled.conflicts) || [];
    console.log('\n-- 开局编译冲突 --', cf.length, '条');
    const byType = {};
    for (const x of cf) byType[x.type] = (byType[x.type] || 0) + 1;
    console.log('  ', JSON.stringify(byType));
    cf.slice(0, 6).forEach(x => console.log('   ·', x.type, x.msg));
    console.log('\n-- 巢马含山站 --');
    for (const d of C.RailConcessions.definitions(g)) {
      console.log('  ', d.id, d.stations.map(x => x[0]).join(' → '));
    }
  }
}
