// 公交版 v3.30 专项测试：公交站容按现实收紧、容量口径统一、公交站拆迁影响范围
//   ① 站容 400/1000 人/h，M.capTableFor 按制式返回容量表
//   ② compile 预存 C.stCap（仿真拥挤延误不再一律套地铁站台）
//   ③ metroMaskOf：公交沿线段不占地，站台只标记紧贴站点的一小块
//   ④ 单文件打包必须内联 LOGO（避免加载动画掉色）
// 用法：node scripts/test-bus-v330.mjs [地图 id，默认 ms]
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const mapId = process.argv[2] || 'ms';
const context = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
// 要比 v3.29 多加载一个 render.js：拆迁占地掩码在 Renderer.prototype.metroMaskOf
for (const [, src] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
  if (src === 'js/render.js') break;
}
const C = context.CM, M = C.Metro, CFG = C.CFG, B = CFG.bus;
C.UI = function () {};
const ok = (m) => console.log('  ok  ' + m);
C.useMap(mapId);
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const city = g.city;

const nudge = (x, y) => {
  for (const d of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) {
      if (M.checkSite(city, x + dx, y + dy, 'surface').ok) return [x + dx, y + dy];
    }
  }
  return null;
};
function busLine(sys, grade) {
  const net = M.clone(g.net), lid = M.newLine(net, null, sys || 'bus');
  if (grade) net.lines[lid].grade = grade;
  const pts = [];
  for (let i = 0; i < 8; i++) { const p = nudge(250 + i * 3.2, 170); if (p) pts.push(p); }
  assert.ok(pts.length >= 6, '走廊上可建站：' + pts.length);
  let prev = null; const ids = [];
  for (const [x, y] of pts) {
    const sid = M.addStation(net, x, y, { size: 'M', type: 'surface' }, city);
    ids.push(sid);
    if (prev) M.addSegment(net, lid, prev, sid, [], 'surface');
    prev = sid;
  }
  M.normalizeLines(net);
  return { net, lid, ids };
}
const maskBits = function (m) {
  let n = 0;
  for (const [, v] of m) { let x = v; while (x) { n += x & 1; x >>= 1; } }
  return n;
};

// ---- ① 站容与容量表 ----
{
  assert.equal(B.stationCap.S, 400, '公交小型站 400 人/h');
  assert.equal(B.stationCap.M, 1000, '公交中型站 1000 人/h');
  assert.equal(M.capTableFor('bus').S, 400, '容量表：公交');
  assert.equal(M.capTableFor('tram').S, CFG.tram.stationCap.S, '容量表：电车');
  assert.equal(M.capTableFor('metro').S, CFG.metro.stationCap.S, '容量表：地铁');
  assert.equal(M.capTableFor('unknown').S, CFG.metro.stationCap.S, '未知制式回退地铁');
  assert.ok(B.stationCap.M < CFG.tram.stationCap.S, '公交 M 站容量小于电车 S 站');
  assert.ok(B.stationCap.S * 10 < CFG.metro.stationCap.S, '公交站容远小于地铁站');
}
ok('① 公交站容 400/1000 人/h，容量表按制式取，不再误显示 15000 人次/时');

// ---- ② 编译结果预存按制式的站台能力 ----
{
  const { net, ids } = busLine('bus', 'B1');
  const comp = M.compile(net, city);
  const k = comp.sIndex.get(ids[3]);
  assert.ok(comp.stCap && typeof comp.stCap.length === 'number' && comp.stCap.length === comp.stations.length, 'compile 生成 stCap');
  assert.equal(comp.stCap[k], 1000, '公交站预存容量 1000');
  net.stations[ids[3]].size = 'S';
  const comp2 = M.compile(net, city);
  assert.equal(comp2.stCap[comp2.sIndex.get(ids[3])], 400, '缩成 S 站后预存容量 400');
}
ok('② 仿真拥挤延误用的 C.stCap 按制式预存（地铁/电车/公交各取各的表）');

// ---- ③ 公交站拆迁影响范围 ----
{
  const { net, lid, ids } = busLine('bus', 'B1');
  const R = Object.create(C.Renderer.prototype);
  R.game = { city: city };
  const busMask = R.metroMaskOf(net), busBits = maskBits(busMask);
  assert.ok(busBits > 0, '公交站牌仍保留极小的占位标记（贴得很近才拆）');
  // 同一几何改成地铁口径：地面轨道 27.5 m 半宽 + 150 m 站台，占地位数必须显著更多
  net.lines[lid].sys = 'metro';
  const metroBits = maskBits(R.metroMaskOf(net));
  assert.ok(busBits * 4 < metroBits, '公交占地位数远小于地铁：' + busBits + ' vs ' + metroBits);
  // 段中点所在的格：公交不应标记（沿既有道路，不征地），地铁会标记
  const a = net.stations[ids[3]], b = net.stations[ids[4]];
  const midCell = Math.floor((a.y + b.y) / 2) * city.W + Math.floor((a.x + b.x) / 2);
  assert.ok(!busMask.has(midCell), '公交沿线段中点不产生占地/拆迁标记');
}
ok('③ 公交沿线段不占地，站台只在紧贴站点处标记拆迁');

// ---- ④ 单文件版 LOGO 内联（加载动画掉色回归） ----
{
  const tool = await readFile(new URL('../tools/build-single.mjs', root), 'utf8');
  assert.ok(/inlineLogos/.test(tool), '打包脚本含 LOGO 内联逻辑');
  assert.ok(/logo-navy\.png/.test(tool) && /logo-white\.png/.test(tool), '内联深蓝黑与白色两张 LOGO');
  assert.ok(/LOGO 图片未内联/.test(tool), '打包脚本有残留相对路径的自检断言');
  const uiSrc = await readFile(new URL('js/ui.js', root), 'utf8');
  assert.ok(/const caps = scfg \? M\.capTableFor\(opts\.sys\) : mc\.stationCap/.test(uiSrc), '规模卡片按制式显示容量');
  const simSrc = await readFile(new URL('js/sim.js', root), 'utf8');
  assert.ok(/net\.C\.stCap/.test(simSrc), '仿真拥挤延误读 C.stCap');
  const rendSrc = await readFile(new URL('js/render.js', root), 'utf8');
  assert.ok(/MT\.isBus\(segLine\).*continue/.test(rendSrc), '公交沿线段跳过占地标记');
  assert.ok(/BUS_ST_HALF/.test(rendSrc), '公交站台用小半径');
}
ok('④ 单文件 LOGO 内联、UI/仿真容量口径、公交占地规则均有回归保护');

console.log('\n公交版 v3.30 专项测试全部通过（' + mapId + '）');
