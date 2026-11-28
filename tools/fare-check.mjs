// 票价口径核对：同一剧本下，比较「自由模式（票价冻结）」与「正常模式（随物价调价）」的票款覆盖率。
// 用途：判断票款覆盖率低是「结构规律」还是「口径/参数」问题。
// 用法：node tools/fare-check.mjs [mapId]
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.fc${PORT}`, 'about:blank'], { stdio: 'ignore' });

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

async function boot(mode) {
  await send('Page.navigate', { url: SRC });
  for (let i = 0; i < 160; i++) { await sleep(500); if (await ev("typeof CM !== 'undefined' && typeof CM.newGame === 'function'") === true) break; }
  const arg = mode ? `{map:'${MID}',mode:'${mode}',name:'fc'}` : `{map:'${MID}',name:'fc'}`;
  await ev(`CM.newGame(${arg})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const btn = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (btn) await click(btn[0], btn[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) break; }
}

const SNAP = `(function(){
  var g = CM.game, E = g.econ, y = g.clock.y, M = CM.Model, F = CM.Finance, CFG = CM.CFG;
  var oi = E.opsIndex(y), ci = E.costIndex(y);
  var ref = M && M.fareRef ? M.fareRef(y) : null;
  var out = { year:y, mode:g.mode||'normal', fare:E.fare.flat, fareInc:E.fare.inc||0, fareCap:E.fare.cap||0,
    fareAuto: !!E.fareAuto, fareRef: ref, fareReal: ref ? +(E.fare.flat/ref).toFixed(3) : null,
    opsIndex:+oi.toFixed(2), costIndex:+ci.toFixed(2) };
  var f = F && F.compute ? F.compute(g) : null;
  if (f && f.tot) {
    var costM = (f.tot.train||0)+(f.tot.station||0);
    out.fareM = Math.round(f.tot.fare); out.trainM = Math.round(f.tot.train||0);
    out.stationM = Math.round(f.tot.station||0); out.comM = Math.round(f.tot.com||0);
    out.costM = Math.round(costM);
    out.coverage = costM>0 ? +(f.tot.fare/costM*100).toFixed(1) : null;
    out.coverAll = costM>0 ? +((f.tot.fare+f.tot.com)/costM*100).toFixed(1) : null;
  }
  var d = g.model && g.model.daily;
  if (d) { out.pkm = Math.round(d.metroPkm||0); out.boards = Math.round(d.metro||0);
    // 日均人公里 → 月；票款也是月，两者相除即元/人公里
    if (out.pkm>0 && out.fareM && costM>0) {
      var monthPkm = out.pkm*30.4;
      out.farePerPkm = +(out.fareM*10000/monthPkm).toFixed(3);
      out.costPerPkm = +(costM*10000/monthPkm).toFixed(3);
    }
    // 网络规模，便于换算单位成本
    if (g.compiled && g.compiled.routes) {
      var km=0, nst=0; g.compiled.routes.forEach(function(rt, i){ var L=rt.line; if(L&&L.rail) return; km += (rt.lenM||0)/1000; nst += (rt.stIds||[]).length; });
      out.routeKm = +km.toFixed(1); out.stationN = nst;
    }
    // 逐条线路的营业系数：票款 ÷ (车辆 + 车站)。<100% 表示这条线自己养得活自己
    if (f && f.lines) {
      out.lines = f.lines.map(function(L){ return { name: (L.L&&L.L.name)||L.lid, km:+((L.L&&L.L.lenM||0)/1000).toFixed(1),
        nst:L.nst, riders:Math.round(L.riders||0), fare:Math.round(L.fare), cost:Math.round(L.cost),
        rec: L.cost>0 ? +(L.fare/L.cost*100).toFixed(0) : null }; })
        .sort(function(a,b){ return (b.rec||0)-(a.rec||0); });
    }
    // 车辆成本口径核对：按「频率 × 里程 × 编组 × 24h」手算车厢公里，与模型内部值对比
    if (g.compiled && g.compiled.routes && g.model && g.model.daily) {
      var res = g.model.resultsFor ? g.model.resultsFor('wd') : null;
      out.ckm = null;
      if (res && res.per && res.per[0] && res.per[0].freq) {
        var ckmDay = 0, lenAll = 0, nR = g.compiled.routes.length;
        for (var r2=0;r2<nR;r2++){
          var rt = g.compiled.routes[r2], cars = rt.cars || 6;
          var fd = res.per[0].freqDir ? (res.per[0].freqDir[2*r2]||0)+(res.per[0].freqDir[2*r2+1]||0) : 2*(res.per[0].freq[r2]||0);
          var km1 = (rt.lenM||0)/1000; lenAll += km1;
          ckmDay += fd * km1 * cars * 19;   // 19 个运营小时
        }
        out.ckm = { routes:nR, lenKm:+lenAll.toFixed(1), carKmDay:Math.round(ckmDay),
          costDayWan:+((ckmDay*CFG.ops.carKmCost)).toFixed(1),
          modelTrainWanPerMonth:Math.round(f.tot.train||0),
          impliedCarKmMonth: Math.round((f.tot.train||0)/(CFG.ops.carKmCost*30.4)) };
      }
      out.cfgCarKmCost = CFG.ops.carKmCost;
    }
  }
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

  await boot('free');
  const freeR = await ev(SNAP);

  await boot(null);
  const normR = await ev(SNAP);

  console.log(JSON.stringify({ map: MID, free: freeR, normal: normR, logs: logs.slice(-4) }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
