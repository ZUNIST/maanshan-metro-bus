// AI 线路财务对拍：同一个 plan，比较 A.estimate 的估算与 Finance 的真实营业系数。
// 用途：确认 AI 的「能赚钱才建」判据是否可信。
// 用法：node tools/ai-line-pnl.mjs [mapId]
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.alp${PORT}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};
const click = async (x, y) => { for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: 1 }); };

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
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: SRC });
  for (let i = 0; i < 160; i++) { await sleep(500); if (await ev("typeof CM !== 'undefined' && typeof CM.newGame === 'function'") === true) break; }
  await ev(`CM.newGame({map:'${MID}',name:'alp'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const btn = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (btn) await click(btn[0], btn[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) break; }

  // 建一条 AI 线（地表线，贴近日本私铁做法），记录估算
  const built = await ev(`(function(){
    var g = CM.game, A = CM.AIRoute, R = CM.Companies, out = { logs: [] };
    R.ensure(g);
    var co = R.add(g, '测试私铁');
    var pick = A.choose(g, co, { tryN: 6, minCells: 8 });
    if (!pick) { out.err = '没有可行方案'; return out; }
    out.est = A.estimate(g, pick.route);
    out.km = +pick.route.km.toFixed(2);
    var ap = A.apply(g, pick.route, { name: '测试线', color: '#c0392b', owner: co, coId: co, type: 'surface' });
    if (!ap.ok) { out.err = '写入失败'; return out; }
    out.lid = ap.lineId; out.stations = ap.stations.length;
    g.touch(); g.refreshOperations();
    return out;
  })()`);

  for (let i = 0; i < 90; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) break; }
  await sleep(3000);

  const cmp = await ev(`(function(){
    var g = CM.game, F = CM.Finance.compute(g), out = { rows: [] };
    // 找到我们新建的那条线（名字「测试线」）
    F.lines.forEach(function(L){
      if (!L.L || L.L.name !== '测试线') return;
      out.rows.push({ name: L.L.name, type: L.L.type, km: +((L.L.lenM||0)/1000).toFixed(2), nst: L.nst,
        riders: Math.round(L.riders||0), fare: Math.round(L.fare), train: Math.round(L.train),
        station: Math.round(L.station), cost: Math.round(L.cost),
        rec: L.cost>0 ? +(L.fare/L.cost*100).toFixed(0) : null });
      out.cars = L.L.train && L.L.train.cars || null;
    });
    out.cfgCarKmCost = CM.CFG.ops.carKmCost;
    out.fMin = CM.CFG.metro.fMin;
    return out;
  })()`);

  console.log(JSON.stringify({ map: MID, built, actual: cmp, logs: logs.slice(-4) }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
