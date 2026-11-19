// 生成「高德卫星影像 + 游戏格叠加」核对图，用于目视校正建成区位置。
// 用法：node tools/amap-sat.mjs <preset> 
// 输出：sat-<preset>.html（临时页）与 核对-<preset>.png
import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PR = { lon0: 117.835, lat0: 32.07, kx: 390.61, ky: 440.27 };

// 游戏格(WGS-84 基准) -> 经纬度
const g2ll = (gx, gy) => [PR.lon0 + gx / PR.kx, PR.lat0 - gy / PR.ky];

// WGS-84 -> GCJ-02（高德瓦片使用 GCJ-02）
function wgs2gcj(lon, lat) {
  const pi = Math.PI, a = 6378245, ee = 0.006693421622965943;
  const tLat = (x, y) => {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
    r += (20 * Math.sin(y * pi) + 40 * Math.sin(y / 3 * pi)) * 2 / 3;
    r += (160 * Math.sin(y / 12 * pi) + 320 * Math.sin(y * pi / 30)) * 2 / 3;
    return r;
  };
  const tLon = (x, y) => {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
    r += (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x * pi / 30)) * 2 / 3;
    return r;
  };
  let dLat = tLat(lon - 105, lat - 35), dLon = tLon(lon - 105, lat - 35);
  const rad = lat / 180 * pi, m = 1 - ee * Math.sin(rad) ** 2, sq = Math.sqrt(m);
  dLat = (dLat * 180) / ((a * (1 - ee)) / (m * sq) * pi);
  dLon = (dLon * 180) / (a / sq * Math.cos(rad) * pi);
  return [lon + dLon, lat + dLat];
}

const worldPx = (lon, lat, z) => {
  const n = 256 * Math.pow(2, z);
  return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n];
};
// 坐标口径：默认不转换（已核对：geo 与 centers 的格坐标均按高德 GCJ 直接投影）；
// NOGCJ=0 时对格坐标做 WGS->GCJ 转换，用于对比。
const NOGCJ = process.env.NOGCJ !== '0';
// 游戏格 -> 高德瓦片世界像素
const g2px = (gx, gy, z) => { const [lo, la] = g2ll(gx, gy); return worldPx(...(NOGCJ ? [lo, la] : wgs2gcj(lo, la)), z); };

const PRESETS = {
  // 和县全域：看乌江、经开区、郑蒲港、姥桥的相对位置
  county: { cx: 213, cy: 150, z: 12, w: 1200, h: 900, box: [150, 260, 80, 240] },
  // 郑蒲港新区 + 姥桥镇
  zpg: { cx: 192, cy: 198, z: 14, w: 1100, h: 900, box: [176, 208, 182, 214] },
  // 乌江镇区 + 化工园
  wujiang: { cx: 243, cy: 103, z: 14, w: 1100, h: 900, box: [232, 254, 84, 126] },
  // 和县经济开发区 + 县城
  edz: { cx: 205, cy: 148, z: 14, w: 1100, h: 900, box: [194, 218, 130, 165] },
  dutu: { cx: 259, cy: 232, z: 15, w: 1100, h: 900, box: [250, 270, 224, 240] },
};

const preset = process.argv[2] || 'county';
const P = PRESETS[preset];
if (!P) { console.error('未知 preset:', preset); process.exit(1); }

// 读 center 数据
const { readFile } = await import('node:fs/promises');
const vm = await import('node:vm');
const CM = { GEOS: {}, U: { gcj2wgs: (a, b) => [a, b] }, DATA: { plans: {} }, CFG: { growth: {}, cost: {} }, MAP_LIST: [] };
const ctx = { window: { CM }, CM };
vm.runInNewContext(await readFile(ROOT + '/city-and-metro/js/geo_ms.js', 'utf8'), ctx);
vm.runInNewContext(await readFile(ROOT + '/city-and-metro/js/data_ms.js', 'utf8'), ctx);
const D = CM.MAP_LIST.find(x => x.id === 'ms').data;

const [bx0, bx1, by0, by1] = P.box;
const centers = D.centers.filter(c => c.x >= bx0 && c.x <= bx1 && c.y >= by0 && c.y <= by1);

const [ccx, ccy] = g2px(P.cx, P.cy, P.z);
const left = ccx - P.w / 2, top = ccy - P.h / 2;

// 瓦片
const n = Math.pow(2, P.z);
const tx0 = Math.floor(left / 256), tx1 = Math.floor((left + P.w) / 256);
const ty0 = Math.floor(top / 256), ty1 = Math.floor((top + P.h) / 256);
const tiles = [];
for (let ty = ty0; ty <= ty1; ty++) {
  for (let tx = tx0; tx <= tx1; tx++) {
    tiles.push({ tx, ty, l: tx * 256 - left, t: ty * 256 - top, s: `https://webst0${1 + ((tx + ty) % 4)}.is.autonavi.com/appmaptile?style=6&x=${tx}&y=${ty}&z=${P.z}` });
  }
}

// 格边像素尺寸
const p00 = g2px(0, 0, P.z), p10 = g2px(1, 0, P.z), p01 = g2px(0, 1, P.z);
const cellW = p10[0] - p00[0], cellH = p01[1] - p00[1];

const cellSvg = centers.map(c => {
  const [px, py] = g2px(c.x - 0.5, c.y - 0.5, P.z);
  const x = px - left, y = py - top;
  const inten = Math.min(1, c.pop / 12000);
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cellW + 0.4).toFixed(1)}" height="${(cellH + 0.4).toFixed(1)}" fill="rgba(255,40,60,${(0.28 + 0.5 * inten).toFixed(2)})" stroke="none"/>`;
}).join('');

// 标注点（真实高德 POI，GCJ 经纬度直接投瓦片）
function mark(lon, lat, label, color, side) {
  const [px, py] = worldPx(lon, lat, P.z);
  const x = px - left, y = py - top;
  const dx = side === 'l' ? -8 : 8, anchor = side === 'l' ? 'end' : 'start';
  return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    `<text x="${(x + dx).toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="#fff" font-size="15" font-weight="700" text-anchor="${anchor}" ` +
    `stroke="#000" stroke-width="3.5" paint-order="stroke">${label}</text></g>`;
}

const POINTS = {
  county: [
    [118.4531, 31.8534, '乌江镇', '#22d3ee', 'r'],
    [118.4602, 31.8180, '化工园', '#a3e635', 'r'],
    [118.3633, 31.7470, '和县经开区', '#fbbf24', 'l'],
    [118.3628, 31.7166, '和县县城', '#fbbf24', 'l'],
    [118.3337, 31.6278, '郑蒲港产业园', '#60a5fa', 'r'],
    [118.3117, 31.6018, '姥桥镇', '#60a5fa', 'l'],
    [118.3387, 31.5960, '郑蒲港站', '#60a5fa', 'r'],
    [118.3189, 31.8713, '香泉镇', '#e5e7eb', 'r'],
    [118.2864, 31.7718, '西埠镇', '#e5e7eb', 'l'],
  ],
  zpg: [
    [118.3337, 31.6278, '郑蒲港现代产业园管委会', '#60a5fa', 'r'],
    [118.3330, 31.6272, '孵化园', '#60a5fa', 'l'],
    [118.3462, 31.6180, '郑蒲港新区(住宅)', '#60a5fa', 'r'],
    [118.3117, 31.6018, '姥桥镇政府', '#22d3ee', 'l'],
    [118.3387, 31.5960, '郑蒲港站', '#a3e635', 'r'],
    [118.3176, 31.6209, '沪武高速出口', '#e5e7eb', 'l'],
    [118.3258, 31.6100, '姥桥工业园', '#e5e7eb', 'l'],
  ],
  wujiang: [
    [118.4531, 31.8534, '乌江镇政府', '#22d3ee', 'r'],
    [118.4571, 31.8510, '乌江农贸/卫生院', '#22d3ee', 'r'],
    [118.4601, 31.8452, '乌江人家小区', '#22d3ee', 'l'],
    [118.4602, 31.8180, '精细化工产业基地', '#a3e635', 'r'],
    [118.4646, 31.7964, '化工基地(南)', '#a3e635', 'r'],
    [118.4752, 31.8036, '江锐新材料', '#a3e635', 'r'],
    [118.4719, 31.8101, '生源化工', '#a3e635', 'l'],
  ],
  edz: [
    [118.3633, 31.7470, '和县经开区管委会', '#fbbf24', 'l'],
    [118.3744, 31.7591, '经开区北区', '#fbbf24', 'r'],
    [118.3540, 31.7486, '电商产业园', '#fbbf24', 'l'],
    [118.3628, 31.7166, '和县县政府', '#22d3ee', 'l'],
    [118.3552, 31.7209, '历阳老城', '#22d3ee', 'l'],
  ],
};

const marks = (POINTS[preset] || []).map(p => mark(p[0], p[1], p[2], p[3], p[4])).join('');

// 网格：每 5 格一条细线，每 20 格一条粗线，并标格坐标
let grid = '';
const gx0 = Math.floor(bx0 / 5) * 5, gx1 = Math.ceil(bx1 / 5) * 5;
for (let gx = gx0; gx <= gx1; gx += 5) {
  const [px] = g2px(gx, P.cy, P.z); const x = px - left;
  const major = gx % 20 === 0;
  grid += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${P.h}" stroke="rgba(255,255,255,${major ? 0.45 : 0.16})" stroke-width="${major ? 1.2 : 0.7}"/>`;
  if (major) grid += `<text x="${(x + 3).toFixed(1)}" y="16" fill="rgba(255,255,255,.85)" font-size="12" stroke="#000" stroke-width="2.5" paint-order="stroke">x${gx}</text>`;
}
for (let gy = Math.floor(by0 / 5) * 5; gy <= Math.ceil(by1 / 5) * 5; gy += 5) {
  const [, py] = g2px(P.cx, gy, P.z); const y = py - top;
  const major = gy % 20 === 0;
  if (y < 0 || y > P.h) continue;
  grid += `<line x1="0" y1="${y.toFixed(1)}" x2="${P.w}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,${major ? 0.45 : 0.16})" stroke-width="${major ? 1.2 : 0.7}"/>`;
  if (major) grid += `<text x="6" y="${(y - 4).toFixed(1)}" fill="rgba(255,255,255,.85)" font-size="12" stroke="#000" stroke-width="2.5" paint-order="stroke">y${gy}</text>`;
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#0b1117;overflow:hidden}
#wrap{position:relative;width:${P.w}px;height:${P.h}px;overflow:hidden;filter:saturate(1.15) contrast(1.05)}
#wrap img.t{position:absolute;width:256px;height:256px}
#ov{position:absolute;left:0;top:0}
#hd{position:absolute;left:0;top:0;width:${P.w}px;height:34px;background:linear-gradient(180deg,rgba(0,0,0,.75),rgba(0,0,0,0));z-index:9}
#ttl{position:absolute;left:12px;top:8px;color:#fff;font:700 17px/1.2 "Microsoft YaHei",sans-serif;text-shadow:0 2px 6px #000;z-index:10}
#lg{position:absolute;left:12px;bottom:12px;background:rgba(8,14,20,.82);color:#dfe7ef;font:13px/1.6 "Microsoft YaHei",sans-serif;padding:8px 12px;border-radius:6px;z-index:10}
.sw{display:inline-block;width:12px;height:12px;vertical-align:-1px;margin-right:5px}
</style></head><body><div id="wrap">
${tiles.map(t => `<img class="t" style="left:${t.l}px;top:${t.t}px" src="${t.s}">`).join('')}
<svg id="ov" width="${P.w}" height="${P.h}">${grid}${cellSvg}${marks}</svg>
<div id="hd"></div>
<div id="ttl">${preset} · 高德卫星 + 游戏建成格（红块）</div>
<div id="lg"><span class="sw" style="background:#22d3ee"></span>镇区 &nbsp;<span class="sw" style="background:#a3e635"></span>化工园 &nbsp;<span class="sw" style="background:#fbbf24"></span>经开区/县城 &nbsp;<span class="sw" style="background:#60a5fa"></span>郑蒲港 &nbsp; 网格 5 格（1.25 km），粗线 20 格（5 km）</div>
</div></body></html>`;

const htmlPath = ROOT + `/sat-${preset}.html`;
await writeFile(htmlPath, html, 'utf8');
const outPng = ROOT + `/核对-${preset}${NOGCJ ? '-raw' : ''}.png`;

// 用 Chrome headless 截图
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--window-size=${P.w},${P.h}`, '--remote-debugging-port=9334',
  `--user-data-dir=${ROOT}/.chromeprof-sat`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(400);
    try { const list = await (await fetch('http://127.0.0.1:9334/json')).json(); target = list.find(t => t.type === 'page'); } catch { }
  }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') });
  await sleep(6500);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(outPng, Buffer.from(r.data, 'base64'));
  console.log(JSON.stringify({ preset, cells: centers.length, tiles: tiles.length, out: outPng, html: htmlPath }));
} catch (e) { console.error('FAIL', e.message); }
finally { try { child.kill(); } catch { } process.exit(0); }
