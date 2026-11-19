// 用高德 Web 服务抓取马鞍山 6 个区县的「适合作站名」的规范地名，并取回市界。
// 用法：AMAP_KEY=xxx node tools/amap-places.mjs
// 输出：tools/amap-places.json（坐标已转 WGS-84 并映射到游戏格）
import { writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const KEY = process.env.AMAP_KEY;
if (!KEY) { console.error('缺少 AMAP_KEY'); process.exit(1); }

const PR = { lon0: 117.835, lat0: 32.07, kx: 390.61, ky: 440.27 };

function gcj2wgs(lat, lon) {
  const pi = Math.PI, a = 6378245, ee = 0.006693421622965943;
  const tLat = (x, y) => { let r = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3; r += (20*Math.sin(x*pi) + 40*Math.sin(x/3*pi))*2/3;
    r += (160*Math.sin(x/12*pi) + 320*Math.sin(x*pi/30))*2/3; return r; };
  const tLon = (x, y) => { let r = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3; r += (20*Math.sin(x*pi) + 40*Math.sin(x/3*pi))*2/3;
    r += (150*Math.sin(x/12*pi) + 300*Math.sin(x*pi/30))*2/3; return r; };
  let dLat = tLat(lat-35, lon-105), dLon = tLon(lat-35, lon-105);
  const rad = lat/180*pi, m = 1 - ee*Math.sin(rad)**2, sq = Math.sqrt(m);
  dLat = (dLat*180)/((a*(1-ee))/(m*sq)*pi);
  dLon = (dLon*180)/(a/sq*Math.cos(rad)*pi);
  return [lat*2-(lat+dLat), lon*2-(lon+dLon)];
}
const toGrid = (lat, lon) => [ +((lon-PR.lon0)*PR.kx).toFixed(2), +((PR.lat0-lat)*PR.ky).toFixed(2) ];

const COUNTIES = ['含山县', '和县', '当涂县', '博望区', '花山区', '雨山区'];
const GROUPS = [
  { id: 'geo',    types: '190000', maxPage: 12 },  // 地名地址：道路名、村庄、社区、桥梁
  { id: 'edu',    types: '140000', maxPage: 14 },  // 科教文化：大学、博物馆、图书馆、科技馆、展览馆、中小学（此前误用 060000=购物，导致一个都没抓到）
  { id: 'scenic', types: '110000', maxPage: 8 },   // 风景名胜：公园、景区、寺庙、广场（原注释写风景名胜、代码却是 060000 购物）
  { id: 'sport',  types: '080000', maxPage: 6 },   // 体育休闲：体育馆、剧院、影院
  { id: 'trans',  types: '150000', maxPage: 10 },  // 交通设施：火车站、地铁站、码头
  { id: 'home',   types: '120000', maxPage: 4 },   // 住宅小区（降权，只保留少量）
  { id: 'gov',    types: '130100', maxPage: 8 },  // 政府机关：镇政府 / 街道办 / 管委会（名称会去掉「人民政府」后缀）
  { id: 'biz',    types: '060100', maxPage: 3 },  // 商场 / 购物中心：只保留有名字的主要商圈
];

// 末级类型黑名单：这些类别不适合做车站名
const TYPE_DROP = new Set([
  '路口名', '门牌信息', '道路门牌', '高速路入口', '高速路出口', '立交桥', '收费站',
  '商务写字楼', '商务住宅相关', '公司企业', '企业', '厂矿', '产业园区',
  '宾馆酒店', '酒店', '餐饮相关', '餐饮服务', '购物相关', '购物服务',
  '金融保险相关', '银行', 'ATM', '停车场', '停车场相关', '加油站', '充电站',
  '公共厕所', '卫生间', '收费站', '服务区', '汽车维修', '汽车销售',
  '网吧', 'KTV', '棋牌室', '酒吧', '洗浴', '夜总会', '会所', '垂钓园', '采摘园',
  '度假村', '游乐场', '休闲场所', '体育休闲服务场所', '住宿服务相关', '住宿服务',
  '建材五金市场', '家电电子卖场', '果品市场', '花鸟鱼虫市场', '家具建材市场',
  '手机销售', '数码电子', '专营店', '自行车专卖店', '汽车养护', '汽车服务相关',
  '口腔医院', '卫生院', '综合医院', '医疗保健服务场所', '药店',
  '摄影冲印', '洗衣店', '美容美发', '搬家公司', '中介机构',
  '政府机构及社会团体', '政府机关', '公安机关', '法院', '检察院',
  '门牌号', '楼号', '道路名附属', '交通地名相关', '地名地址信息',
]);
// 名称噪音：即使类型正确，名字本身不适合做站名
const NAME_DROP = /交叉口|路口|出入口|门牌|停车场|加油站|收费站|服务区|有限公司|\b公司\b|便利店|超市|营业厅|卫生间|公共厕所|ATM|项目部|售楼|物业|管理处|管委会|人民政府|村民委员会|社区居民委员会|居委会|派出所|党群|服务中心|警务|税务|工商|银行|宾馆|酒店|饭店|大排档|药店|药房|诊所|卫生院分院|分公司|办事处|旗舰店|专卖店|体验店|展厅|4S店|公交站|公交车站|候车亭|充电站|收费站|高速|互通|枢纽|匝道|桥下|隧道口/;
const NAME_BAD = /^[\d\s\-—·、,.;:]+$|^\d+号|^\d+幢|^\d+栋|^[A-Za-z0-9]+$/;

function cleanName(n) {
  let s = String(n || '').trim();
  s = s.replace(/[（(][^）)]*[）)]/g, '');   // 去掉括号注释
  s = s.replace(/^马鞍山市|^安徽省|^马鞍山(?=[^\u4e00-\u9fa5])/g, '');
  return s.trim();
}
function usable(p) {
  const n = cleanName(p.name);
  if (n.length < 2 || n.length > 16) return null;
  if (NAME_DROP.test(n) || NAME_BAD.test(n)) return null;
  const t = (p.type || '').split(';').pop();
  if (TYPE_DROP.has(t)) return null;
  if (!/^[\u4e00-\u9fa5A-Za-z0-9·\-—　 ]+$/.test(n)) return null;
  return { n, t };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 5; i++) {
    try {
      const j = await (await fetch(url)).json();
      if (j.status === '1') return j;
      if (String(j.infocode) === '10001' || String(j.infocode) === '10003') { await sleep(1600 + i*800); continue; }
      if (String(j.infocode) === '10002' || String(j.infocode) === '10004') { console.error('KEY 配额/权限问题:', j.info); process.exit(2); }
      return { pois: [], count: '0' };
    } catch (e) { await sleep(900 + i*500); }
  }
  return { pois: [], count: '0' };
}

// ---- 1. 市界（GCJ-02 → WGS-84） ----
const dis = await get('https://restapi.amap.com/v3/config/district?' + new URLSearchParams({
  keywords: '马鞍山', subdistrict: '0', extensions: 'all', key: KEY }));
const rings = ((dis.districts || [])[0]?.polyline || '').split('|').filter(Boolean).map(seg =>
  seg.split(';').filter(Boolean).map(pt => {
    const [lon, lat] = pt.split(',').map(Number);
    const w = gcj2wgs(lat, lon);
    return [ +w[1].toFixed(6), +w[0].toFixed(6) ];
  }).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))).filter(r => r.length > 2);
console.log('市界环数:', rings.length, '总点数:', rings.reduce((s, r) => s + r.length, 0));

// ---- 2. 按区县 + 类型组抓 POI ----
const seen = new Map();   // key: name + 网格(2 格)
const stats = {};
for (const county of COUNTIES) {
  stats[county] = {};
  for (const g of GROUPS) {
    let got = 0, pages = 0;
    for (let page = 1; page <= g.maxPage; page++) {
      const u = 'https://restapi.amap.com/v3/place/text?' + new URLSearchParams({
        city: county, citylimit: 'true', types: g.types, offset: '25', page: String(page),
        extensions: 'base', key: KEY });
      const j = await get(u);
      const pois = j.pois || [];
      if (!pois.length) break;
      pages++;
      for (const p of pois) {
        if (!p.location || p.adname !== county) continue;
        const u2 = usable(p); if (!u2) continue;
        const [lon, lat] = p.location.split(',').map(Number);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const w = gcj2wgs(lat, lon);
        const [x, y] = toGrid(w[0], w[1]);
        if (x < -2 || x > 418 || y < -2 || y > 330) continue;
        const k = u2.n + '|' + Math.round(x/2) + '|' + Math.round(y/2);
        if (seen.has(k)) continue;
        seen.set(k, { n: u2.n, x, y, t: u2.t, c: county, g: g.id });
        got++;
      }
      if (pois.length < 25) break;
      await sleep(270);
    }
    stats[county][g.id] = { pages, kept: got };
    console.log(`  ${county} ${g.id.padEnd(7)} 页=${String(pages).padStart(2)} 保留=${String(got).padStart(3)}`);
  }
}

const pois = [...seen.values()].sort((a, b) => a.c.localeCompare(b.c, 'zh') || a.y - b.y || a.x - b.x);
const byCounty = {}; for (const p of pois) byCounty[p.c] = (byCounty[p.c] || 0) + 1;
console.log('=== 合计 ===', pois.length, '个，按区县:', JSON.stringify(byCounty));
const byGroup = {}; for (const p of pois) byGroup[p.g] = (byGroup[p.g] || 0) + 1;
console.log('按类型组:', JSON.stringify(byGroup));
const byType = {}; for (const p of pois) byType[p.t] = (byType[p.t] || 0) + 1;
console.log('末级类型 Top20:', Object.entries(byType).sort((a,b)=>b[1]-a[1]).slice(0,20));
console.log('样例:', pois.slice(0, 12).map(p => p.n + '(' + p.t + '/' + p.c + ')').join(' '));

await writeFile(ROOT + '/tools/amap-places.json', JSON.stringify({
  generated: new Date().toISOString(), source: '高德地图 Web 服务 place/text + config/district（GCJ-02 → WGS-84）',
  proj: PR, rings, stats, byCounty, byGroup, pois }, null, 0), 'utf8');
console.log('已写出 tools/amap-places.json');
