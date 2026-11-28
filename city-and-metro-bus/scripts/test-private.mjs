// 私营铁路公司（v3.91）端到端验证：
//   命名（宁马 vs 其他城市）/ 自有资金 / 6 个月自主决策 / 自建与 PPP 两条路径 / 存档
import fs from 'node:fs/promises'; import vm from 'node:vm';
const root = new URL('../', import.meta.url), mem = new Map();
const c = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  setInterval: () => 0, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
c.window = c; vm.createContext(c);
const load = async f => vm.runInContext(await fs.readFile(new URL(f, root), 'utf8'), c, { filename: f });
const scripts = [...(await fs.readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const f of scripts) { await load(f); if (f === 'js/save.js') break; }
const C = c.CM; C.ui = { todInfo: function () { return null; } };
for (const f of ['settings', 'icons', 'pages', 'render', 'sites', 'scenery']) { try { await load('js/' + f + '.js'); } catch (e) {} }

let fail = 0; const ok = (v, m) => { console.log((v ? 'PASS ' : 'FAIL ') + m); if (!v) fail++; };
function boot(mapId) {
  C.useMap(mapId);
  const g = C.Game.create({ mode: 'challenge', seed: 20300101 });
  try { g.refreshOperations(); } catch (e) {}
  try { g.model.computeDaily(); } catch (e) {}
  return g;
}

// ---------- 1. 命名 ----------
C.useMap('ms30');
const g1 = boot('ms30');
ok(C.Private.enabled(g1), 'ms30 启用私营公司');
const org1 = C.Private.org(g1);
ok(!!org1 && org1.name === '宁马轨道交通', 'ms30 私营公司名为「宁马轨道交通」（得到 ' + (org1 && org1.name) + '）');
ok(!!org1 && org1.kind === 'private', '公司标记为 private');
const seed1 = org1.fin.cash;
ok(seed1 > 0, '初始自有资金 ' + Math.round(seed1) + ' 万元');

C.useMap('nj');
const g2 = boot('nj');
const org2 = C.Private.org(g2);
ok(!!org2 && org2.name !== '宁马轨道交通', '南京图的私营公司不叫宁马（得到 ' + (org2 && org2.name) + '）');
ok(!!org2 && /金陵|秦淮|江宁|钟山|铁道|交通|轨道/.test(org2.name), '名字来自本地地名');

C.useMap('hx27');
const g3 = boot('hx27');
const org3 = C.Private.org(g3);
ok(!!org3 && org3.name === '宁马轨道交通', '和县图也叫「宁马轨道交通」（得到 ' + (org3 && org3.name) + '）');

// ---------- 2. 自主决策：自有资金够 -> 自建 ----------
const g = g1, org = org1, P = C.Private;
const s = C.PPP.ensure(g);
g.priv.base = g.ym();                        // 让 review 的 6 个月判断从这里起算
const pick = C.AIRoute.choose(g, org.id, { tryN: 8 });
ok(!!pick && !!pick.route, '找到可修走廊 ' + (pick ? pick.route.km.toFixed(1) + ' km' : ''));
const capex = pick ? pick.est.cost : 0;
org.fin.cash = capex * 1.2;                  // 钱够（含 20% 余量）
const r = P.review(g, org, g.ym());
ok(!!r && r.self === true, '自有资金够时选择自建');
const self = s.contracts.find(k => k.funded === 'self');
ok(!!self && self.state === 'build', '自建合同进入施工（' + (self ? self.buildMonths + ' 个月' : '') + '）');
ok(Math.abs(org.fin.cash - capex * 0.2) < 1, '造价从自有资金扣除（余 ' + Math.round(org.fin.cash) + '）');

// 施工完成 -> 线路归公司
g.clock.y = 2040; g.clock.m = 1;             // 快进到完工
C.PPP.monthly(g);
const done = s.contracts.find(k => k.id === self.id);
ok(done.state === 'run', '工期满后转为运营');
const line = done.lineId != null ? g.net.lines[done.lineId] : null;
ok(!!line && line.owner === org.id && line.coId === org.id, '线路产权与归属都记在私营公司');
ok(!!line && new RegExp(org.name + ' 1 号线').test(line.name), '线路命名为「' + org.name + ' 1 号线」（得到 ' + (line && line.name) + '）');
ok(P.selfLines(g, org) === 1, '自有线路计数 = 1');
// 自建线不付可用性付费
const before = g.econ.cur.pppOut || 0;
C.PPP.monthly(g);
ok((g.econ.cur.pppOut || 0) === before, '自建线不产生可用性付费');

// ---------- 3. 钱不够 -> 转 PPP ----------
const s2 = C.PPP.ensure(g);
s2.contracts.forEach(k => { k.state = 'ended'; });   // 清掉在建/运营，便于再次评估
s2.props.length = 0;
org.fin.cash = 1;                                    // 钱不够
const pick2 = C.AIRoute.choose(g, org.id, { tryN: 8 });
const r2 = P.review(g, org, g.ym() + 6);
if (pick2 && pick2.ok) {
  ok(!r2 || !r2.self, '钱不够时不走自建');
  ok(s2.props.length === 1, '改为提交一份 PPP 提案（待批 ' + s2.props.length + ' 份）');
  ok(s2.props[0] && s2.props[0].ym != null, '提案记录提交月份（便于过期撤回）');
  // 12 个月未批复 -> 自动撤回
  const gone = C.PPP.expire(g, s2.props[0].ym + P.PROP_TTL);
  ok(gone === 1 && s2.props.length === 0, '压满 ' + P.PROP_TTL + ' 个月未批复自动撤回');
} else {
  console.log('SKIP 钱不够分支：本图没有可用走廊');
}

// ---------- 4b. 空网剧本（2000 年，开局 0 站）也能修第一条线 ----------
C.useMap('ms');
const g4 = boot('ms');
const org4 = C.Private.org(g4);
ok(Object.keys(g4.net.stations).length === 0, 'ms 2000 开局确实没有车站');
g4.priv.base = g4.ym();
const pick4 = C.AIRoute.choose(g4, org4.id, { tryN: 8 });
ok(!!pick4 && pick4.ok, '空网剧本也能找到走廊（主城中心当起点）');
org4.fin.cash = 1e9;
const r4 = C.Private.review(g4, org4, g4.ym());
ok(!!r4 && r4.self, '空网剧本私铁也能自建第一条线');
g4.clock.y = 2005; g4.clock.m = 1;
C.PPP.monthly(g4);
ok(C.Private.selfLines(g4, org4) === 1, '空网剧本自建线正常通车');

// ---------- 4. 存档 ----------
const ser = g.serialize ? g.serialize() : null;
ok(!!ser && !!ser.priv, '存档包含 priv 字段');
ok(!!ser && ser.companies.some(x => x.kind === 'private' && x.fin && x.fin.cash != null), '存档保留私营公司与自有资金');

console.log(fail ? ('FAILED ' + fail) : 'ALL PASS');
process.exit(fail ? 1 : 0);
