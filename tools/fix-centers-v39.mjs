// 按高德卫星影像识别结果修正和县五处建成区（v3.9）：
// 乌江镇区、乌江化工园、郑蒲港现代产业园、姥桥镇区、和县经济开发区。
// 做法：区域内原有 centers 全部移除，改用影像识别的格集合重建，区域内总人口/岗位保持不变。
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const DATA = ROOT + '/city-and-metro/js/data_ms.js';
const DRY = process.env.DRY === '1';

const load = async (p) => JSON.parse(await readFile(p, 'utf8'));
const wuj = await load(ROOT + '/tools/sat-scan-wujiang.json');
const zpg = await load(ROOT + '/tools/sat-scan-zpg.json');
const edz = await load(ROOT + '/tools/sat-scan-edz.json');

const builtOf = (scan, x0, x1, y0, y1, thr) => {
  const [lpMin, gpMax] = thr || [0.30, 0.88];
  const s = new Set();
  for (const c of scan.cells) {
    if (!(c[7] > lpMin && c[6] < gpMax)) continue;   // 按阈值重判（不使用扫描时的默认判定）
    if (c[0] >= x0 && c[0] < x1 && c[1] >= y0 && c[1] < y1) s.add(c[0] + ',' + c[1]);
  }
  return s;
};

// 形态学清理：去掉 4 邻域建成格不足 2 个的边缘锯齿（工业连片区几乎不受影响，孤立溢出格被剔除）
const smooth = (set) => {
  const out = new Set();
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (set.has((x + dx) + ',' + (y + dy))) n++;
    if (n >= 2) out.add(k);
  }
  return out;
};

// 目标格集合（影像识别 + 分区阈值：城镇亮面判据从严，工业厂房屋顶偏暗需放宽）
const ZONES = [
  {
    id: 'wuj', name: '乌江镇区', box: [240, 253, 82, 97], thr: [0.45, 0.78],
    target: builtOf(wuj, 240, 253, 82, 97, [0.45, 0.78]),
    core: [246.5, 90.0], perCell: 8000, popShare: 0.85,
  },
  {
    id: 'chem', name: '乌江化工园', box: [236, 252, 99, 114], thr: [0.38, 0.82],
    target: builtOf(wuj, 236, 252, 99, 114, [0.38, 0.82]),
    core: [244, 106.5], perCell: 7000, popShare: 0.32,
  },
  {
    id: 'zpg', name: '郑蒲港现代产业园', box: [187, 205, 179, 199], thr: [0.30, 0.88],
    target: builtOf(zpg, 187, 205, 179, 199, [0.30, 0.88]),
    core: [197, 186.5], perCell: 6500, popShare: 0.5,
  },
  {
    id: 'lq', name: '姥桥镇区', box: [179, 191, 200, 211],
    // 影像对老旧灰瓦屋顶不敏感，按目视轮廓手工给定（x182-187, y203-207）
    target: new Set(['182,204', '183,204', '184,204', '185,204', '186,204',
      '182,205', '183,205', '184,205', '185,205', '186,205',
      '183,206', '184,206', '185,206', '186,206', '184,207', '185,207']),
    core: [184.5, 205.5], perCell: 8000, popShare: 0.85,
  },
  {
    id: 'edz', name: '和县经开区', box: [200, 216, 129, 147], thr: [0.42, 0.80],
    target: builtOf(edz, 200, 216, 129, 147, [0.42, 0.80]),
    core: [208, 139], perCell: 7000, popShare: 0.4,
  },
];

const src = await readFile(DATA, 'utf8');
const m = src.match(/\ncenters: \[\n([\s\S]*?)\n    \],\n/);
if (!m) throw new Error('找不到 centers 段');
const block = m[1];
const rows = [...block.matchAll(/^\s*\{ x: ([\d.]+), y: ([\d.]+), pop: (\d+), jobs: (\d+), r: ([\d.]+) \},$/gm)]
  .map(x => ({ x: +x[1], y: +x[2], pop: +x[3], jobs: +x[4], r: +x[5] }));
if (!rows.length) throw new Error('centers 行解析失败: ' + block.slice(0, 120));

const inBox = (c, [x0, x1, y0, y1]) => c.x >= x0 && c.x < x1 && c.y >= y0 && c.y < y1;

// 1. 统计各区域原有总量
const report = [];
for (const z of ZONES) {
  if (z.id !== 'lq') z.target = smooth(z.target);   // 姥桥为手工轮廓，不做腐蚀
  const old = rows.filter(c => inBox(c, z.box));
  z.oldCells = old;
  z.oldPop = old.reduce((s, c) => s + c.pop, 0);
  z.oldJobs = old.reduce((s, c) => s + c.jobs, 0);
  z.targetArr = [...z.target];
  report.push(`${z.name}: 原有 ${old.length} 格 (pop ${z.oldPop}, jobs ${z.oldJobs}) → 目标 ${z.targetArr.length} 格`);
}
console.log('=== 修正计划 ===');
report.forEach(r => console.log('  ' + r));

// 2. 生成新格
const newCenters = [];
for (const z of ZONES) {
  const n = z.targetArr.length;
  if (!n) { console.log(`  跳过 ${z.name}：目标为空`); continue; }
  // 人口口径：建成区判定要求 (pop+jobs)*f*w*af > 2600，按每格目标反推总量
  // perCell 为「每格 pop+jobs 的原始值」，popShare 决定居住/就业比例
  const usePop = z.perCell * z.popShare * n;
  const useJobs = z.perCell * (1 - z.popShare) * n;
  // 权重：距组团的中心越近越高（0.65 ~ 1.35）
  const ws = z.targetArr.map(k => {
    const [gx, gy] = k.split(',').map(Number);
    const d = Math.hypot(gx + 0.5 - z.core[0], gy + 0.5 - z.core[1]);
    return 0.65 + 0.7 * Math.exp(-(d * d) / (2 * 4.2 * 4.2));
  });
  const sumW = ws.reduce((a, b) => a + b, 0);
  z.targetArr.forEach((k, idx) => {
    const [gx, gy] = k.split(',').map(Number);
    newCenters.push({
      x: gx + 0.5, y: gy + 0.5,
      pop: Math.max(60, Math.round(usePop * ws[idx] / sumW)),
      jobs: Math.max(20, Math.round(useJobs * ws[idx] / sumW)),
      r: 0.09,
    });
  });
  console.log(`  ${z.name}: 生成 ${n} 格, pop 合计 ${Math.round(usePop)}, jobs 合计 ${Math.round(useJobs)}`);
}

// 3. 合并：删除所有落在任一区域 box 内的旧格，加入新格
const zonesBox = ZONES.map(z => z.box);
const kept = rows.filter(c => !zonesBox.some(b => inBox(c, b)));
console.log(`\n=== 合并 ===\n  原有 ${rows.length} 格，删除 ${rows.length - kept.length} 格，新增 ${newCenters.length} 格，合计 ${kept.length + newCenters.length}`);

const all = kept.concat(newCenters).sort((a, b) => a.y - b.y || a.x - b.x);
const fmt = v => Number.isInteger(v) ? String(v) : String(+v.toFixed(1));
const lines = ['centers: [',
  ...all.map(c => `      { x: ${fmt(c.x)}, y: ${fmt(c.y)}, pop: ${c.pop}, jobs: ${c.jobs}, r: ${c.r} },`),
  '    ],'].join('\n');
const out = src.replace(m[0], '\n' + lines + '\n');

if (DRY) {
  console.log('\n[DRY RUN] 未写入。前 6 条新格示例：');
  newCenters.slice(0, 6).forEach(c => console.log('   ', JSON.stringify(c)));
} else {
  await writeFile(DATA, out, 'utf8');
  console.log('\n已写入 data_ms.js');
}
