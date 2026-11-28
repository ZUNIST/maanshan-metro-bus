// 检查 A.apply 建出来的线能不能进编译结果（有没有交路、有没有里程）。
// 用法：node tools/ai-compile-check.mjs [mapId]
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1400,900',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.ac${PORT}`, 'about:blank'], { stdio: 'ignore' });

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
  await ev(`CM.newGame({map:'${MID}',name:'ac'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const b0 = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (b0) await click(b0[0], b0[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) break; }

  const out = await ev(`(function(){
    var g = CM.game, A = CM.AIRoute, R = CM.Companies, out = {};
    R.ensure(g);
    var co = R.add(g, '测试私铁');
    var pick = A.choose(g, co, { tryN: 6 });
    if (!pick) return { err: '没有候选' };
    var ap = A.apply(g, pick.route, { name: '测试线', color: '#c0392b', owner: co, coId: co });
    if (!ap.ok) return { err: '写入失败' };
    var L = g.net.lines[ap.lineId];
    out.line = { id: ap.lineId, root: L.root, name: L.name, coId: L.coId,
      segs: Object.keys(g.net.segments).filter(function(k){ return g.net.segments[k].line === ap.lineId; }).length,
      stations: ap.stations.length };
    // 直接编译一次，看这条线有没有交路
    var C = CM.Metro.compile(g.net, g.city);
    var mine = C.routes.filter(function(r){ return r.lineId === ap.lineId; });
    out.routes = mine.map(function(r){ return { id:r.id, nst:r.stIds.length, lenM:Math.round(r.lenM), cars:r.cars, svc:r.svc, loop:!!r.loop }; });
    out.compiled = { routes: C.routes.length, servicedStations: C.serviced.filter(Boolean).length };
    // 车站是否被识别为有服务
    out.myStationServiced = mine.length ? mine[0].stIdx.map(function(si){ return !!C.serviced[si]; }) : [];
    return out;
  })()`);

  console.log(JSON.stringify({ map: MID, result: out, logs: logs.slice(-4) }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
