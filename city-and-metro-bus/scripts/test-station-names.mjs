// 站名派生规则测试（v3.20）：按现实《轨道交通车站命名规则》的口径校验自动站名——
// 片区地名（村镇）> 标志性公共场所 > 道路名，不用楼盘、企业字号、商业设施名，专名 2~7 字、无标点。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
for (const [, src] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
  if (src === 'js/save.js') break;
}
const C = context.CM;
C.UI = function () {};
C.useMap('ms');
const g = C.Game.create({ mode: 'free', seed: 20270101 });
const city = g.city, D = C.DATA;

// 采样：每个点单独一张网，避免同名去重干扰统计
const sample = (city, x0, x1, y0, y1, step) => {
  const out = [];
  for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) {
    if (!C.Metro.checkSite(city, x, y, 'underground').ok) continue;
    out.push({ x: x, y: y, n: C.Metro.suggestName(C.Metro.empty(), x, y, city), rg: city.regionAt(x, y) });
  }
  return out;
};

// 1. 市区标记与命名类目
const urban = D.regions.filter(r => r.urban).map(r => r.id);
assert.equal(urban.length, 9, 'urban 片区: ' + urban.join(','));
for (const id of ['dtc', 'hx', 'hs', 'bw']) assert.ok(!urban.includes(id), id + ' 不应是市区片区');
const cls = {};
for (const p of D.places) cls[p[5] || 0] = (cls[p[5] || 0] || 0) + 1;
assert.ok(cls[1] > 500, '路名类地名: ' + cls[1]);
assert.ok(cls[2] >= 5, '商业设施: ' + cls[2]);
assert.ok(cls[5] >= 2 && cls[6] >= 1, '枢纽与公共开放空间: ' + [cls[5], cls[6]]);
console.log('类目分布', JSON.stringify(cls));

// 2. 关键地物：站正落在上面时取该名（2000 与 2027 两个剧本都要过）
const KEY = [['解放路', 261.31, 161.07], ['湖东路', 262.68, 168.28], ['团结广场', 262.9, 168.9],
  ['采石矶景区', 242.6, 180.8], ['安工大佳山校区', 262.9, 165.8], ['长途汽车站', 259.5, 160.3]];
for (const [want, x, y] of KEY) assert.equal(C.Metro.suggestName(C.Metro.empty(), x, y, city), want, '2000 站位在 ' + want);
C.useMap('ms27');
const g27 = C.Game.create({ mode: 'free', seed: 20270101 });
const city27 = g27.city, D27 = C.DATA;
for (const [want, x, y] of KEY) assert.equal(C.Metro.suggestName(C.Metro.empty(), x, y, city27), want, '2027 站位在 ' + want);
// 2027 的建成区更大，抽查原先出问题的那几片（南家甸湿地、第四医院、图灵小镇）
for (const [x, y] of [[262.89, 225.33], [273, 191], [280, 190], [268, 214]]) {
  const n = C.Metro.suggestName(C.Metro.empty(), x, y, city27);
  assert.ok(n.length <= 7, '2027 站名超长: ' + n);
}

// 3. 全图取样：专名用字与禁用项
const CORE = sample(city, 250, 282, 156, 192, 2);      // 市区核心
const COUNTY = sample(city, 248, 268, 220, 238, 2);    // 当涂县城
const RURAL = sample(city, 196, 214, 148, 168, 2);     // 和县历阳
const CORE27 = sample(city27, 250, 282, 156, 192, 2);
const all = CORE.concat(COUNTY, RURAL, CORE27);
assert.ok(CORE.length > 120 && COUNTY.length > 30 && RURAL.length > 30 && CORE27.length > 120, '取样点数: ' + [CORE.length, COUNTY.length, RURAL.length].join('/'));
const bad = [];
for (const s of all) {
  if (s.n.length < 2 || s.n.length > 8) bad.push(s.n + '(长度)');
  if (/[·・+\-—、，。()（）\/\\|｜]/.test(s.n) && !/站$/.test(s.n)) bad.push(s.n + '(标点)');
  if (/小区|花园$|家园$|公馆|公寓|别墅|庄园$|山庄$|苑$|[一二三四五六七八九十]村$/.test(s.n)) bad.push(s.n + '(楼盘)');
  if (/有限公司|公司$|集团|厂$|银行|证券|口腔|超市|传媒|食品|钢构/.test(s.n)) bad.push(s.n + '(企业)');
  if (/^[市县区省](博物馆|图书馆|文化馆|美术馆|体育馆|人民医院|中医院)$/.test(s.n)) bad.push(s.n + '(无专名)');
  if (/马克思|教研室|实验室|教学楼|阶梯教室|创新创业/.test(s.n)) bad.push(s.n + '(院校内部单位)');
  if (/[A-Za-z]/.test(s.n)) bad.push(s.n + '(外文)');
  if (/\d/.test(s.n) && !/站$/.test(s.n)) bad.push(s.n + '(数字)');   // 「XX县城1站」是引擎兜底，允许序号
}
assert.equal(bad.length, 0, '不合规站名: ' + bad.slice(0, 10).join(', '));

// 4. 命名来源分布：市区应以路名与公共场所为主，县城以路名与片区地名为主
const KIND = n => {
  if (/(路|大道|大街|街|巷|桥|渡|矶)$/.test(n)) return 'road';
  if (/(公园|游园|景区|寺|庵|庙|教堂|塔|遗址|博物馆|图书馆|美术馆|体育馆|体育场|大剧院|中心|大学|学院|校区|党校|医院|车站|码头|港)$/.test(n)) return 'facility';
  if (/(镇|乡|村|社区|庄|山|湖|河|塘|湾|岗|洲)$/.test(n)) return 'place';
  return 'other';
};
const dist = list => {
  const c = { road: 0, facility: 0, place: 0, other: 0 };
  for (const s of list) c[KIND(s.n)]++;
  return c;
};
const dc = dist(CORE), dk = dist(COUNTY);
console.log('市区', JSON.stringify(dc), '县城', JSON.stringify(dk));
assert.ok(dc.road / CORE.length >= 0.5, '市区路名占比 ' + (dc.road / CORE.length * 100).toFixed(0) + '%（应 ≥ 50%）');
assert.ok(dc.place / CORE.length <= 0.25, '市区村名占比过高 ' + (dc.place / CORE.length * 100).toFixed(0) + '%');
assert.ok((dk.road + dk.place) / COUNTY.length >= 0.6, '县城路名+片区占比 ' + ((dk.road + dk.place) / COUNTY.length * 100).toFixed(0) + '%');

// 5. 商业设施不再优先：万达广场旁的车站取路名，而不是商场名
const wd = C.Metro.suggestName(C.Metro.empty(), 259.6, 179.4, city);
assert.ok(!/万达/.test(wd), '商业设施不应优先: ' + wd);

// 6. 其他地图没有 urban 标记，照常取名
C.useMap('sh');
const g2 = C.Game.create({ mode: 'free', seed: 20270101 });
const sh = C.Metro.suggestName(C.Metro.empty(), 68, 68, g2.city);
assert.ok(sh && sh.length >= 2, '上海站名: ' + sh);
console.log('上海样例站名:', sh);

console.log('PASS station names: 片区/设施/道路派生，楼盘与企业名不进站名，商业设施不优先');
