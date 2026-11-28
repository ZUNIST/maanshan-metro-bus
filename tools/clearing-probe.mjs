// 清分验证：造几条分属不同公司的线，跑完整仿真，对比「按里程清分」与「按上车人次摊」的差别。
// 用法：node tools/clearing-probe.mjs [mapId]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const OUT = process.argv[3] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/clearing.png';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cps${PORT}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };

try {
  let t = null;
  for (let i = 0; i < 80 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch {} }
  if (!t) throw new Error('CDP 未就绪');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map(a => a.value || a.description || '').join(' '));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: SRC });
  // 新 profile 没有缓存，所有脚本要重新下载；等 CM 真正可用再继续
  for (let i = 0; i < 160; i++) {
    await sleep(500);
    const ok = await ev("typeof CM !== 'undefined' && typeof CM.newGame === 'function'");
    if (ok === true) break;
  }
  await ev(`CM.newGame({map:'${MID}',mode:'free',name:'clearing'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const btn = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (btn) await click(btn[0], btn[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');

  // 等第一次仿真算完，再动手改线网
  const ready0 = await ev(`(function(){var i=0;for(;i<0;i++);return !!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())})()`);

  const built = await ev(`(function(){
    var g = CM.game, A = CM.AIRoute, U = CM.U, R = CM.Companies;
    R.ensure(g);
    var out = { companies: [], lines: [], logs: [] };
    var id1 = R.add(g, '临江私铁');
    var id2 = R.add(g, '雨山轨道');
    out.companies.push({ id: 0, name: R.name(g, 0) }, { id: id1, name: R.name(g, id1) }, { id: id2, name: R.name(g, id2) });
    // 两条线分给两家公司：都用 choose，起点从各自已有的站（第一次都从固有线网起）
    var specs = [{ co: id1, color: '#c0392b', name: '临江线' }, { co: id2, color: '#7d5ba6', name: '雨山线' }];
    for (var i = 0; i < specs.length; i++) {
      var sp = specs[i];
      var pick = A.choose(g, sp.co, { tryN: 6, minCells: 8 });
      if (!pick) { out.logs.push(sp.name + '：没有可行方案'); continue; }
      var ap = A.apply(g, pick.route, { name: sp.name, color: sp.color, owner: sp.co, coId: sp.co });
      if (!ap.ok) { out.logs.push(sp.name + '：写入失败'); continue; }
      out.lines.push({ name: sp.name, co: sp.co, km: +pick.route.km.toFixed(2), stations: ap.stations.length, shared: ap.shared, reused: ap.reused });
      g.touch(); g.refreshOperations();
    }
    return out;
  })()`);

  // 等仿真重算完（最多 3 分钟）
  let ready = false;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    ready = await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())');
    if (ready === true) break;
  }

  const report = await ev(`(function(){
    var g = CM.game, C = CM.Clearing, R = CM.Companies, out = { ready: !!(g.model&&g.model.trafficReady&&g.model.trafficReady()) };
    var cl = C.pkm(g);
    if (!cl) { out.err = '清分数据不可用'; return out; }
    out.check = C.check(g);
    out.pkm = {}; out.share = {};
    for (var k in cl.by) { out.pkm[k] = Math.round(cl.by[k]); out.share[k] = +(cl.by[k]/cl.total*100).toFixed(1); }
    // 对照：按上车人次摊（旧算法）
    var led = CM.CompaniesUI.ledger(g), boards = {};
    var tb = 0; for (var k2 in led) tb += led[k2].boards;
    out.boards = {};
    for (var k3 in led) { out.boards[k3] = tb > 0 ? +(led[k3].boards/tb*100).toFixed(1) : 0; }
    out.totalPkm = Math.round(cl.total);
    // 进站份额（起步价按进站归属的基准）
    var bs = C.boardShare(g);
    out.boardShare = {};
    if (bs) for (var k4 in bs.share) out.boardShare[k4] = +(bs.share[k4]*100).toFixed(1);
    // 不同起步价占比下的份额
    out.mix = {};
    [0, 0.2, 0.3, 0.5, 0.75].forEach(function(kk){
      var sh = C.share(g, { boardWeight: kk }), o = {};
      if (sh) for (var c in sh) o[c] = +(sh[c]*100).toFixed(1);
      out.mix[kk] = o;
    });
    // 盈亏：月票款 vs 月运营成本
    var mm = g.model, lines = g.net.lines;
    var dailyFareM = ((mm.daily && mm.daily.fare) ? mm.daily.fare/10000 : 0) * 30.4;   // 万元/月
    var kmBy = {}, stSets = {};
    if (g.compiled && g.compiled.routes) g.compiled.routes.forEach(function(rt){
      if (!rt.line || rt.line.rail) return;
      var co = R.lineCo(rt.line);
      kmBy[co] = (kmBy[co]||0) + (rt.lenM||0)/1000;
    });
    for (var sid in g.net.segments) {
      var sg = g.net.segments[sid], L = lines[sg.line];
      if (!L || L.rail) continue;
      var co2 = R.lineCo(L);
      if (!stSets[co2]) stSets[co2] = {};
      stSets[co2][sg.a] = 1; stSets[co2][sg.b] = 1;
    }
    out.econ = {};
    var sh0 = C.share(g);
    for (var co3 in kmBy) {
      var km = kmBy[co3], nst = Object.keys(stSets[co3]||{}).length;
      var costY = km*426 + nst*2.6*365;              // 万元/年（与 airoute.estimate 同口径）
      var fareM = dailyFareM * ((sh0 && sh0[co3]) || 0);
      var costM = costY / 12;
      out.econ[co3] = { km:+km.toFixed(1), st:nst, fareM:+fareM.toFixed(0), costM:+costM.toFixed(0), netM:+(fareM-costM).toFixed(0) };
    }
    out.dailyFareM = +dailyFareM.toFixed(0);
    // 完整公司损益表（票款 + 商业 + 补贴 − 成本）
    var pn = C.pnl ? C.pnl(g) : null;
    out.pnl = {};
    if (pn) for (var k5 in pn) {
      var q = pn[k5];
      out.pnl[k5] = { fare:+q.fare.toFixed(0), commerce:+q.commerce.toFixed(0), sub:+q.sub.toFixed(0),
        cost:+q.cost.toFixed(0), stationOps:+q.stationOps.toFixed(0), todCost:+q.todCost.toFixed(0),
        train:+q.train.toFixed(0), net:+q.net.toFixed(0), cover:+(q.cover*100).toFixed(0), pkm:Math.round(q.pkm) };
    } else out.pnl.err = 'Finance 未就绪';
    return out;
  })()`);

  // 打开公司面板，确认清分的显示（周转量、分得比例）正常
  const uiOpen = await ev("(function(){try{CM.ui.openPage('companies');return 'ok'}catch(e){return 'ERR '+e.message}})()");
  await sleep(2000);
  const panelText = await ev("(function(){var t=(document.body.innerText||'').replace(/\\s+/g,' ');var i=t.indexOf('多公司运营');return i>=0?t.slice(i,i+900):t.slice(-900)})()");

  const sh = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(OUT, Buffer.from(sh.data, 'base64'));
  console.log(JSON.stringify({ built, report, uiOpen, panelText, logs: logs.slice(-5), out: OUT }, null, 1));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  try { child.kill(); } catch {}
  process.exit(0);
}
