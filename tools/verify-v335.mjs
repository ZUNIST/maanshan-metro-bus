// v3.35 验收：三条线站序、含山西站、保税区通勤点、新镇建成区
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
for (const f of ['settings', 'icons', 'pages', 'corp', 'fleet', 'opsapp', 'render', 'sites', 'scenery']) await load('js/' + f + '.js');

const MID = process.argv[2] || 'hx27';
C.useMap(MID);
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const D = C.DATA, net = g.compiled.net, city = g.city;

console.log('=== 线路 ===');
for (const L of (D.initialNetwork ? D.initialNetwork.lines : [])) {
  const sts = L.stations.map(s => s[0] + '(' + s[1].toFixed(1) + ',' + s[2].toFixed(1) + ')');
  console.log(L.name, L.stations.length + ' 站', sts.join(' → '));
}
console.log('\n=== 编译后的车站（按线） ===');
const byLine = {};
for (const s of Object.values(net.stations)) {
  const l = s.line || (s.lines && s.lines[0]) || '?';
  (byLine[l] = byLine[l] || []).push(s.name);
}
console.log(JSON.stringify(byLine));

console.log('\n=== 换乘站（同名合并） ===');
const nameCnt = {};
for (const s of Object.values(net.stations)) nameCnt[s.name] = (nameCnt[s.name] || 0) + 1;
for (const k in nameCnt) if (nameCnt[k] > 1) console.log('  ', k, '×', nameCnt[k]);

console.log('\n=== 设施 ===');
for (const f of C.Fac.list(city)) if (/含山|保税|化工|浦和/.test(f.name)) console.log('  ', f.t, f.name, f.x.toFixed(1), f.y.toFixed(1), 'open', f.open);

console.log('\n=== 新镇建成区（pop>60 的格数，5 格半径内） ===');
const towns = D.towns || [];
const cells = [];
for (let j = 0; j < city.H; j++) for (let i = 0; i < city.W; i++) {
  const k = j * city.W + i;
  if (city.pop[k] > 60) cells.push([i + 0.5, j + 0.5]);
}
for (const t of towns) {
  let n = 0;
  const R = 6;
  for (const p of cells) if (Math.abs(p[0] - t[1]) <= R && Math.abs(p[1] - t[2]) <= R) n++;
  console.log('  ', t[0].padEnd(4), t[1].toFixed(1), t[2].toFixed(1), '建成格', n, '目标格', Math.round(t[3] * 1e4 / 9000 / 0.0625));
}

console.log('\n=== 开局冲突 ===');
const cf = C.Metro.evaluate(net, net, city, 2027).conflicts || [];
const kinds = {};
for (const x of cf) kinds[x.type] = (kinds[x.type] || 0) + 1;
console.log('  ', cf.length, JSON.stringify(kinds));
cf.slice(0, 5).forEach(x => console.log('   ·', x.type, x.msg));
