// 各公司分开计价的验证：把线网拆成两家公司，看仿真是否按公司分别计费、票款是否自收。
// 用法：node tools/fare-split.mjs [mapId]
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1500,950',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.fs${PORT}`, 'about:blank'], { stdio: 'ignore' });

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

async function waitReady(max = 120) {
  for (let i = 0; i < max; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) return true; }
  return false;
}
const SNAP = `(function(){
  var g = CM.game, m = g.model, C = CM.Clearing, R = CM.Companies;
  var d = m && m.daily || {}, net = m && m.net;
  var out = { ready: !!(m && m.trafficReady && m.trafficReady()), coN: net ? net.coN : null,
    fare: Math.round(d.fare||0), metroPkm: Math.round(d.metroPkm||0), metro: Math.round(d.metro||0) };
  out.byCo = d.byCo ? Object.keys(d.byCo).map(function(k){ return { co:+k, name: R.name(g,+k), fare: Math.round(d.byCo[k]) }; }).sort(function(a,b){return b.fare-a.fare;}) : null;
  var chk = C && C.check ? C.check(g) : null;
  if (chk) { out.check = { ratio:+chk.ratio.toFixed(3), ratioAll:+chk.ratioAll.toFixed(3), fareRatio: chk.fareRatio ? +chk.fareRatio.toFixed(3) : null, companies: chk.companies }; }
  var pn = C && C.pnl ? C.pnl(g) : null;
  if (pn) { out.pnl = Object.keys(pn).map(function(k){ var t=pn[k]; return { co:+k, name:R.name(g,+k), fare:Math.round(t.fare), share:+(t.share*100).toFixed(1), cost:Math.round(t.cost), cover:+((t.income/t.cost)*100).toFixed(0) }; }).sort(function(a,b){return b.fare-a.fare;}); }
  return out;
})()`;

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
  await ev(`CM.newGame({map:'${MID}',name:'fs'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const b0 = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (b0) await click(b0[0], b0[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  await waitReady();
  const single = await ev(SNAP);

  // 拆公司：把一条线划给新公司
  const split = await ev(`(function(){
    var g = CM.game, R = CM.Companies;
    R.ensure(g);
    var id = R.add(g, '雨山轨道');
    var lids = Object.keys(g.net.lines).filter(function(k){ return !g.net.lines[k].rail; });
    // 选站点最多的那条划出去，跨公司换乘才明显
    lids.sort(function(a,b){ return Object.keys(g.net.segments).filter(function(s){return g.net.segments[s].line===b;}).length - Object.keys(g.net.segments).filter(function(s){return g.net.segments[s].line===a;}).length; });
    var moved = lids[0] ? R.assign(g, lids[0], id) : false;
    if (typeof g.refreshOperations === 'function') g.refreshOperations();
    return { newCo: id, movedLine: lids[0] || null, moved: moved, lines: lids.length };
  })()`);

  await waitReady();
  await sleep(4000);
  const two = await ev(SNAP);

  console.log(JSON.stringify({ map: MID, singleCompany: single, split: split, twoCompanies: two, logs: logs.slice(-5) }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
