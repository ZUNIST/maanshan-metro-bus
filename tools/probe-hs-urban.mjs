// 探查含山县在本图内的建成区掩膜（d.centers）分布，供开放建设与 TOWNS 标定参考
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
  const D = C.DATA;
  const hsIdx = D.regions.findIndex(r => r.id === 'hs');
  console.log('==', MID, 'hs index', hsIdx);
  // centers 落在含山县范围内（x<106, y>62）的格
  const inHs = D.centers.filter(p => p.x < 106 && p.y > 62);
  console.log('centers total', D.centers.length, '| in 含山 bbox', inHs.length);
  // 按 20 格网格聚类，找镇区团块
  const grid = new Map();
  for (const p of inHs) { const k = Math.floor(p.x / 10) + ',' + Math.floor(p.y / 10); grid.set(k, (grid.get(k) || 0) + 1); }
  const top = [...grid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log('10格簇（含山）:', top.map(([k, v]) => k + ':' + v).join('  '));
  // 精确到主要镇区中心：列出 1 格内的团块重心
  const towns = [['环峰', 58, 138], ['仙踪', 23, 107], ['昭关', 41, 99], ['清溪', 19, 173], ['陶厂', 66, 197], ['林头', 44, 192], ['铜闸', 55, 243], ['运漕', 55, 270]];
  for (const [n, x, y] of towns) {
    const near = inHs.filter(p => Math.hypot(p.x - x, p.y - y) <= 6);
    console.log('  ', n, '中心附近 6 格内 centers', near.length);
  }
}
