// 用高德规范地名重建站名候选池，并把人口基底从「全域均摊」改为「城镇团块 + 乡村点状」。
// 前置：tools/amap-places.mjs 已生成 tools/amap-places.json；osm-cache/places.json 存在。
// 用法：node tools/rebuild-places.mjs
// 注意：本脚本会把地名库整个重建（丢掉命名类目与追加地名），跑完必须依次补跑
//       node tools/add-village-names.mjs    （村镇名 903 条）
//       node tools/add-urban-names.mjs      （市区路名 / 商场 / 学校类目，v3.19）
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const GEO = ROOT + '/city-and-metro/js/geo_ms.js';
const DATA = ROOT + '/city-and-metro/js/data_ms.js';
const METRO = ROOT + '/city-and-metro/js/metro.js';
const W = 416, H = 328;
const PR = { lon0: 117.835, lat0: 32.07, kx: 390.61, ky: 440.27 };
const toGrid = (lat, lon) => [(lon - PR.lon0) * PR.kx, (PR.lat0 - lat) * PR.ky];
const toLL = (x, y) => [PR.lat0 - y / PR.ky, PR.lon0 + x / PR.kx];

// 幂等：始终以首次运行前的原始文件为输入，重复执行不会产生叠加修改
const original = async (path, name) => {
  try { return await readFile(ROOT + '/tools/_pre_places/' + name, 'utf8'); }
  catch { return await readFile(path, 'utf8'); }
};

const amap = JSON.parse(await readFile(ROOT + '/tools/amap-places.json', 'utf8'));
const osm = JSON.parse(await readFile(ROOT + '/osm-cache/places.json', 'utf8'));
const osmEls = osm.elements || osm;
const rings = amap.rings;

function inside(lon, lat) {
  for (const r of rings) {
    let hit = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit;
    }
    if (hit) return true;
  }
  return false;
}
// 沈巷镇按和县的一部分处理（现行区划属芜湖，市界外），单独放行
const inScope = (x, y) => {
  if (x < 0 || x > W || y < 0 || y > H) return false;
  if (x >= 135 && x <= 180 && y >= 240 && y <= 300) return true;
  const [lat, lon] = toLL(x, y);
  return inside(lon, lat);
};

// 邻市地名、商业/机构/交通设施名：一律不作站名
const OUT_NAME = /南京|江宁|芜湖|巢湖|雨花台|镜湖|高淳|溧水|句容|全椒|浦口|鼓楼|建邺|栖霞|六合|江苏省|欢迎您|和县欢迎|马鞍山欢迎/;
const BAD_NAME = /交叉口|路口|出入口|门牌|停车场|加油站|收费站|服务区|有限公司|公司|厂|店|超市|酒店|宾馆|饭店|银行|营业厅|卫生间|公共厕所|ATM|项目部|售楼|物业|管理处|管委会|人民政府|村民委员会|社区居民委员会|居委会|委员会|派出所|党群|服务中心|警务|税务|工商|药店|药房|诊所|分公司|办事处|旗舰店|专卖店|体验店|展厅|候车亭|充电站|高速|互通|匝道|创意园|大厦|写字楼|产业园|工业园|科技|智能装备|新材料|精密制造|雕像|纪念碑|商务|枢纽|桥下|隧道口|公交站/;
const ADMIN_NAME = /^[\u4e00-\u9fa5]{2,6}(市|区|县)$/;
// 高德 POI 里混进的商业/服务业类目与名称：这类名字绝不能当站名
const AMAP_TYPE_DROP = new Set([
  '建材五金市场', '购物相关场所', '家电电子卖场', '网吧', '手机销售', '专营店',
  '自行车专卖店', '汽车配件销售', '汽车养护', '灯具瓷器市场', '果品市场',
  '农副产品市场', '休闲场所', '体育休闲服务场所', '口腔医院', '医疗保健服务场所',
  '垂钓园', '汽车销售', '汽车维修', '批发市场', '家具建材', '家电', '数码',
  '餐饮相关', '宾馆酒店', '娱乐场所', '生活服务场所', '事务所', '培训机构',
  '台球厅', '疗养院', '健身中心', '洗浴', '夜总会', '会所', '招待所',
]);
// 站名分级：地标（大学 / 博物馆 / 图书馆 / 科技馆 / 会展）优先于公共设施（公园 / 广场 / 景区 / 寺观 / 馆剧院），
// 再其次是道路与聚落，站名附属与住宅小区最末。type 5、6 供 metro.js 做「地标优先」两级取名。
const LANDMARK_TYPE = new Set(['高等院校', '图书馆', '博物馆', '科技馆', '美术馆', '纪念馆', '展览馆', '会展中心', '天文馆']);
// 只认「本身就是地标」的名字：以大学/学院/校区、博物馆、图书馆…结尾；学院里的楼、中心、实验室不算
const LANDMARK_NAME = /(大学|学院)([\u4e00-\u9fa5]{1,4}校区)?$|大学城$|博物馆$|图书馆$|科技馆$|美术馆$|纪念馆$|展览馆$|文化馆$|大剧院$|会展中心$|奥体中心$|体育中心$/;
const PUBLIC_TYPE = new Set(['公园', '城市广场', '风景名胜', '旅游景点', '寺庙道观', '教堂', '回教寺', '综合体育馆', '体育场馆', '剧场', '湖泊', '山', '档案馆']);
const PUBLIC_NAME = /公园$|广场$|景区$|风景区|寺$|庵$|教堂$|体育馆$|体育场$|剧院$|影院$|湖$|水库$|湿地/;

const BIZ_NAME = /建材|五金|市场|卖场|专卖|网吧|手机|轮胎|灯具|家具|装饰|汽配|养护|口腔|超市|便利|果品|批发|经营部|商贸|电器|通讯|美容|理发|洗浴|棋牌|KTV|健身|旅行社|宾馆|旅馆|饭店|烧烤|火锅|咖啡|茶饮|酒吧|珠宝|眼镜|服装|箱包|化妆|母婴|玩具|文具|烟酒|茶叶|粮油|生鲜|蔬菜|肉类|水产|熟食|糕点|摄影|打印|快递|物流|驾校|培训|宠物|维修|装潢|门窗|瓷砖|卫浴|窗帘|地板|油漆|电动车|摩托|证券|保险|事务所|垂钓|渔具|农资|饲料|兽药|废品|回收|加工|作坊|工作室|商行|合作社|卫生室|便民店|小卖部|加工点|摊位|夜市|商业街|步行街|购物中心|百货|时尚|地标|实践基地|招呼站|汽车站|客运站|卫生院|卫生所|疾控|防疫|纪念碑|雕像|雕塑|欢迎您|广告|标识牌|游客中心|售票处|检票|候车室|加油站|扫黄打非|法治文化|廉政|党建|双拥|文明创建|人口文化|计生|科普宣传|影城|电影院|国际影城|主题广场|老年大学|党校|行政学院|技师学院|技工学校|综合文化站|文化服务中心|文化活动中心|文化活动室|文化服务站|工会驿站|流动图书馆|悦书房|幼儿园|托儿所|亲子园|早教/;
const CLEAN = n => String(n || '').replace(/[（(][^）)]*[）)]/g, '').replace(/站前广场$/, '').trim();
// 政府机关：去掉机构后缀，留下地名本体（「林头镇人民政府」→「林头镇」，与已有点名去重合并）
const govName = n => String(n || '')
  .replace(/人民政府$|人民代表大会$|工作委员会$|管理委员会$/, '')
  .replace(/街道办事处$/, '街道')
  .replace(/委员会$|办公室$|服务中心$/, '')
  .trim();
const goodName = n => n.length >= 2 && n.length <= 14 && !OUT_NAME.test(n) && !BAD_NAME.test(n)
  && !BIZ_NAME.test(n) && !ADMIN_NAME.test(n)
  && !/^[\d\s\-—·、,.;:]+$|^\d+号|^\d+幢|^\d+栋/.test(n);

// ---- 1. 清洗 OSM 地名 ----
const geoText = await readFile(GEO, 'utf8');
const i0 = geoText.lastIndexOf('places: [');
const j0 = geoText.indexOf('\n  };', i0);
if (i0 < 0 || j0 < 0) throw new Error('找不到 geo_ms.js 的 places 段');
// 原始 OSM 地名单独存档，保证脚本可反复运行且交付包内无需带 3 MB 的文件备份
const SRC = ROOT + '/tools/places-source.json';
let oldPlaces;
try { oldPlaces = JSON.parse(await readFile(SRC, 'utf8')); }
catch {
  const raw = await original(GEO, 'geo_ms.js');
  const ri = raw.lastIndexOf('places: ['), rj = raw.indexOf('\n  };', ri);
  oldPlaces = JSON.parse(raw.slice(ri + 8, rj).trim());
  await writeFile(SRC, JSON.stringify(oldPlaces), 'utf8');
  console.log('已生成 places-source.json:', oldPlaces.length, '个原始地名');
}

const items = [];       // {n,x,y,t,bias}
const nameIdx = new Map();
function addItem(n, x, y, t, bias, prefer) {
  n = CLEAN(n);
  // 「XX大学XX校区图书馆 / 阶梯教室 / 体育馆」这类校区内设施，统一归并到校区名
  if (t === 5) { const ci = n.indexOf('校区'); if (ci > 0 && n.length > ci + 2) n = n.slice(0, ci + 2); }
  if (!goodName(n) || !inScope(x, y)) return false;
  const arr = nameIdx.get(n) || [];
  for (const e of arr) {
    if (Math.abs(e.x - x) < 2.2 && Math.abs(e.y - y) < 2.2) {
      if (prefer && bias > items[e.i].bias) { items[e.i] = { n, x, y, t, bias }; e.x = x; e.y = y; }
      return false;
    }
  }
  const idx = items.push({ n, x: +x.toFixed(2), y: +y.toFixed(2), t, bias }) - 1;
  arr.push({ i: idx, x, y }); nameIdx.set(n, arr);
  return true;
}
let osmKept = { 1: 0, 2: 0, 3: 0 };
for (const p of oldPlaces) {
  const [n, x, y, t] = p;
  if (!inScope(x, y)) continue;
  const c = CLEAN(n);
  if (!goodName(c)) continue;
  let bias;
  if (t === 1) bias = 0.55;                                    // 火车站 / 地铁站
  else if (t === 2) bias = /镇$|村$|社区$|庄$|冲$|圩$|郢$/.test(c) ? 0.50 : 0.38;  // 聚落
  else bias = 0.10;                                            // OSM 具名地物（保留少量）
  if (addItem(c, x, y, t, bias, false)) osmKept[t] = (osmKept[t] || 0) + 1;
}

// ---- 2. 合并高德规范地名（坐标更准，同名 2.2 格内覆盖 OSM） ----
let amapAdded = 0;
const byCounty = {};
for (const p of amap.pois) {
  if (!inScope(p.x, p.y)) continue;
  if (AMAP_TYPE_DROP.has(p.t) || (p.g !== 'biz' && BIZ_NAME.test(p.n))) continue;   // 商圈名本身就带「购物中心」，不套商业噪音黑名单
  let t = 4, bias = 0.2;
  const ty = p.t, nm = p.n;
  if (LANDMARK_TYPE.has(ty) || LANDMARK_NAME.test(nm)) { t = 5; bias = 1.05; }        // 地标：最高优先
  else if (PUBLIC_TYPE.has(ty) || PUBLIC_NAME.test(nm)) { t = 6; bias = 0.68; }        // 公园 / 广场 / 景区 / 馆剧院
  else if (p.g === 'geo') { t = 2; bias = /镇$|村$|社区$/.test(nm) ? 0.5 : 0.44; }     // 道路名 / 村庄 / 桥
  else if (p.g === 'trans') { t = 3; bias = /站$|火车站|地铁/.test(nm) ? 0.5 : 0.12; } // 枢纽保留，公交站名降权
  else if (p.g === 'home') { t = 4; bias = 0.18; }                                     // 住宅小区
  else if (p.g === 'gov') { t = 4; bias = 0.3; }                                       // 政府机关（名称已去后缀）
  else if (p.g === 'biz') { t = 4; bias = 0.3; }                                       // 主要商圈
  const useName = p.g === 'gov' ? govName(p.n) : p.n;
  if (addItem(useName, p.x, p.y, t, bias, true)) {
    amapAdded++;
    byCounty[p.c] = (byCounty[p.c] || 0) + 1;
  }
}

// ---- 2c. OSM 路名：每条命名道路取最长段中点，作为「路名」类地名（高德 place/text 取不到道路名） ----
let roadAdded = 0;
try {
  const roadPts = JSON.parse(await readFile(ROOT + '/tools/road-names.json', 'utf8'));
  for (const [rn, rx, ry, major] of roadPts) {
    if (!inScope(rx, ry)) continue;
    if (addItem(rn, rx, ry, 2, major ? 0.46 : 0.40, false)) roadAdded++;
  }
  console.log('OSM 路名点:', roadAdded, '/', roadPts.length);
} catch (e) { console.log('未找到 road-names.json，跳过路名'); }

// ---- 3. 乡村聚落点（星星点点，不连成线） ----
// 建成区格来自生成器的 250 m 掩膜（centers-mask.json）；地名点不是建成区，不能拿来当参照
const built = new Set();
let centerCells = [];
try { centerCells = JSON.parse(await readFile(ROOT + '/tools/centers-mask.json', 'utf8')); } catch {}
for (const c of centerCells) built.add(Math.floor(c.x) + ',' + Math.floor(c.y));
console.log('建成区格:', built.size);

const hamlets = [];
const bucket = new Set();
const hash = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
let osmHamlet = 0;
for (const e of osmEls) {
  const t = e.tags || {}, place = t.place, n = CLEAN(t.name);
  if (!['village', 'hamlet', 'isolated_dwelling', 'locality'].includes(place)) continue;
  if (!n || !goodName(n)) continue;
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (lat == null || lon == null) continue;
  const [x, y] = toGrid(lat, lon);
  if (!inScope(x, y)) continue;
  osmHamlet++;
  const gx = Math.floor(x), gy = Math.floor(y);
  // 距建成区至少 2 格，避免和城镇团块叠加
  let nearBuilt = false;
  for (let dj = -2; dj <= 2 && !nearBuilt; dj++) for (let di = -2; di <= 2; di++) if (built.has((gx + di) + ',' + (gy + dj))) { nearBuilt = true; break; }
  if (nearBuilt) continue;
  // 750 m 网格去重 + 抽样，形成稀疏点状
  const bk = Math.floor(x / 3) + '|' + Math.floor(y / 3);
  if (bucket.has(bk)) continue;
  if (hash(gx, gy) > 0.54) continue;   // 抽样更稀：乡道两侧只留少量自然村，避免沿路连成带状
  bucket.add(bk);
  const pop = place === 'village' ? 1500 : place === 'locality' ? 780 : place === 'isolated_dwelling' ? 620 : 900;
  hamlets.push([+(gx + 0.5).toFixed(2), +(gy + 0.5).toFixed(2), pop, Math.round(pop * 0.06)]);
}
hamlets.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

// ---- 4. 写回 geo_ms.js ----
const newPlaces = items.map(p => [p.n, p.x, p.y, p.t]);
const geoOut = geoText.slice(0, i0) + 'places: ' + JSON.stringify(newPlaces) + geoText.slice(j0);
await writeFile(GEO, geoOut, 'utf8');

// ---- 5. 写回 data_ms.js ----
let dataText = await readFile(DATA, 'utf8');
const ruralRe = /rural: \{ pop: \d+, jobs: \d+ \}/;
if (!ruralRe.test(dataText)) throw new Error('找不到 rural 配置');
dataText = dataText.replace(ruralRe, "rural: { pop: 3, jobs: 2 }");

const placesRe = /places: \(G\.places \|\| \[\]\)\.map\(function \(p\) \{[\s\S]*?\}\),/;
if (!placesRe.test(dataText)) throw new Error('找不到 places 映射行');
dataText = dataText.replace(placesRe,
  "places: (G.places || []).map(function (p) {\n" +
  "      // 第 5 项是站名偏好（格），第 6 项是命名类目（v3.19）：\n" +
  "      // 1 城市路名 / 2 大型商场 / 3 补充的真实公交站名 / 4 大学·学校·文化场馆（0 普通）。\n" +
  "      // 市区片区（urban:true）里 metro.js 会先在这几类里挑站名——与真实公交、宁马线的命名习惯一致\n" +
  "      // （湖北路·二中、湖南路·安工大、雨山东路）；市区之外仍以镇村名为先。\n" +
  "      const t = p[3], n = p[0], c = p[4] || 0;\n" +
  "      const b = c === 1 ? (/大道$|大街$/.test(n) ? 1.1 : 1.0)\n" +
  "        : c === 2 ? 1.0\n" +
  "        : c === 4 ? 1.05\n" +
  "        : c === 3 ? 0.35\n" +
  "        : t === 5 ? 1.05\n" +
  "        : t === 6 ? 0.64\n" +
  "        : t === 1 ? 0.55\n" +
  "        : t === 2 ? (/镇$|村$|社区$|庄$|冲$|圩$|郢$/.test(n) ? 0.5 : 0.42)\n" +
  "        : t === 3 ? 0.12 : 0.2;\n" +
  "      return [p[0], p[1], p[2], t, b, c];\n" +
  "    }),");

const anchor = "  // 位置校正：与 OSM 地名同名的设施与任务锚点，改用 OSM 位置（相距 12 格以内时）";
if (!dataText.includes(anchor)) throw new Error('找不到插入锚点');
// 幂等：先移除上一轮插入的人口加权 / 乡村聚落块
const BLOCK_HEAD = "  // 2000 年人口按真实城镇规模分配";
if (dataText.includes(BLOCK_HEAD)) {
  const s = dataText.indexOf(BLOCK_HEAD), e = dataText.indexOf(anchor, s);
  if (e > s) dataText = dataText.slice(0, s) + dataText.slice(e);
}
// 乡镇驻地与各自的建成区规模（km²）：OSM 把江北连片农村宅基地也标成 residential，
// 若逐格等权，含山县会凭空多出几十万人。按「距最近乡镇驻地」和「驻地规模」两级衰减。
const towns = JSON.parse(await readFile(ROOT + '/tools/towns-ms.json', 'utf8'));
// 园区/新区锚点：不是乡镇，但建成区判据 (pop+jobs)*f*w*af>2600 依赖「距最近锚点」的距离档，
// 没有锚点的园区 f 恒为 0.28，永远点不亮。坐标取自高德。
const EXTRA_ANCHORS = [
  [197.0, 186.5, 0.65],   // 郑蒲港新区 · 现代产业园
  [206.5, 141.0, 0.60],   // 和县经济开发区
  [244.0, 106.5, 0.60],   // 乌江 · 安徽省精细化工基地
];
const townW = JSON.stringify(towns.map(t => [+t.x.toFixed(1), +t.y.toFixed(1),
  +Math.max(0.55, Math.min(1.5, Math.sqrt((t.km2 || 1) / 5))).toFixed(2)]).concat(EXTRA_ANCHORS));
const ruralBlock =
  "  // 2000 年人口按真实城镇规模分配：距乡镇驻地越远、驻地规模越小，建成格的人口权重越低。\n" +
  "  // 这样人口集中在主城与县城，江北连片农村宅基地只保留建成区形态、不会摊到大量人口。\n" +
  "  const TOWN_W = " + townW + ";\n" +
  "  for (const c of data.centers) {\n" +
  "    let bd = 1e9, w = 1;\n" +
  "    for (const t of TOWN_W) { const q = Math.hypot(c.x - t[0], c.y - t[1]); if (q < bd) { bd = q; w = t[2]; } }\n" +
  "    const f = bd <= 3 ? 1 : bd <= 8 ? 0.6 : 0.28;\n" +
  "    // 区县标定：2000 年城镇人口主要在江东主城（约 50 万），三个县城各几万人，\n" +
  "    // 其余 30 多个乡镇合计十余万人；江北连片农村宅基地只保留形态，不摊人口。\n" +
  "    let af = 0.5;\n" +
  "    if (c.x >= 235 && c.x <= 315 && c.y >= 135 && c.y <= 210) af = 1.5;\n" +
  "    else if (c.x >= 245 && c.x <= 277 && c.y >= 210 && c.y <= 238) af = 1.0;\n" +
  "    else if (c.x >= 366 && c.x <= 402 && c.y >= 202 && c.y <= 242) af = 0.9;\n" +
  "    else if (c.x >= 190 && c.x <= 216 && c.y >= 140 && c.y <= 168) af = 0.9;\n" +
  "    else if (c.x >= 94 && c.x <= 114 && c.y >= 140 && c.y <= 168) af = 0.9;\n" +
  "    c.pop = Math.round(c.pop * f * w * af); c.jobs = Math.round(c.jobs * f * w * af);\n" +
  "  }\n" +
  "  // 乡村聚落：2000 年农村人口不是沿路均摊，而是集中在自然村。每个聚落只给一个 250 m 格的低密度核，\n" +
  "  // 归一化后约 15~30 人/格（会画出零星房屋，但低于建成区外扩阈值 100 人/格），因此乡村呈点状而非带状。\n" +
  "  const RURAL_CENTERS = " + JSON.stringify(hamlets) + ";\n" +
  "  for (const r of RURAL_CENTERS) data.centers.push({ x: r[0], y: r[1], pop: r[2], jobs: r[3], r: 0.09 });\n\n";
dataText = dataText.replace(anchor, ruralBlock + anchor);
await writeFile(DATA, dataText, 'utf8');

// ---- 6. suggestName：先按偏好排序，再按真实距离判定范围 ----
let metroText = await readFile(METRO, 'utf8');
if (!metroText.includes('const cands = all.filter')) {
  const oldSuggest = `    const cands = D.places.map(function (p) { return { n: p[0], d: U.dist(x, y, p[1], p[2]), x: p[1], y: p[2] }; }).sort(function (a, b) { return a.d - b.d; });
    for (const c of cands) { if (c.d > 3.2) break; if (!used.has(c.n)) return c.n; }
    const c0 = cands[0];`;
  const newSuggest = `    const all = D.places.map(function (p) { const d = U.dist(x, y, p[1], p[2]); return { n: p[0], d: d, s: d - (p[4] || 0), x: p[1], y: p[2] }; });
    const cands = all.filter(function (c) { return c.d <= 3.2; }).sort(function (a, b) { return a.s - b.s; });
    for (const c of cands) { if (!used.has(c.n)) return c.n; }
    const c0 = all.slice().sort(function (a, b) { return a.d - b.d; })[0];`;
  if (!metroText.includes(oldSuggest)) throw new Error('找不到 suggestName 排序逻辑');
  metroText = metroText.replace(oldSuggest, newSuggest);
}
// 境外片区（empty）不给「南京N站」这类名字
if (!metroText.includes('rg && !rg.empty')) {
  const oldBase = "    const base = rg ? rg.name.replace(/（.*）/, '') : '新区';";
  const newBase = "    const base = rg && !rg.empty ? rg.name.replace(/（.*）/, '') : '新区';";
  if (!metroText.includes(oldBase)) throw new Error('找不到站名兜底逻辑');
  metroText = metroText.replace(oldBase, newBase);
}
await writeFile(METRO, metroText, 'utf8');

// ---- 7. 报告 ----
const tier = {}; for (const p of items) tier[p.t] = (tier[p.t] || 0) + 1;
const report = {
  placesBefore: oldPlaces.length, placesAfter: items.length,
  osmKept, amapAdded, byCounty, tier,
  hamletCandidates: osmHamlet, hamletCenters: hamlets.length,
  ruralPop: 3, ruralJobs: 2,
};
await writeFile(ROOT + '/tools/places-rebuild-report.json', JSON.stringify(report, null, 1), 'utf8');
console.log(JSON.stringify(report, null, 1));
console.log('地名样例:', items.slice(0, 10).map(p => p.n + '(' + p.t + ')').join(' '));
console.log('高德样例:', items.filter(p => p.t === 4).slice(0, 14).map(p => p.n).join(' '));
