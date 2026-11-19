// 诊断：hx27 里高家冲（南京境内接驳口站）为什么一调整就报错
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
const city = g.city, net = g.compiled.net;

console.log('--- 接驳口设施 ---');
for (const f of C.Fac.list()) {
  if (!f.ext) continue;
  const p = C.Fac.portal(f);
  console.log(f.id, f.name, 'at', f.x, f.y, 'gate', !!f.ext.gate, 'portal', p && [p.x.toFixed(2), p.y.toFixed(2)]);
}

console.log('\n--- 高家冲 / 铜井 所在片区 ---');
for (const s of Object.values(net.stations)) {
  if (!/高家冲|铜井/.test(s.name)) continue;
  const cid = city.cellAt(s.x, s.y);
  const rk = city.lockRegion(cid), rg = city.regions[rk];
  console.log(s.name, '@', s.x.toFixed(2), s.y.toFixed(2), 'cell', cid, 'region', rg.id, rg.name,
    'open', rg.open, 'empty', !!rg.empty, 'cellLocked', city.cellLocked(cid),
    'portal', s.portal || '-', 'isPortalStation', !!C.Fac.isPortalStation(s));
  const chk = C.Metro.checkSite(city, s.x, s.y, 'elevated');
  console.log('   checkSite(elevated) ->', JSON.stringify(chk).slice(0, 200));
}

console.log('\n--- 高家冲相邻区段 ---');
for (const [id, sg] of Object.entries(net.segments)) {
  const A = net.stations[sg.a], B = net.stations[sg.b];
  if (!A || !B) continue;
  if (!/高家冲/.test(A.name + B.name)) continue;
  const geo = C.Metro.segGeom ? null : null;
  console.log(id, A.name, '—', B.name, 'type', sg.type, 'inherited', !!sg.inherited, 'pts', (sg.pts || []).length / 2);
  // 手工统计穿过哪些片区
  const pts = sg.pts || [];
  const hit = new Map();
  for (let k = 0; k + 1 < pts.length; k += 2) {
    const s = pts[k], t = pts[k + 1];
    const n = Math.max(2, Math.ceil(Math.hypot(t[0] - s[0], t[1] - s[1]) * 4));
    for (let i = 0; i <= n; i++) {
      const x = s[0] + (t[0] - s[0]) * i / n, y = s[1] + (t[1] - s[1]) * i / n;
      const cid = city.cellAt(x, y); if (cid < 0) continue;
      if (!city.cellLocked(cid)) continue;
      const rg = city.regions[city.lockRegion(cid)];
      hit.set(rg.name, (hit.get(rg.name) || 0) + 1);
    }
  }
  console.log('   锁定区采样:', [...hit.entries()].map(([n, v]) => n + '×' + v).join(', ') || '（无）');
}
