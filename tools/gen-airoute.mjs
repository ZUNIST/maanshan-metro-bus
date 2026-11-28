// AI 线路生成器验证：在成熟年份的马鞍山地图上生成几条线，写入线网并逐条聚焦截图。
// 用法：node tools/gen-airoute.mjs [outPrefix] [mapId]
// 依赖本地服务：http://127.0.0.1:8123/index.html
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 300);
const PREFIX = process.argv[2] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/gen-airoute';
const MID = process.argv[3] || 'ms30';
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
const shot = async (path) => { const s = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path, Buffer.from(s.data, 'base64')); };

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
  await sleep(5000);

  await ev(`CM.newGame({map:'${MID}',mode:'free',name:'airoute'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const btn = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (btn) await click(btn[0], btn[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');

  const report = await ev(`(function(){
    var g = CM.game, A = CM.AIRoute, U = CM.U;
    var cols = ['#c0392b','#7d5ba6','#b8860b'];
    var out = { map:'${MID}', year:g.clock.y, lines: [], logs: [] };
    // 道路距离场的真实分布（用于校准阈值）
    var rf = A.roadField(g.city);
    var hist=[0,0,0,0]; for(var q=0;q<rf.length;q++) hist[rf[q]]++;
    out.roadHist = hist;
    var ORG = 1;
    var first = null;
    for (var k = 0; k < 2; k++) {
      var opt = { tryN: 5 };
      // 第二条刻意从第一条线的端点出发、朝它另一端的延长方向走：
      // 这样路径必然先沿自家的既有轨道走一段再分出去，才能验证共线是否真的生效。
      if (k === 1 && first) {
        var s0 = g.net.stations[first.ap.stations[0]];
        var s1 = g.net.stations[first.ap.stations[first.ap.stations.length - 1]];
        var vx = s1.x - s0.x, vy = s1.y - s0.y, vl = Math.max(1e-6, Math.sqrt(vx*vx+vy*vy));
        vx /= vl; vy /= vl;
        opt.from = { x: s0.x, y: s0.y };
        opt.forceTo = { x: s1.x + vx * 11, y: s1.y + vy * 11 };
      }
      var pick = A.choose(g, ORG, opt);
      if (!pick) { out.logs.push('第 '+(k+1)+' 条：没有可行方案'); break; }
      if (opt.forceTo) {
        pick.to = opt.forceTo;
        pick.route = A.plan(g, { from: opt.from, to: opt.forceTo, orgId: ORG });
        if (pick.route.ok) { pick.conf = A.conflict(g, ORG, pick.route.pts); pick.est = A.estimate(g, pick.route); }
      }
      var ap = A.apply(g, pick.route, { name: '私铁'+(k+1)+'号线', color: cols[k], owner: ORG });
      if (!ap.ok) { out.logs.push('第 '+(k+1)+' 条：写入失败'); break; }
      if (k === 0) first = { ap: ap };
      var xs=pick.route.stations.map(function(s){return s.x;}), ys=pick.route.stations.map(function(s){return s.y;});
      out.lines.push({
        name:'私铁'+(k+1)+'号线', km:+pick.route.km.toFixed(2), stations:pick.route.stations.length,
        pts:pick.route.pts.length, raw:pick.route.raw, ms:pick.route.ms,
        onStreet:+(pick.route.onStreet*100).toFixed(0), turns:pick.route.turns,
        ownCorridor:+(pick.conf.own*100).toFixed(0), otherCorridor:+(pick.conf.other*100).toFixed(0),
        reuseStations:ap.reused, sharedSegments:ap.shared,
        cover:+(pick.est.cover*100).toFixed(0), yearFare:Math.round(pick.est.yearFare), yearOps:Math.round(pick.est.yearOps),
        cost:Math.round(pick.est.cost), trips:Math.round(pick.est.trips),
        from:[+pick.from.x.toFixed(1),+pick.from.y.toFixed(1)], to:[+pick.to.x.toFixed(1),+pick.to.y.toFixed(1)],
        cx:(Math.min.apply(null,xs)+Math.max.apply(null,xs))/2, cy:(Math.min.apply(null,ys)+Math.max.apply(null,ys))/2,
        w:Math.max.apply(null,xs)-Math.min.apply(null,xs), h:Math.max.apply(null,ys)-Math.min.apply(null,ys) });
      g.touch(); g.refreshOperations();
    }
    return out;
  })()`);

  await sleep(1500);
  const files = [];
  if (report && report.lines) {
    for (let i = 0; i < report.lines.length; i++) {
      const L = report.lines[i];
      const zoom = Math.max(8, Math.min(46, Math.min(1500 / (L.w + 4), 900 / (L.h + 4))));
      await ev(`(function(){var R=CM.R;R.cam.cx=${L.cx};R.cam.cy=${L.cy};R.cam.zoom=R.cam.tz=${zoom.toFixed(1)};})()`);
      await sleep(5000);
      const p = `${PREFIX}-${i + 1}.png`;
      await shot(p);
      files.push(p);
    }
  }

  const info = await ev("(function(){var R=CM.R;return {z:+R.cam.zoom.toFixed(1), lines:Object.keys(CM.game.net.lines).length, st:Object.keys(CM.game.net.stations).length, seg:Object.keys(CM.game.net.segments).length}})()");

  // 全景：把所有新建线（owner 非空）放进同一画面
  await ev(`(function(){
    var R=CM.R, g=CM.game, xs=[], ys=[];
    for (var lid in g.net.lines){ var L=g.net.lines[lid]; if(!L.owner) continue;
      for (var sid in g.net.segments){ var s=g.net.segments[sid]; if(s.line!==lid) continue;
        var A=g.net.stations[s.a], B=g.net.stations[s.b];
        if(A){xs.push(A.x);ys.push(A.y);} if(B){xs.push(B.x);ys.push(B.y);}
        (s.pts||[]).forEach(function(p){xs.push(p[0]);ys.push(p[1]);});
      }
    }
    if(!xs.length) return false;
    var cx=(Math.min.apply(null,xs)+Math.max.apply(null,xs))/2, cy=(Math.min.apply(null,ys)+Math.max.apply(null,ys))/2;
    var w=Math.max.apply(null,xs)-Math.min.apply(null,xs), h=Math.max.apply(null,ys)-Math.min.apply(null,ys);
    R.cam.cx=cx; R.cam.cy=cy;
    R.cam.zoom=R.cam.tz=Math.max(6, Math.min(44, Math.min((R.w||1200)/(w+8), (R.h||800)/(h+8))));
    return {w:w,h:h,z:R.cam.zoom};
  })()`);
  await sleep(5000);
  const allPng = `${PREFIX}-all.png`;
  await shot(allPng);
  files.push(allPng);

  console.log(JSON.stringify({ report, info, logs: logs.slice(-6), files }, null, 1));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  try { child.kill(); } catch {}
  process.exit(0);
}
