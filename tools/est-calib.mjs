// 估算校准：拿线网里已有的每条线，用其真实里程/站数跑 A.estimate，
// 与 Finance 的真实营业系数对拍。用于确认「AI 的赚钱判据」与真实账本同口径。
// 用法：node tools/est-calib.mjs [mapId]
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.ec${PORT}`, 'about:blank'], { stdio: 'ignore' });

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
  await ev(`CM.newGame({map:'${MID}',name:'ec'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const btn = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (btn) await click(btn[0], btn[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) break; }

  const out = await ev(`(function(){
    var g = CM.game, A = CM.AIRoute, F = CM.Finance.compute(g), res = { rows: [], cfg: {
      carKmCost: CM.CFG.ops.carKmCost, stationDailyM: CM.CFG.ops.stationDaily.M,
      fMin: CM.CFG.metro.fMin[0], cars: (CM.CFG.metro.carsBySize||{}).M,
      avgFare: (g.model.daily||{}).avgFare, pkm: (g.model.daily||{}).metroPkm, boards: (g.model.daily||{}).metro } };
    // 真实周转量，用于反推真实票款（Finance 的 fare 是按线路里程占比摊的，不是真实值）
    F.lines.forEach(function(L){
      if (!L.L || L.L.rail || !(L.cost > 0)) return;
      // 用这条线沿途车站的坐标伪造 route，喂给 estimate
      var sts = [], kmMax = 0;
      var C = g.model.net.C;
      C.routes.forEach(function(rt){
        if (rt.lineId !== L.L.id) return;
        kmMax = Math.max(kmMax, (rt.lenM || 0) / 1000);
        rt.stIds.forEach(function(sid){ var s = g.net.stations[sid]; if (s && !s.v) sts.push(s); });
      });
      if (!sts.length) return;
      var km = kmMax;
      // 去重站点
      var seen = {}, uniq = []; sts.forEach(function(s){ if (seen[s.id]) return; seen[s.id] = 1; uniq.push(s); });
      var est = A.estimate(g, { km: km, stations: uniq, type: L.L.type || 'underground' });
      res.rows.push({ name: L.L.name, type: L.L.type, km: +km.toFixed(1), nst: uniq.length,
        real_rec: +(L.rec*100).toFixed(0), est_cover: +(est.cover*100).toFixed(0),
        real_cost: Math.round(L.cost), est_ops_year: Math.round(est.yearOps),
        est_density: Math.round(est.density), real_riders: Math.round(L.riders||0) });
    });
    return res;
  })()`);

  console.log(JSON.stringify({ map: MID, calib: out, logs: logs.slice(-4) }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
