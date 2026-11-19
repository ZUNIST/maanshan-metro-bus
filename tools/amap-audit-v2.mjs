// 高德坐标核验 v2：精确同名优先，避免异名近点掩盖真错误
// 用法：AMAP_KEY=xxx node tools/amap-audit-v2.mjs ms ms27
// 输出：tools/amap-audit-v2.json + tools/amap-audit-v2.md
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const SRC = ROOT + '/city-and-metro-tram';
const KEY = process.env.AMAP_KEY;
if (!KEY) { console.error('缺少 AMAP_KEY'); process.exit(1); }
const MAPS = process.argv.slice(2).length ? process.argv.slice(2) : ['ms', 'ms27'];

function gcj2wgs(lat, lon) {
  const pi = Math.PI, a = 6378245, ee = 0.006693421622965943;
  const tLat = (x, y) => { let r = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3; r += (20*Math.sin(x*pi) + 40*Math.sin(x/3*pi))*2/3;
    r += (160*Math.sin(x/12*pi) + 320*Math.sin(x*pi/30))*2/3; return r; };
  const tLon = (x, y) => { let r = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3; r += (20*Math.sin(x*pi) + 40*Math.sin(x/3*pi))*2/3;
    r += (150*Math.sin(x/12*pi) + 300*Math.sin(x/30*pi))*2/3; return r; };
  let dLat = tLat(lat-35, lon-105), dLon = tLon(lat-35, lon-105);
  const rad = lat/180*pi, m = 1 - ee*Math.sin(rad)**2, sq = Math.sqrt(m);
  dLat = (dLat*180)/((a*(1-ee))/(m*sq)*pi); dLon = (dLon*180)/(a/sq*Math.cos(rad)*pi);
  return [lat*2-(lat+dLat), lon*2-(lon+dLon)];
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 规范化：去括号内容、去空白与分隔点，用于精确同名判断
const stripParen = s => String(s || '').replace(/[（(][^）)]*[）)]/g, '').trim();
const norm = s => stripParen(s).replace(/[\s·•・]/g, '');

// 加载运行时（到 save.js 为止，拿到纯数据）
const ctx = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
ctx.window = ctx; vm.createContext(ctx);
const scripts = [...(await readFile(SRC + '/index.html', 'utf8')).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const src of scripts) {
  await vm.runInContext(await readFile(SRC + '/' + src, 'utf8'), ctx, { filename: src });
  if (src === 'js/save.js') break;
}
const CM = ctx.CM;
const CITY = { ms: '马鞍山', ms27: '马鞍山', sh: '上海', bj: '北京', gz: '广州', hz: '杭州' };

async function amap(keyword, city) {
  const u = 'https://restapi.amap.com/v3/place/text?' + new URLSearchParams({
    keywords: keyword, city, offset: '12', page: '1', extensions: 'base', key: KEY,
  });
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u); const j = await r.json();
      if (j.status === '1') return j.pois || [];
      if (String(j.infocode) === '10001') { await sleep(1500); continue; }
      return [];
    } catch (e) { await sleep(800); }
  }
  return [];
}

const allRows = [];
for (const mapId of MAPS) {
  CM.useMap(mapId);
  const D = CM.DATA;
  const pr = (CM.GEOS[mapId] && CM.GEOS[mapId].proj) || null;
  if (!pr) { console.error(mapId + ' 无 proj，跳过'); continue; }
  const toGrid = (lat, lon) => { const w = gcj2wgs(lat, lon); return [(w[1]-pr.lon0)*pr.kx, (pr.lat0-w[0])*pr.ky]; };
  const city = CITY[mapId] || '马鞍山';

  const targets = [];
  for (const l of (D.landmarks || [])) targets.push({ kind: '地标', name: l.name, x: l.x, y: l.y, q: l.name, id: l.id });
  for (const f of (D.facilities || [])) {
    if (!f.at || !Array.isArray(f.at) || typeof f.at[0] !== 'number') continue;
    targets.push({ kind: '设施', name: f.n, x: f.at[0], y: f.at[1], q: f.n, id: f.id });
  }
  for (const dl of (D.districtLabels || [])) {
    if (!Array.isArray(dl[1]) || typeof dl[1][0] !== 'number') continue;
    targets.push({ kind: '乡镇', name: dl[0], x: dl[1][0], y: dl[1][1], q: dl[0], id: '' });
  }

  console.log(`===== ${mapId} (${city}) 核验 ${targets.length} 点 =====`);
  for (const t of targets) {
    let pois = await amap(t.q, city);
    await sleep(120);
    // 把 POI 转成候选，保留精确同名 / 包含 / 全部最近
    const cand = [];
    for (const p of pois) {
      if (!p.location) continue;
      const [lon, lat] = p.location.split(',').map(Number);
      const g = toGrid(lat, lon);
      if (g[0] < -20 || g[0] > 460 || g[1] < -20 || g[1] > 360) continue; // 地图范围外剔除（同名异地）
      const d = Math.hypot(g[0] - t.x, g[1] - t.y);
      const pn = norm(p.name), tn = norm(t.name);
      let match = 'other';
      if (pn === tn) match = 'exact';
      else if (pn && tn && (pn.includes(tn) || tn.includes(pn))) match = 'substr';
      cand.push({ name: p.name, addr: p.address || '', type: p.type || '', gx: +g[0].toFixed(1), gy: +g[1].toFixed(1), d: +d.toFixed(2), match });
    }
    cand.sort((a, b) => a.d - b.d);
    const exact = cand.filter(c => c.match === 'exact').sort((a, b) => a.d - b.d)[0] || null;
    const best = cand[0] || null;
    allRows.push({ map: mapId, ...t, exact, best, poin: pois.length });
    process.stdout.write('.');
  }
  console.log('');
}

await writeFile(ROOT + '/tools/amap-audit-v2.json', JSON.stringify(allRows, null, 1));

// 报告：精确同名且偏差 >= 3 格（750m）→ 真可疑；无精确命中但最近异名偏差大 → 需人工判断
const md = ['# 高德坐标核验 v2（精确同名优先）', '',
  '判定规则：只有**高德返回精确同名 POI** 且偏差 ≥ 3 格(750m) 才列为「真可疑」；异名近点即便很近也不采信（避免重演马鞍山站误判）。1 格 = 250 m。', ''];
for (const mapId of MAPS) {
  const rows = allRows.filter(r => r.map === mapId);
  const suspect = rows.filter(r => r.exact && r.exact.d >= 3).sort((a, b) => b.exact.d - a.exact.d);
  const noExact = rows.filter(r => !r.exact && r.best && r.best.d >= 4).sort((a, b) => b.best.d - a.best.d);
  const miss = rows.filter(r => !r.best);
  md.push(`## ${mapId}：真可疑 ${suspect.length} / 异名偏差大 ${noExact.length} / 未查到 ${miss.length}`, '');
  md.push('### ⚠️ 真可疑（精确同名 + 偏差 ≥ 750m）');
  md.push('| 类型 | 名称 | 数据坐标 | 高德同名坐标 | 偏差 | 高德地址 |');
  md.push('|---|---|---|---|---|---|');
  for (const r of suspect) md.push(`| ${r.kind} | ${r.name} | (${r.x.toFixed(0)},${r.y.toFixed(0)}) | (${r.exact.gx},${r.exact.gy}) | ${r.exact.d} 格≈${(r.exact.d*0.25).toFixed(2)}km | ${r.exact.addr} |`);
  md.push('');
  md.push('### 异名偏差大（仅参考，不采信改坐标）');
  md.push('| 类型 | 名称 | 数据坐标 | 最近异名POI | 偏差 | 匹配 |');
  md.push('|---|---|---|---|---|---|');
  for (const r of noExact) md.push(`| ${r.kind} | ${r.name} | (${r.x.toFixed(0)},${r.y.toFixed(0)}) | ${r.best.name} (${r.best.gx},${r.best.gy}) | ${r.best.d} 格 | ${r.best.match} |`);
  md.push('');
  md.push('### 未查到 POI：' + (miss.map(r => r.kind + ':' + r.name).join(', ') || '无'));
  md.push('');
}
await writeFile(ROOT + '/tools/amap-audit-v2.md', md.join('\n'));

console.log('\n===== 汇总 =====');
for (const mapId of MAPS) {
  const rows = allRows.filter(r => r.map === mapId);
  const suspect = rows.filter(r => r.exact && r.exact.d >= 3);
  console.log(mapId + ' 真可疑 ' + suspect.length + ' 个:');
  for (const r of suspect.sort((a,b)=>b.exact.d-a.exact.d)) console.log('  ' + [r.kind,r.name,'数据('+r.x.toFixed(0)+','+r.y.toFixed(0)+')','高德('+r.exact.gx+','+r.exact.gy+')',r.exact.d+'格'].join(' | '));
}
console.log('\n报告: tools/amap-audit-v2.md / .json');
