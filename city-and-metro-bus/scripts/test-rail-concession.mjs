// 国铁运营权机制（巢马段）端到端验证：编译 / 虚拟线 / 客流 / 签约 / 存档
import fs from 'node:fs/promises'; import vm from 'node:vm';
const root = new URL('../', import.meta.url), mem = new Map();
const c = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  setInterval: () => 0, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
c.window = c; vm.createContext(c);
const load = async f => vm.runInContext(await fs.readFile(new URL(f, root), 'utf8'), c, { filename: f });
const scripts = [...(await fs.readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const f of scripts) { await load(f); if (f === 'js/save.js') break; }
const C = c.CM, M = C.Metro; C.UI = function () {};
for (const f of ['settings', 'icons', 'pages', 'corp', 'fleet', 'opsapp', 'render', 'sites', 'scenery']) await load('js/' + f + '.js');

let fail = 0; const ok = (v, m) => { console.log((v ? 'PASS ' : 'FAIL ') + m); if (!v) fail++; };

C.useMap('ms27');
const g = C.Game.create({ mode: 'free', seed: 20270101 });
ok(!!C.RailConcessions, 'RailConcessions loaded');
const defs = C.RailConcessions.definitions(g);
ok(defs.length === 2 && defs[0].id === 'chaoma' && defs[1].id === 'ningan', 'definitions = [chaoma, ningan]');
ok(!!g.compiled && g.compiled.net.lines.l900000, 'compiled network contains chaoma virtual rail line');
const railLine = g.compiled.net.lines.l900000;
ok(railLine && railLine.rail === 'chaoma', 'virtual line has rail tag');
ok(railLine && !railLine.railOwned, 'rail starts unowned');
const railSt = g.compiled.stations.filter(s => s.rail === 'chaoma');
ok(railSt.length === 5, '5 chaoma stations in compiled network (got ' + railSt.length + ')');
console.log('  chaoma stations:', railSt.map(s => s.name).join(' / '));
// 西端合肥接驳口：虚拟站必须与 ms_hflink 设施 portal 坐标对齐，且落在已画高铁通道离开地图西缘处
const jcSt = railSt.find(s => /西缘接驳/.test(s.name));
ok(!!jcSt && Math.abs(jcSt.x - 0.5) < 0.02 && Math.abs(jcSt.y - 167.86) < 0.02, 'west 合肥接驳口 station at [0.5,167.86] (map west edge)');
const hf = C.DATA.facilities.find(f => f.id === 'ms_hflink');
ok(!!hf && hf.gate && Math.abs(hf.at[0] - jcSt.x) < 0.02 && Math.abs(hf.at[1] - jcSt.y) < 0.02, 'ms_hflink portal aligned with west station');
ok(g.city.cellAt(hf.at[0], hf.at[1]) >= 0 && g.city.landFrac[g.city.cellAt(hf.at[0], hf.at[1])] >= 0.3, 'ms_hflink portal on land');
// 宁安城际：第二条运营权线（l900100），市内 2 站 + 两端接驳口
const ngLine = g.compiled.net.lines.l900100;
ok(!!ngLine && ngLine.rail === 'ningan', 'ningan virtual line l900100 in compiled network');
ok(ngLine && ngLine.speed === 250, 'ningan speed 250 km/h');
const ngSt = g.compiled.stations.filter(s => s.rail === 'ningan');
ok(ngSt.length === 4, '4 ningan stations in compiled network (got ' + ngSt.length + ')');
console.log('  ningan stations:', ngSt.map(s => s.name).join(' / '));
const njSt = ngSt.find(s => /南京南/.test(s.name));
ok(!!njSt && Math.abs(njSt.x - 374.5) < 0.02 && Math.abs(njSt.y - 44.1) < 0.02, 'north 南京南 station at [374.5,44.1]');
const whSt = ngSt.find(s => /芜湖/.test(s.name));
ok(!!whSt && Math.abs(whSt.x - 214.08) < 0.02 && Math.abs(whSt.y - 327.38) < 0.02, 'south 芜湖 station at [214.08,327.38]');
const njf = C.DATA.facilities.find(f => f.id === 'ms_njnlink');
const whf = C.DATA.facilities.find(f => f.id === 'ms_whlink');
ok(!!njf && njf.gate && Math.abs(njf.at[0] - njSt.x) < 0.02 && Math.abs(njf.at[1] - njSt.y) < 0.02, 'ms_njnlink portal aligned with north station');
ok(!!whf && whf.gate && Math.abs(whf.at[0] - whSt.x) < 0.02 && Math.abs(whf.at[1] - whSt.y) < 0.02, 'ms_whlink portal aligned with south station');
// 两个新接驳口必须落在陆地（Fac.active 要求 landFrac>=0.3），否则接驳需求不会激活
const landOf = f => { const c = g.city.cellAt(f.at[0], f.at[1]); return c >= 0 ? g.city.landFrac[c] : -1; };
ok(landOf(njf) >= 0.3, 'ms_njnlink on land (landFrac ' + landOf(njf).toFixed(2) + ')');
ok(landOf(whf) >= 0.3, 'ms_whlink on land (landFrac ' + landOf(whf).toFixed(2) + ')');
const railRoutes = g.compiled.routes.filter(r => r.line.rail);
ok(railRoutes.length >= 2, 'both rail lines compiled routes (' + railRoutes.length + ')');
ok(railRoutes.every(r => r.railFreq != null), 'rail route has fixed frequency');
ok(!!C.Model.railFrequency(railRoutes[0], 0), 'Model.railFrequency returns value');
// 联络线走线：运营权定义的 bends 必须与地图已画联络线（geo_ms.js 巢马 seg94）一致
{
  const names = C.GEOS.ms.names;
  const cmSegs = C.GEOS.ms.rail.filter(r => r[0] === names.indexOf('巢马高速线'));
  const d = cmSegs[cmSegs.length - 1];
  const p = C.Geo.dec ? C.Geo.dec(d[2]) : null;
  const n = p.length / 2;
  const drawn = Array.from({ length: n }, (_, k) => [Math.round(p[2 * k] * 100) / 100, Math.round(p[2 * k + 1] * 100) / 100]);
  const def = defs[0];
  const southIdx = def.stations.findIndex(s => s[0] === '马鞍山南');
  // 已画联络线自南站东端引出（不含南站中心点），运营权 bends 即从东端引出点开始
  const expected = def.stations[southIdx][4].concat([[273.86, 165.28]]).map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]);
  ok(drawn.length === expected.length && drawn.every((q, k) => Math.hypot(q[0] - expected[k][0], q[1] - expected[k][1]) < 0.05),
    'drawn link geometry matches concession bends (' + drawn.length + ' pts, start ' + drawn[0] + ')');
  // 联络线中段必须走在宁安正线西侧（不与宁安重叠）
  const ngIdx = names.indexOf('宁安客专线');
  const naPts = [];
  C.GEOS.ms.rail.filter(r => r[0] === ngIdx).forEach(r => { const q = C.Geo.dec(r[2]); for (let k = 0; k < q.length; k += 2) naPts.push([q[k], q[k + 1]]); });
  const mid = expected.slice(3, -3);
  let minGap = 1e9;
  for (const q of mid) for (const w of naPts) minGap = Math.min(minGap, Math.hypot(q[0] - w[0], q[1] - w[1]));
  ok(minGap >= 0.5, 'link line keeps ≥0.5 cell clearance from Ning\'an line (min ' + minGap.toFixed(2) + ')');
}

// 求解一次客流，确认票款归属逻辑不崩
let solveOk = true; try { g.model.solveNow(4); } catch (e) { solveOk = false; console.log('  solve error:', e.message); }
ok(solveOk, 'model solve with rail overlay does not throw');
const daily = g.model.daily;
ok(daily && daily.ready, 'daily ready');
ok(daily.railFare === 0, 'railFare = 0 when unowned (got ' + daily.railFare + ')');

// 签约（free 模式下 spend 记入当期账本 pppOut，不动 funds）
const beforePpp = g.econ.cur.pppOut || 0;
const err = C.RailConcessions.change(g, 3, 1);
ok(err === null, 'sign chaoma concession succeeds (' + err + ')');
ok(g.railConcession && g.railConcession.chaoma && g.railConcession.chaoma.local === 3 && g.railConcession.chaoma.express === 1, 'chaoma concession state stored per-line');
ok(g.compiled.net.lines.l900000.railOwned, 'compiled chaoma rail line now owned');
ok((g.econ.cur.pppOut || 0) > beforePpp, 'entry fee booked to pppOut (+' + Math.round((g.econ.cur.pppOut || 0) - beforePpp) + ')');

// 签约宁安（第二条线）
const beforePpp2 = g.econ.cur.pppOut || 0;
const err2 = C.RailConcessions.change(g, 2, 1, 'ningan');
ok(err2 === null, 'sign ningan concession succeeds (' + err2 + ')');
ok(g.railConcession.ningan && g.railConcession.ningan.local === 2 && g.railConcession.ningan.express === 1, 'ningan concession state stored');
ok(g.railConcession.chaoma && g.railConcession.chaoma.local === 3, 'chaoma state untouched by ningan signing');
ok(g.compiled.net.lines.l900100.railOwned, 'compiled ningan rail line now owned');
ok((g.econ.cur.pppOut || 0) > beforePpp2, 'ningan entry fee booked (+' + Math.round((g.econ.cur.pppOut || 0) - beforePpp2) + ')');

// 签约后重算，railFare 应 > 0
let solve2 = true; try { g.model.solveNow(4); } catch (e) { solve2 = false; console.log('  solve2 error:', e.message); }
ok(solve2, 'solve after signing does not throw');
ok((g.model.daily.railFare || 0) > 0, 'railFare > 0 when owned (got ' + g.model.daily.railFare + ')');

// 月费（两条线都签约了，两线月费都应扣）
const beforeM = g.econ.cur.pppOut || 0;
C.RailConcessions.monthly(g);
ok((g.econ.cur.pppOut || 0) > beforeM, 'monthly fees booked to pppOut (+' + Math.round((g.econ.cur.pppOut || 0) - beforeM) + ')');

// 存档往返
const payload = g.serialize();
ok(!!payload.railConcession && !!payload.railConcession.chaoma && !!payload.railConcession.ningan, 'serialize includes per-line railConcession');
let restoreOk = true, restored;
try {
  const body = JSON.stringify(payload), raw = JSON.stringify({ format: C.CFG.SAVE_FORMAT, version: 2, gameVersion: '2.7.1', savedAt: Date.now(), body, checksum: C.U.fnv(body) });
  const imp = await C.Save.importText(raw); restored = await C.Save.load(imp.slotId);
} catch (e) { restoreOk = false; console.log('  restore error:', e.message); }
ok(restoreOk, 'save round-trip no throw');
if (restored) ok(!!restored.railConcession && restored.railConcession.chaoma?.local === 3 && restored.railConcession.ningan?.local === 2, 'both concessions restored');

// 旧扁平格式存档兼容：{local,express} 应视为巢马合同
const g2 = C.Game.create({ mode: 'free', seed: 20270101 });
g2.railConcession = { local: 4, express: 0 };
g2.compiled = C.RailConcessions.compile(g2.net, g2);
ok(g2.compiled.net.lines.l900000.railOwned === true, 'legacy flat state → chaoma owned');
ok(g2.compiled.net.lines.l900100.railOwned === false, 'legacy flat state → ningan still external');

console.log(fail ? ('\nFAILED ' + fail) : '\nALL GREEN'); process.exit(fail ? 1 : 0);
