// PPP 报价浏览：列出 AI 眼中的候选走廊，以及每条线的可用性付费报价与「自建 vs PPP」净现值对比。
// 用法：node tools/ppp-bid.mjs [mapId]
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.pb${PORT}`, 'about:blank'], { stdio: 'ignore' });

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
  await ev(`CM.newGame({map:'${MID}',name:'pb'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const btn = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (btn) await click(btn[0], btn[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) break; }

  const out = await ev(`(function(){
    var g = CM.game, A = CM.AIRoute, R = CM.Companies;
    R.ensure(g);
    var org = R.add(g, '示意私铁');
    var pick = A.choose(g, org, { tryN: 8 });
    if (!pick) return { err: '没有候选' };
    var rows = (pick.all || [pick]).slice(0, 6).map(function(t){
      var b = A.bid(g, t.route);
      return { km: +b.km.toFixed(1), nst: b.nst,
        density: Math.round(b.density), cover: +(b.cover*100).toFixed(0),
        capex_yi: +(b.capex/10000).toFixed(2),
        opex_yi: +(b.opexY/10000).toFixed(2), fare_yi: +(b.fareY/10000).toFixed(2),
        gap_yi: +(b.gap/10000).toFixed(2),
        ask_yi: +(b.ask/10000).toFixed(2),
        pvSelf_yi: +(b.pvSelf/10000).toFixed(2), pvPpp_yi: +(b.pvPpp/10000).toFixed(2),
        extra_pct: b.pvSelf>0 ? +((b.pvPpp/b.pvSelf-1)*100).toFixed(1) : null,
        ok: t.ok };
    });
    return { ppp: A.PPP, fiscal: { funds: Math.round((g.econ&&g.econ.funds)||0), cur: g.econ&&g.econ.cur || null },
      rows: rows, logs: [] };
  })()`);

  console.log(JSON.stringify({ map: MID, result: out, logs: logs.slice(-4) }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
