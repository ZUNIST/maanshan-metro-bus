// 验证城市发展项目是否真的落进城市（v3.86）
// 不依赖线网：直接给 growMonth 喂一个 development 计划，看建成区/人口/岗位是否变化。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/maanshan-metro-repo/city-and-metro-bus/';
const scope = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout };
scope.window = scope; vm.createContext(scope);
const html = await readFile(ROOT + 'index.html', 'utf8');
for (const [, f] of html.matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(ROOT + f, 'utf8'), scope, { filename: f });
  if (f === 'js/city.js') break;
}
const CM = scope.CM, U = CM.U;
CM.useMap('ms');
const city = new CM.City();
const YEAR = 2030;
city.generate(19800101, YEAR);

const LU = CM.LU;
// 找一片「生地与既有城区混合」的窗口，模拟开发区选址
const W = city.W, H = city.H;
let best = null;
for (let y = 20; y + 8 < H; y += 6) {
  for (let x = 20; x + 12 < W; x += 6) {
    let rural = 0, built = 0;
    for (let j = y; j <= y + 7; j++) for (let i = x; i <= x + 11; i++) {
      const c = j * W + i, L = city.lu[c];
      if (L === LU.RURAL) rural++;
      else if (city.pop[c] + city.jobs[c] > 200) built++;
    }
    const score = Math.min(rural, 40) + Math.min(built, 40);
    if (!best || score > best.score) best = { x, y, rural, built, score };
  }
}
const bounds = [best.x, best.y, best.x + 11, best.y + 7];
const cells = [];
for (let j = bounds[1]; j <= bounds[3]; j++) for (let i = bounds[0]; i <= bounds[2]; i++) {
  const c = j * W + i;
  if (city.landFrac[c] >= 0.5 && city.taken[c] < 0.5) cells.push(c);
}
console.log('选区', bounds.join(','), '内生地', best.rural, '既有城区格', best.built, '可用格', cells.length);

const snap = () => {
  let pop = 0, jobs = 0, ruralN = 0, streetN = 0;
  for (const c of cells) {
    pop += city.pop[c]; jobs += city.jobs[c];
    if (city.lu[c] === LU.RURAL) ruralN++;
    if (city.street[c]) streetN++;
  }
  return { pop, jobs, rural: ruralN, street: streetN };
};
const before = snap();
const total0 = city.totals();

// 模拟「就业开发」第一期的月预算：96 格 × 320 岗/格 × 25% ÷ 18 个月 ≈ 427/月
const run = (type, months, rate) => {
  let arm = 0;
  for (let m = 0; m < months; m++) {
    const year = YEAR + Math.floor(m / 12), monthIndex = m;
    const plan = {
      cells, bounds, type, renewal: false, workers: 20000, share: 0.22,
      popRate: type === 'jobs' ? 0 : rate, jobsRate: type === 'jobs' ? rate : 0,
      pop: 1e9, jobs: 1e9,
    };
    const r = city.growMonth({ year: year, monthIndex: monthIndex, zoneAccess: null, cellWalk: null, coverage: 0, econ: null, pull: null, development: plan });
    arm = r.newUrban || 0;
  }
  return arm;
};

const t0 = performance.now();
// 逐季采样，确认建成区是「一片片」长出来而不是整片突变
const series = [];
for (let q = 0; q < 6; q++) { run('jobs', 3, 427); const sn = snap(); series.push('M' + (q * 3 + 3) + ' 生地' + sn.rural + '/街区' + sn.street + '/岗位' + Math.round(sn.jobs)); }
console.log('就业分期：' + series.join(' | '));
const after = snap();
const total1 = city.totals();
console.log('就业 18 个月：选区岗位', Math.round(before.jobs), '->', Math.round(after.jobs),
  '| 选区人口', Math.round(before.pop), '->', Math.round(after.pop),
  '| 生地', before.rural, '->', after.rural, '| 铺街区', before.street, '->', after.street);
console.log('全城人口', Math.round(total0.pop), '->', Math.round(total1.pop), '| 全城岗位', Math.round(total0.jobs), '->', Math.round(total1.jobs));
console.log('耗时', ((performance.now() - t0) / 1000).toFixed(1) + 's');

// 居住项目：36 个月一期
const b2 = snap();
run('housing', 36, 280);
const a2 = snap();
console.log('居住 36 个月：选区人口', Math.round(b2.pop), '->', Math.round(a2.pop),
  '| 生地', b2.rural, '->', a2.rural, '| 铺街区', b2.street, '->', a2.street);
