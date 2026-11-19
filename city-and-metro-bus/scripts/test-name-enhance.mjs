// 站名增强测试（v3.28）：① 铁路客运站优先；② 有轨电车站名偏好小区/学校；③ 马鞍山站坐标校准。
//  railway hub 用本地图 kind:'rail' 地标做权威白名单，不能用 /站$/ 宽泛匹配（会污染几十条公交站）。
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
const C = context.CM, M = C.Metro;

// ---- 1. 铁路客运站优先：站落在铁路站 POI 上必须取该站名（地铁、电车都优先）----
C.useMap('ms');
const g = C.Game.create({ mode: 'free', seed: 20270101 }), city = g.city;
const em = M.empty();
const railCases = [
  ['马鞍山站', 259.89, 158.99],
  ['马鞍山东站', 274.61, 165.54],
];
for (const [want, x, y] of railCases) {
  assert.equal(M.suggestName(em, x, y, city), want, '地铁：铁路站附近取「' + want + '」');
  assert.equal(M.suggestName(em, x, y, city, M.nameOpts('tram')), want, '电车：铁路站附近同样取「' + want + '」');
}
// 宽泛匹配不能误伤：公交站/客运站名不应被当作铁路枢纽而强行优先
const railNames = new Set((C.DATA.landmarks || []).filter(l => l.kind === 'rail').map(l => l.name));
assert.ok(!railNames.has('博望公交总站') && !railNames.has('马鞍山客运站'), '公交站不进铁路枢纽白名单');
assert.equal(M.suggestName(em, 259.5, 160.3, city), '长途汽车站', '客运站近旁仍按枢纽类目取名，不被铁路白名单干扰');

// ---- 2. 有轨电车偏好小区/学校：地铁保持原规则，电车明显不同 ----
const tram = M.nameOpts('tram');
assert.equal(tram && tram.tram, true, 'nameOpts(tram) 给出电车偏好');
assert.equal(M.nameOpts('metro'), null, 'nameOpts(metro) 无偏好（地铁原样）');

const HOME = /小区|花园$|家园$|公馆|公寓|别墅|庄园$|山庄$|苑$|期$|幢|号楼|雅居|名邸|府邸/;
const SCHOOL = /学院|校区|大学|中学|小学|学校|技师/;
let diff = 0, home = 0, school = 0;
for (let x = 250; x <= 282; x++) for (let y = 156; y <= 192; y++) {
  if (!M.checkSite(city, x, y, 'surface').ok) continue;
  const a = M.suggestName(em, x, y, city);
  const b = M.suggestName(em, x, y, city, tram);
  if (a !== b) diff++;
  if (HOME.test(b) && !HOME.test(a)) home++;
  if (SCHOOL.test(b) && !SCHOOL.test(a)) school++;
}
assert.ok(diff > 100, '电车命名在社区有明显差异，实际 ' + diff);
assert.ok(home > 20, '电车确实更多采用小区名，实际 ' + home);
assert.ok(school > 3, '电车确实更多采用学校名，实际 ' + school);
// 电车产出的小区名仍需合规：不过长、无标点、无阿拉伯数字
for (let x = 250; x <= 282; x += 2) for (let y = 156; y <= 192; y += 2) {
  if (!M.checkSite(city, x, y, 'surface').ok) continue;
  const b = M.suggestName(em, x, y, city, tram);
  assert.ok(b.length >= 2 && b.length <= 8, '电车站名长度合规: ' + b);
  assert.ok(!/[A-Za-z]/.test(b), '电车站名无外文: ' + b);
}

// ---- 3. 马鞍山站坐标校准：地标应落在铁路线位（底图 POI 附近），不再偏西 2 km ----
const lm = (C.DATA.landmarks || []).find(l => l.id === 'ms_rail');
assert.ok(lm, '找到马鞍山站地标');
// 底图地名层 POI (259.89,158.99)；校准后地标应在其 1.5 格内
assert.ok(Math.abs(lm.x - 259.89) < 1.5 && Math.abs(lm.y - 158.99) < 1.5,
  '马鞍山站地标落回站址: 实际 (' + lm.x.toFixed(2) + ',' + lm.y.toFixed(2) + ')');
// 任务锚点 ms2 同样已校准
const ms2 = (C.DATA.histTasks || []).find(t => t.id === 'ms2');
const a0 = ms2 && ms2.anchors[0];
assert.ok(a0 && Math.abs(a0.x - lm.x) < 0.5 && Math.abs(a0.y - lm.y) < 0.5, 'ms2 任务锚点跟随校准后的站址');

console.log('PASS 站名增强：铁路枢纽优先（白名单不误伤公交）/ 电车偏好小区与学校（地铁不变）/ 马鞍山站坐标校准');
