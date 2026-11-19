// 市区命名优先（v3.19）：给地名库补一个「命名类目」字段（places 行的第 5 项），
// 让 metro.js 能在市区优先用【城市路名 / 大型商场 / 大学·学校】，而不是小区名和口袋公园。
//
//   1 = 城市路名（高德 geo 类目 + OSM 命名道路中真正的路/大道/街/桥）
//   2 = 大型商场 / 商业中心
//   3 = 真实公交站名（补充项，低优先，只作兜底）
//   4 = 大学 / 学校 / 文化场馆
//
// 同时追加一批真实马鞍山公交站名（tools/urban-names-ms.json，坐标取自高德 POI）。
// 幂等：类目每次按规则重算，追加项按名字去重；重复执行结果一致。
// 注意：rebuild-places.mjs 会重建地名库，跑过它之后必须再跑本脚本和 add-village-names.mjs。
// 用法：node tools/add-urban-names.mjs
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const DEV = ROOT + '/city-and-metro/js/geo_ms.js';
const DEP = ROOT + '/马鞍山地图/city-and-metro/js/geo_ms.js';

// ---- 规则 ----
// 路名的字形特征（只看「长得像路名」还不够，还要在真实道路清单里出现过，避免把「韩巷」「魏杨街」这类村名当路）
const ROAD_SHAPE = /路$|大道$|大街$|街$|巷$|桥$/;
const ROAD_BAD = /高速|绕城|互通|匝道|收费站|服务区|清障|救援/;
// 大型商场 / 商业中心（马鞍山市区实际在营的主力店）
const MALLS = new Set(['万达广场', '大华国际广场', '八佰伴', '金鹰天地广场街区', '鸿泰新百', '莱迪购物广场', '团结广场', '金鹰天地', '华联商厦', '花山商厦']);
// 现有的地名条目里，名字本身就是学校 / 文化场馆的，直接归到第 4 类
const LANDMARK4 = new Set(['新三馆', '马鞍山二中外国语分校', '马鞍山实验小学', '工人文化宫', '马鞍山市工人文化宫']);
// 位置固定的追加项（真实公交站名，坐标取自高德）；格式 [名字, x, y, 类型, 类目]
const EXTRA = JSON.parse(await readFile(ROOT + '/tools/urban-names-ms.json', 'utf8'));
// 退役条目：改过名或被判定不适合当站名的旧追加项（v3.20 起按专名 ≤7 字重命名汽车站）
const DROP = new Set(['马鞍山长途汽车站']);

// 剧本（data_ms / data_ms2027）里被引用的地名：挑战锚点、任务与设施按名字定位，不能删
globalThis.__refs = new Set();
for (const f of ['/city-and-metro/js/data_ms.js', '/city-and-metro/js/data_ms2027.js']) {
  const src = await readFile(ROOT + f, 'utf8');
  for (const m of src.matchAll(/['"]([\u4e00-\u9fa5A-Za-z0-9·\-]{2,20})['"]/g)) globalThis.__refs.add(m[1]);
}
console.log('剧本引用名', globalThis.__refs.size, '个（清洗时保护）');

// ---- 真实道路清单 ----
const amap = JSON.parse(await readFile(ROOT + '/tools/amap-places.json', 'utf8'));
const roadNames = new Set();
for (const p of amap.pois) if (p.g === 'geo' && ROAD_SHAPE.test(p.n) && !ROAD_BAD.test(p.n)) roadNames.add(p.n);
for (const row of JSON.parse(await readFile(ROOT + '/tools/road-names.json', 'utf8'))) {
  const n = row[0];
  if (ROAD_SHAPE.test(n) && !ROAD_BAD.test(n)) roadNames.add(n);
}
console.log('真实道路名清单', roadNames.size, '条');

// 高德归到「住宅小区 / 住宅区 / 公寓 / 商住楼」的名字：按命名规则不能当站名（楼盘），
// 但 type 1/2 的那些还要留给地图标注层，所以不删、只打类目 9（metro.js 见到 9 直接跳过）
const HOME_NAMES = new Set(amap.pois.filter(p => p.g === 'home').map(p => p.n));
console.log('高德住宅类名', HOME_NAMES.size, '个');

// ---- 清洗：把永远当不了站名的条目从地名库里删掉（v3.20.1）----
// 这些名字既不合规（超长 / 带外文 / 只有通名 / 院校内部单位），又会被游戏内的地名搜索翻出来，
// 玩家搜「大学」会看到「安徽工业大学马克思主义学院」这种。type 1/2 是地图标注层用的聚落与道路名，不动。
// 被剧本锚点引用的名字一律保留（economy.js 的挑战锚点按地名定位）。
const BARE = /^(博物馆|图书馆|美术馆|文化馆|展览馆|纪念馆|艺术馆|科技馆|会展中心|会议中心|体育馆|体育中心|大剧院|广场|公园|档案馆|陈列馆|展示馆|规划展示馆|文化中心|体育场|中心|县政府|市政府)$/;
const ADMIN_GENERIC = /^[市县区省]?(博物馆|图书馆|文化馆|美术馆|体育馆|体育中心|人民医院|中医院|档案馆|文化馆|体育场)$/;
const SUBUNIT = /马克思|列宁|毛泽东思想|教研室|实验室|教学楼|阶梯教室|南北教|报告厅|食堂|宿舍|创新创业|实训|车间|厂区|办公楼|综合楼|门诊楼|住院部/;
const cleanWhy = (n, t) => {
  if (t < 3) return null;                       // type 1/2 是标注层的地名，不动
  if (BARE.test(n)) return '裸通名';
  if (ADMIN_GENERIC.test(n)) return '行政级别+通名';
  if (SUBUNIT.test(n)) return '院校或单位内部设施';
  if (/[A-Za-z]/.test(n)) return '含外文';
  if (n.length > 7) return '超长';
  if (/^[\u4e00-\u9fa5](公园|游园|广场)$/.test(n)) return '通名残名';
  return null;
};

const classify = (n, t) => {
  if (HOME_NAMES.has(n)) return 9;               // 楼盘：只做地图标注，不参与取名
  // 口袋公园这类琐碎地物不配当站名：降为 type 3（取名时排最后），名字仍可搜索
  if (/口袋公园/.test(n)) return 0;
  if (MALLS.has(n)) return 2;
  if (LANDMARK4.has(n)) return 4;
  if (t === 2 && roadNames.has(n) && ROAD_SHAPE.test(n) && !ROAD_BAD.test(n)) return 1;
  // 高德道路类目里的「XX 路」即使不在 OSM 命名道路里，也是真路
  if (t === 2 && ROAD_SHAPE.test(n) && !ROAD_BAD.test(n) && amap.pois.some(p => p.n === n && p.g === 'geo')) return 1;
  return 0;
};
const demote = (n, t) => (/口袋公园/.test(n) ? 3 : t);

// ---- 处理一份 geo_ms.js ----
async function patch(file, isMain) {
  const text = await readFile(file, 'utf8');
  const i0 = text.lastIndexOf('places: [');
  if (i0 < 0) throw new Error('找不到 places 段: ' + file);
  const start = text.indexOf('[', i0);
  let depth = 0, end = -1;
  for (let k = start; k < text.length; k++) {
    const c = text[k];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end < 0) throw new Error('places 段括号不匹配: ' + file);
  let places = JSON.parse(text.slice(start, end + 1));
  const dropped = places.length;
  places = places.filter(p => !DROP.has(p[0]));
  const nDrop = dropped - places.length;
  // 清洗永远当不了站名的条目
  const refs = globalThis.__refs;
  const cleanTier = {};
  let nClean = 0;
  places = places.filter(p => {
    const why = cleanWhy(p[0], p[3]);
    if (!why || refs.has(p[0])) return true;
    cleanTier[why] = (cleanTier[why] || 0) + 1; nClean++;
    return false;
  });

  // EXTRA 是权威表：同名条目的类型与类目以它为准（v3.20 起「团结广场」按城市广场算，不再是商场）
  const byName = new Map();
  for (const row of EXTRA) byName.set(row[0], row);
  const tier = {};
  for (const p of places) {
    const e = byName.get(p[0]);
    p[3] = e ? e[3] : demote(p[0], p[3]);
    const cls = e ? (e[4] || 0) : classify(p[0], p[3]);
    if (cls) { p[4] = cls; tier[cls] = (tier[cls] || 0) + 1; }
    else if (p.length > 4) p.length = 4;   // 清掉上一轮写入的旧类目
  }

  // 追加真实公交站名（两份都补，幂等）
  let added = 0;
  const have = new Set(places.map(p => p[0]));
  for (const [n, x, y, t, cls] of EXTRA) {
    if (have.has(n)) continue;
    places.push(cls ? [n, +x.toFixed(2), +y.toFixed(2), t, cls] : [n, +x.toFixed(2), +y.toFixed(2), t]);
    have.add(n); added++;
  }
  // 类目按名字兜底（追加项缺类目时补上）
  for (const p of places) if (p.length === 4 && byName.has(p[0])) { const c = byName.get(p[0])[4]; if (c) p[4] = c; }

  const out = text.slice(0, start) + JSON.stringify(places) + text.slice(end + 1);
  await writeFile(file, out, 'utf8');
  return { file, places: places.length, tier, added, nDrop, nClean, cleanTier };
}

const r1 = await patch(DEV, true);
const r2 = await patch(DEP, true);   // 两份都补，保证单独跑打包目录时也不会缺
console.log('开发目录', r1.places, '条，类目', JSON.stringify(r1.tier), '新增', r1.added, '退役', r1.nDrop, '清洗', r1.nClean, JSON.stringify(r1.cleanTier));
console.log('部署目录', r2.places, '条，类目', JSON.stringify(r2.tier), '新增', r2.added, '退役', r2.nDrop, '清洗', r2.nClean, JSON.stringify(r2.cleanTier));
await writeFile(ROOT + '/tools/places-clean-report.json', JSON.stringify({
  generated: 'v3.20.1',
  places: r1.places,
  tier: r1.tier,
  cleanedThisRun: r1.cleanTier,
  history: { 'v3.20.1': { dropped: 866, byReason: { 超长: 789, 含外文: 48, 院校或单位内部设施: 12, 裸通名: 10, '行政级别+通名': 5, 通名残名: 2 } } },
  note: 'type 1/2 是地图标注层的聚落与道路名，不参与清洗；被剧本引用的地名一律保留；类目 9 为住宅楼盘（只标注、不取名）',
}, null, 1) + '\n', 'utf8');
