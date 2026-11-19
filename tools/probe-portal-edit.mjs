// 验证：调整高家冲站 / 高家冲—浦和产业园区段后，编译不再报「境外不开放」
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
const city = g.city;
const show = (tag, cf) => {
  const kinds = {}; for (const x of cf) kinds[x.type] = (kinds[x.type] || 0) + 1;
  console.log(tag, '冲突', cf.length, JSON.stringify(kinds));
  cf.filter(x => /locked|outside|protected/.test(x.type)).slice(0, 3).forEach(x => console.log('   ·', x.msg));
};

show('原样      ', C.Metro.evaluate(g.net, g.net, city, 2027).conflicts);

// 2) 拖动高家冲站 0.3 格（仍在接驳口 1 格内）
let d1 = JSON.parse(JSON.stringify(g.net));
for (const s of Object.values(d1.stations)) if (s.name === '高家冲') { s.x += 0.3; s.y -= 0.2; }
show('移动高家冲', C.Metro.evaluate(d1, g.net, city, 2027).conflicts);

// 3) 改高家冲—浦和产业园 区段折点
let d2 = JSON.parse(JSON.stringify(g.net));
let hit = 0;
for (const sg of Object.values(d2.segments)) {
  const a = d2.stations[sg.a], b = d2.stations[sg.b];
  if (!a || !b) continue;
  if (!/高家冲/.test(a.name + b.name)) continue;
  sg.pts = [[214.0, 70.0], [208.0, 82.0]];
  hit++;
}
console.log('改动区段数', hit);
show('改区段折点', C.Metro.evaluate(d2, g.net, city, 2027).conflicts);

// 4) 在浦和产业园与宋桥之间拉一条穿过境外的新线（应当仍被拦）
let d3 = JSON.parse(JSON.stringify(g.net));
const a0 = Object.values(d3.stations).find(s => s.name === '浦和产业园');
const b0 = Object.values(d3.stations).find(s => s.name === '宋桥');
if (a0 && b0) {
  const sid = 'x' + Math.random().toString(36).slice(2, 7);
  d3.stations[sid] = { id: sid, name: '境外试验站', x: 180, y: 55, size: 'M', type: 'elevated' };
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  d3.segments[gid] = { id: gid, a: a0.id, b: sid, line: Object.keys(d3.lines)[0], pts: [], type: 'elevated' };
  show('境外新建站', C.Metro.evaluate(d3, g.net, city, 2027).conflicts);
}
