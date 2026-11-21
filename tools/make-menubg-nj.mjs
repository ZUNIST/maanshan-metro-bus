// 主菜单背景（v3.57）：南京新街口周边的 2.5D 地图 + 动画层轨迹。
//
// 原版（广州）的底图是游戏渲染器输出的俯视画面，再叠一层 canvas 画线路、列车与车流。
// 这里用同一套视觉语言程序化生成：白色建筑块 + 浅灰路网 + 蓝色水系 + 淡绿公园，米白底。
// 底图（SVG）与轨迹（js/menubg-data.js）用同一个投影函数产出，所以列车一定跑在路上。
//
// 用法：node tools/make-menubg-nj.mjs [输出根目录]
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'merge-2.9.5');
const OUT_IMG = path.join(ROOT, 'img');

// ---------- 画面与世界坐标 ----------
// 世界坐标单位：米，原点在新街口广场。画面 1600 × 900。
const VW = 1600, VH = 900;
const SPAN = 5400;                 // 东西可视跨度（米）
const K = VW / SPAN;               // 米 → 画面像素
const ROT = -21 * Math.PI / 180;   // 路网旋转角：中山路大致竖直、汉中路/中山东路大致水平
const SQUASH = 0.78;               // 纵向压缩，做出俯视 2.5D 的透视感

function project(x, y) {
  const c = Math.cos(ROT), s = Math.sin(ROT);
  const rx = x * c - y * s, ry = x * s + y * c;
  return [VW / 2 + rx * K, VH / 2 + ry * K * SQUASH];
}
// 归一化（menubg.js 用 0–1 坐标，D.w/D.h 是拍摄尺寸）
const nx = (x, y) => project(x, y)[0] / VW;
const ny = (x, y) => project(x, y)[1] / VH;

// ---------- 路网 ----------
// 主干道（现实中的新街口十字）：中山北路 / 中山路（南北）、汉中路 / 中山东路（东西）
// 坐标是「沿路方向、横向偏移」→ 世界坐标，简化建模，够画出放射格局。
const ARTERIES = [
  { name: '中山北路', from: [70, -3100], to: [0, -60], w: 74 },
  { name: '中山路', from: [0, 60], to: [-190, 3200], w: 74 },
  { name: '汉中路', from: [-3400, -60], to: [-60, 0], w: 70 },
  { name: '中山东路', from: [60, 0], to: [3500, 90], w: 70 },
];
// 次干道与支路：一圈圈方格（近似南京老城的棋盘街巷）
const GRID = [];
for (let gx = -3600; gx <= 3600; gx += 170) GRID.push({ from: [gx, -2900], to: [gx + 20, 2900], w: 13, minor: true });
for (let gy = -2800; gy <= 2800; gy += 150) GRID.push({ from: [-3600, gy], to: [3600, gy + 15], w: 13, minor: true });
// 环新街口广场的一圈（新街口是环岛 + 十字，现实中孙中山铜像在中心）
const RING = [];
for (let i = 0; i <= 48; i++) {
  const a = i / 48 * Math.PI * 2;
  RING.push([Math.cos(a) * 190, Math.sin(a) * 190]);
}

// ---------- 水系：秦淮河（西南）与玄武湖（东北） ----------
const RIVER = [];
for (let i = 0; i <= 40; i++) {
  const t = i / 40;
  RIVER.push([-2500 + t * 1300, -1500 + t * 1500 + Math.sin(t * 3.1) * 260]);
}
const RIVER2 = [];
for (let i = 0; i <= 30; i++) {
  const t = i / 30;
  RIVER2.push([-1300 + t * 1500, 300 + t * 900 + Math.sin(t * 2.3) * 120]);
}

// ---------- 建筑：沿网格撒白色方块，越靠市中心越密 ----------
function rnd(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const R = rnd(20120601);
const buildings = [];
const xLines = [], yLines = [];
for (let gx = -3600; gx <= 3600; gx += 170) xLines.push(gx);
for (let gy = -2800; gy <= 2800; gy += 150) yLines.push(gy);
// 沿街建筑：每条街两侧各退让 26–40 m，沿街按 60–90 m 的段落排布
for (const gx of xLines) {
  for (let gy = -2800; gy <= 2800; gy += 58) {
    for (const side of [-1, 1]) {
      if (R() > 0.9) continue;
      const x = gx + side * (46 + R() * 18), y = gy + (R() - 0.5) * 16;
      const d = Math.hypot(x, y);
      if (d < 210) continue;
      const nearWater = [RIVER, RIVER2].some(r => r.some(q => Math.hypot(q[0] - x, q[1] - y) < 150));
      if (nearWater) continue;
      const bw = 34 + R() * 30, bh = 30 + R() * 26;
      const tall = d < 700 ? 9 + R() * 14 : d < 1300 ? 4 + R() * 8 : 2 + R() * 4;
      buildings.push({ x, y, bw, bh, tall, tone: R() });
    }
  }
}
for (const gy of yLines) {
  for (let gx = -3600; gx <= 3600; gx += 58) {
    for (const side of [-1, 1]) {
      if (R() > 0.9) continue;
      const x = gx + (R() - 0.5) * 16, y = gy + side * (46 + R() * 18);
      const d = Math.hypot(x, y);
      if (d < 210) continue;
      const nearWater = [RIVER, RIVER2].some(r => r.some(q => Math.hypot(q[0] - x, q[1] - y) < 150));
      if (nearWater) continue;
      const bw = 34 + R() * 30, bh = 30 + R() * 26;
      const tall = d < 700 ? 9 + R() * 14 : d < 1300 ? 4 + R() * 8 : 2 + R() * 4;
      buildings.push({ x, y, bw, bh, tall, tone: R() });
    }
  }
}
// 街区内的大院与零星建筑（让街区里不至于空成一片）
for (let gx = -3600; gx <= 3600; gx += 340) {
  for (let gy = -2800; gy <= 2800; gy += 300) {
    for (let k = 0; k < 3; k++) {
      if (R() > 0.45) continue;
      const x = gx + 170 + (R() - 0.5) * 120, y = gy + 150 + (R() - 0.5) * 100;
      const d = Math.hypot(x, y);
      if (d < 240) continue;
      const nearWater = [RIVER, RIVER2].some(r => r.some(q => Math.hypot(q[0] - x, q[1] - y) < 160));
      if (nearWater) continue;
      const bw = 34 + R() * 30, bh = 30 + R() * 26;
      const tall = d < 700 ? 8 + R() * 12 : 2 + R() * 5;
      buildings.push({ x, y, bw, bh, tall, tone: R() });
    }
  }
}

// ---------- 生成 SVG 底图 ----------
function svg(theme) {
  const dark = theme === 'dark';
  const C = dark ? {
    bg: '#0d1219', land: '#121821', block: '#1b2432', blockEdge: '#334055', blockTop: '#263140',
    road: '#242d3a', roadCore: '#38455c', major: '#2c3646', majorCore: '#4e5f7c',
    water: '#16324a', waterEdge: '#1c3d59', green: '#1a2c26', greenEdge: '#20362d', ring: '#4a5872',
  } : {
    bg: '#dfe4e9', land: '#eae9e4', block: '#ffffff', blockEdge: '#aebdd1', blockTop: '#ffffff',
    road: '#ccd7e6', roadCore: '#eef3f9', major: '#becbdd', majorCore: '#fbfdff',
    water: '#a8cde9', waterEdge: '#8fbfe0', green: '#cfe4cd', greenEdge: '#b2d0b1', ring: '#f4f7fa',
  };
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}" preserveAspectRatio="xMidYMid slice">`);
  out.push(`<defs>
    <radialGradient id="vig" cx="50%" cy="46%" r="78%">
      <stop offset="0%" stop-color="${dark ? '#1b2432' : '#ffffff'}" stop-opacity="${dark ? '0.35' : '0.5'}"/>
      <stop offset="55%" stop-color="${dark ? '#141a25' : '#eef2f7'}" stop-opacity="${dark ? '0.1' : '0.12'}"/>
      <stop offset="100%" stop-color="${C.bg}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.bg}" stop-opacity="${dark ? '0.5' : '0.35'}"/>
      <stop offset="30%" stop-color="${C.bg}" stop-opacity="0"/>
      <stop offset="72%" stop-color="${C.bg}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${C.bg}" stop-opacity="${dark ? '0.6' : '0.5'}"/>
    </linearGradient>
  </defs>`);
  out.push(`<rect width="${VW}" height="${VH}" fill="${C.bg}"/>`);
  out.push(`<rect width="${VW}" height="${VH}" fill="${C.land}" opacity="${dark ? 1 : 1}"/>`);

  // 水面
  const RW = 130 * K;   // 秦淮河约 120–150 m 宽
  const poly = (pts, fill, opacity) => {
    const d = pts.map(p => project(p[0], p[1])).map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    out.push(`<path d="${d}" fill="none" stroke="${C.waterEdge}" stroke-width="${(RW + 6).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${fill}" stroke-width="${RW.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`);
  };
  // 支路（细）
  for (const g of GRID) {
    const [x1, y1] = project(g.from[0], g.from[1]), [x2, y2] = project(g.to[0], g.to[1]);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.road}" stroke-width="${(g.w * K * 0.9).toFixed(1)}" stroke-linecap="round"/>`);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.roadCore}" stroke-width="${(g.w * K * 0.45).toFixed(1)}" stroke-linecap="round"/>`);
  }
  // 主干道（宽）
  for (const a of ARTERIES) {
    const [x1, y1] = project(a.from[0], a.from[1]), [x2, y2] = project(a.to[0], a.to[1]);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.major}" stroke-width="${(a.w * K * 1.05).toFixed(1)}" stroke-linecap="round"/>`);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.majorCore}" stroke-width="${(a.w * K * 0.72).toFixed(1)}" stroke-linecap="round"/>`);
  }
  // 建筑（2.5D）：四角按世界坐标投影，所以朝向与街道一致；再向下拽出侧面做出高度
  buildings.sort((a, b) => (a.y + a.x) - (b.y + b.x));
  const quad = function (b, rise) {
    const hw = b.bw / 2, hh = b.bh / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (d) {
      const p = project(b.x + d[0], b.y + d[1]);
      return [p[0], p[1] + rise];
    });
  };
  const path4 = function (q) { return 'M' + q.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L') + ' Z'; };
  for (const b of buildings) {
    const top = quad(b, -b.tall);        // 顶面上移（高度）
    const base = quad(b, 0);             // 落地
    // 侧面：把顶面四角与落地四角连成两条侧边带（只画朝右下的一侧，够看出体积）
    out.push(`<path d="${path4([top[3], top[2], base[2], base[3]])}" fill="${C.blockEdge}"/>`);
    out.push(`<path d="${path4([top[1], top[2], base[2], base[1]])}" fill="${C.blockEdge}" opacity="0.75"/>`);
    out.push(`<path d="${path4(top)}" fill="${C.blockTop}" stroke="${C.blockEdge}" stroke-width="0.55"/>`);
  }

  // 支路（细）
  for (const g of GRID) {
    const [x1, y1] = project(g.from[0], g.from[1]), [x2, y2] = project(g.to[0], g.to[1]);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.road}" stroke-width="${(g.w * K * 0.9).toFixed(1)}" stroke-linecap="round"/>`);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.roadCore}" stroke-width="${(g.w * K * 0.45).toFixed(1)}" stroke-linecap="round"/>`);
  }
  // 主干道（宽）
  for (const a of ARTERIES) {
    const [x1, y1] = project(a.from[0], a.from[1]), [x2, y2] = project(a.to[0], a.to[1]);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.major}" stroke-width="${(a.w * K * 1.05).toFixed(1)}" stroke-linecap="round"/>`);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.majorCore}" stroke-width="${(a.w * K * 0.72).toFixed(1)}" stroke-linecap="round"/>`);
  }
  poly(RIVER, C.water, 1);
  poly(RIVER2, C.water, 1);
  // 玄武湖（东北角）
  const lake = project(1500, -1500);
  out.push(`<ellipse cx="${lake[0].toFixed(0)}" cy="${lake[1].toFixed(0)}" rx="${(420 * K).toFixed(0)}" ry="${(300 * K * SQUASH).toFixed(0)}" fill="${C.water}" stroke="${C.waterEdge}" stroke-width="3" opacity="0.95"/>`);

  // 公园
  const park = (x, y, r) => {
    const p = project(x, y);
    out.push(`<ellipse cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" rx="${(r * K).toFixed(0)}" ry="${(r * K * SQUASH).toFixed(0)}" fill="${C.green}" stroke="${C.greenEdge}" stroke-width="2"/>`);
  };
  park(-900, -900, 230); park(700, 900, 190); park(-1600, 1100, 210); park(1900, -300, 160);

  // 新街口环岛
  const ringPts = RING.map(p => project(p[0], p[1]));
  out.push(`<path d="${ringPts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')} Z" fill="none" stroke="${C.major}" stroke-width="${(46 * K).toFixed(1)}"/>`);
  out.push(`<path d="${ringPts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')} Z" fill="none" stroke="${C.ring}" stroke-width="${(30 * K).toFixed(1)}"/>`);
  out.push(`<ellipse cx="${(VW / 2).toFixed(0)}" cy="${(VH / 2).toFixed(0)}" rx="${(155 * K).toFixed(0)}" ry="${(155 * K * SQUASH).toFixed(0)}" fill="${C.green}" stroke="${C.greenEdge}" stroke-width="2"/>`);

  out.push(`<rect width="${VW}" height="${VH}" fill="url(#vig)"/>`);
  out.push(`<rect width="${VW}" height="${VH}" fill="url(#fade)"/>`);
  out.push('</svg>');
  return out.join('\n');
}

// ---------- 轨迹数据（menubg-data.js） ----------
// 采样折线 → { p: 万分比坐标, w: 沿线距离(0.01 格) }
function track(points) {
  const p = [], w = [];
  let d = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    p.push(Math.round(nx(x, y) * 10000), Math.round(ny(x, y) * 10000));
    if (i) d += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]);
    w.push(Math.round(d / 4));           // 米 → 0.01 格（1 格 = 250 m）
  }
  return { p, w };
}
// 沿一条折线取站点位置（按世界坐标最近点）
function stationOn(pts, w, x, y) {
  let best = 0, bd = 1e18;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - x, pts[i][1] - y); if (d < bd) { bd = d; best = i; } }
  return w[best];
}

// 1 号线：南北（鼓楼—珠江路—新街口—张府园—三山街），蓝
const L1 = [[-180, -2300], [-90, -1500], [-40, -800], [-10, -260], [0, 0], [20, 300], [40, 700], [20, 1200], [-60, 1800], [-120, 2400]];
// 2 号线：东西（汉中门—上海路—新街口—大行宫—西安门），红
const L2 = [[-2400, -60], [-1600, -40], [-900, 0], [-360, 0], [0, 0], [380, 10], [900, 40], [1600, 60], [2300, 80]];

const t1 = track(L1), t2 = track(L2);
const data = {
  // ss：把「每格像素」折回原版广州封面的量级（1 格约 10 px），列车与车流才不会糊成一片
  v: 1, w: VW * 2, h: VH * 2, ss: 0.26,
  lines: [
    { ...t1, c: '#2f7fbe', st: [stationOn(L1, t1.w, -40, -800), stationOn(L1, t1.w, -10, -260), stationOn(L1, t1.w, 0, 0), stationOn(L1, t1.w, 40, 700), stationOn(L1, t1.w, 20, 1200)] },
    { ...t2, c: '#c94b5a', st: [stationOn(L2, t2.w, -900, 0), stationOn(L2, t2.w, -360, 0), stationOn(L2, t2.w, 0, 0), stationOn(L2, t2.w, 380, 10), stationOn(L2, t2.w, 900, 40)] },
  ],
  roads: [],
};
// 车流道路：主干道（k=4 快速）与网格支路（k=1）
for (const a of ARTERIES) {
  const pts = [a.from, [ (a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2 ], a.to];
  const t = track(pts);
  data.roads.push({ ...t, k: 4 });
}
for (const g of GRID) {
  const t = track([g.from, g.to]);
  data.roads.push({ ...t, k: 1 });
}

await mkdir(OUT_IMG, { recursive: true });
await writeFile(path.join(OUT_IMG, 'menu-bg-nj-light.svg'), svg('light'));
await writeFile(path.join(OUT_IMG, 'menu-bg-nj-dark.svg'), svg('dark'));
const file = "'use strict';\n"
  + '// 主菜单背景动画层的轨迹（v3.57）：南京新街口周边，与 img/menu-bg-nj-*.svg 同一套投影。\n'
  + '// p 为画面坐标（万分比），w 为沿线世界距离（百分之一格），st 为各站位置；lines 是 1、2 号线的示意段，roads 是主干道与街巷。\n'
  + '// 由 tools/make-menubg-nj.mjs 生成，改动请改脚本后重跑。\n'
  + 'window.CM = window.CM || {};\n'
  + 'CM.MENU_BG_DATA = ' + JSON.stringify(data) + ';\n';
await writeFile(path.join(ROOT, 'js/menubg-data.js'), file);

console.log('建筑 ' + buildings.length + ' 栋；1 号线 ' + L1.length + ' 点、2 号线 ' + L2.length + ' 点；车流道路 ' + data.roads.length + ' 条');
console.log('输出 ' + path.join(OUT_IMG, 'menu-bg-nj-light.svg') + ' / -dark.svg');
console.log('输出 ' + path.join(ROOT, 'js/menubg-data.js'));
