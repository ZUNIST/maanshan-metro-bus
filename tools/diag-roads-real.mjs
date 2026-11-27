// 用真实引擎建城，统计马鞍山 2000 剧本里各年份可见的道路里程
// 用法：node tools/diag-roads-real.mjs [year]
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/maanshan-metro-repo/city-and-metro-bus/';
const scope = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout };
scope.window = scope;
vm.createContext(scope);
const html = await readFile(root + 'index.html', 'utf8');
for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(root + file, 'utf8'), scope, { filename: file });
  if (file === 'js/city.js') break;
}
const { CM } = scope;
CM.useMap('ms');
console.log('useMap 后 CM.DATA.roadYearField:', CM.DATA.roadYearField ? 'ok' : 'MISSING');
const city = new CM.City();
city.generate(20000101, Number(process.argv[2] || 2000));
console.log('fieldStat:', JSON.stringify(CM.__fieldStat));
console.log('branch:', JSON.stringify(CM.__branch));
const FYD = (CM.MAPS.ms.data || {}).roadYearField;
console.log('roadYearField:', FYD ? ('b='+FYD.b+' w='+FYD.w+' h='+FYD.h+' len='+FYD.data.length) : 'MISSING');
const groups = city.roadGroups || [];
const START = CM.CFG.START.y;
let total = 0, k2000 = 0, k2010 = 0, k2020 = 0, kLater = 0;
const byCls = {};
for (const g of groups) {
  const b = g.bbox, km = Math.hypot(b[2] - b[0], b[3] - b[1]) * 0.25;   // 用 bbox 对角线近似
  total += km;
  if (g.year <= 2000) k2000 += km;
  if (g.year <= 2010) k2010 += km;
  if (g.year <= 2020) k2020 += km;
  if (g.year > START) kLater += km;
  const c = (byCls[g.cls] = byCls[g.cls] || { n: 0, km: 0, k2k: 0 });
  c.n++; c.km += km;
  if (g.year <= 2000) c.k2k += km;
}
console.log(`开局年 ${START}，道路组 ${groups.length}`);
console.log(`按 bbox 估算总里程 ${total.toFixed(0)} km`);
console.log(`2000 年可见 ${k2000.toFixed(0)} km (${(k2000 / total * 100).toFixed(0)}%)`);
console.log(`2010 年可见 ${k2010.toFixed(0)} km (${(k2010 / total * 100).toFixed(0)}%)`);
console.log(`2020 年可见 ${k2020.toFixed(0)} km (${(k2020 / total * 100).toFixed(0)}%)`);
console.log(`开局后（${START}+）才通车 ${kLater.toFixed(0)} km (${(kLater / total * 100).toFixed(0)}%)`);
for (const [c, v] of Object.entries(byCls)) console.log(`  cls ${c}: ${v.n} 条 ${v.km.toFixed(0)} km，2000 年 ${(v.k2k / v.km * 100).toFixed(0)}%`);

// 本市（非邻市背景）道路单独统计
let ownTotal = 0, own2k = 0, ownGroups = 0;
for (const g of groups) {
  const mx = (g.bbox[0] + g.bbox[2]) / 2, my = (g.bbox[1] + g.bbox[3]) / 2;
  const c = city.cellAt ? city.cellAt(mx, my) : -1;
  const rg = c >= 0 ? city.regions[city.region[c]] : null;
  if (!rg || rg.empty) continue;
  const b = g.bbox, km = Math.hypot(b[2] - b[0], b[3] - b[1]) * 0.25;
  ownGroups++; ownTotal += km;
  if (g.year <= 2000) own2k += km;
}
console.log(`\n本市道路（排除邻市背景）：${ownGroups} 组 ${ownTotal.toFixed(0)} km，2000 年可见 ${own2k.toFixed(0)} km (${(own2k / ownTotal * 100).toFixed(0)}%)`);

// 年份分布
const DF = CM.DATA.roadYearField;
console.log('CM.DATA.roadYearField:', DF ? 'ok len=' + DF.data.length : 'MISSING');
if (DF) {
  const c2 = groups.filter(g => g.cls === 2).slice(0, 5);
  const sample = (c2.length ? c2 : groups.slice(0, 6)).map(g => {
    const mx = (g.bbox[0] + g.bbox[2]) / 2, my = (g.bbox[1] + g.bbox[3]) / 2;
    const bx = Math.min(DF.w - 1, Math.max(0, Math.floor(mx / DF.b))), by = Math.min(DF.h - 1, Math.max(0, Math.floor(my / DF.b)));
    const k = DF.data.charCodeAt(by * DF.w + bx) - 48;
    return `${g.name || '(无名)'} cls=${g.cls} mid=(${mx.toFixed(1)},${my.toFixed(1)}) field=${DF.years[k]} year=${g.year}`;
  });
  console.log(sample.join('\n'));
}
const hist = {};
for (const g of groups) hist[g.year] = (hist[g.year] || 0) + 1;
console.log('年份分布:', Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([y, n]) => y + ':' + n).join(' '));
