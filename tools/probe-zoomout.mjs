// 诊断「缩小视角时画面迟迟不切档」：给 TilePool 与渲染加计时，逐 250 ms 采样档位、缺口、缓存与各档分块数。
// 用法：node tools/probe-zoomout.mjs <url> [map]
import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const url = process.argv[2] || 'http://127.0.0.1:8127/index.html';
const MAP = process.argv[3] || 'ms';
const SPEED = Number(process.argv[4] || '0');
const W = 1440, H = 900;
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpz9${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const wheel = async (x, y, dy) => { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); };
const INSTALL = `(function(){
  if (window.__tile) return 'on';
  var R = CM.R, P = R.tiles; window.__tile = {send:{}, lat:[], byLvl:{}, req:0, mainMs:0, frames:0};
  var T = window.__tile;
  var origReq = P.request.bind(P), origDone = P.done.bind(P);
  P.request = function(q){ var t=performance.now(); var ok = origReq(q); if (ok) { T.send[q.key]=t; T.req++; T.byLvl[q.lvl]=(T.byLvl[q.lvl]||0)+1; } return ok; };
  P.done = function(slot,m){ if (m && m.type==='tile' && T.send[m.key]!=null) { T.lat.push([m.key, Math.round(performance.now()-T.send[m.key])]); delete T.send[m.key]; } return origDone(slot,m); };
  T.isoNew={}; T.isoCancel=0; T.isoSteps=0; T.isoStepMs=0; T.isoDone=0;
  var origGen=R.isoChunkGen.bind(R), origCancel=R.cancelIsoJob.bind(R);
  R.isoChunkGen=function(lvl,ci,cj,C){ T.isoNew[lvl]=(T.isoNew[lvl]||0)+1; var g=origGen(lvl,ci,cj,C);
    return { next:function(){ var t=performance.now(); var r=g.next(); T.isoSteps++; T.isoStepMs+=performance.now()-t; if(r.done)T.isoDone++; return r; }, 'return':function(v){ return g.return(v); } }; };
  R.cancelIsoJob=function(){ T.isoCancel++; return origCancel(); };
  T.lastQ=[]; T.lastBuild=null; T.recent=[];
  var origRL=R.rasterLevel.bind(R);
  R.rasterLevel=function(eff,b,q,buildings){ var r=origRL(eff,b,q,buildings);
    T.lastBuild=!!buildings; T.lastQ=q.map(function(x){return [x.kind,x.key,+x.d.toFixed(1)]});
    if (q.length) T.recent.push([Math.round(performance.now()),q.length,q.slice(0,4).map(function(x){return x.key}).join(' ')]);
    if (T.recent.length>40) T.recent.shift(); return r; };
  var origRender = R.render.bind(R);
  R.render = function(dt,ui){ var t=performance.now(); var r=origRender(dt,ui); T.mainMs += performance.now()-t; T.frames++; return r; };
  return 'ok';})()`;
const snap = () => ev(`(function(){var R=CM.R, T=window.__tile, g={}, i={};
  R.ground.forEach(function(e){ g[e.lvl||'?']=(g[e.lvl||'?']||0)+1; });
  R.iso.forEach(function(e){ i[e.lvl||'?']=(i[e.lvl||'?']||0)+1; });
  var lat=T.lat.map(function(x){return x[1]}).sort(function(a,b){return a-b});
  return {dl:R.displayedLevel,rq:R.requestedLevel,pend:R.stats.pendingVisible,lodPrep:!!R.stats.lodPreparing,
    cache:+(R.cachePx/1e6).toFixed(1), groundN:R.ground.size, isoN:R.iso.size, ground:g, iso:i,
    req:T.req, done:T.lat.length, inflight:Object.keys(T.send).length,
    tilePending:R.tiles.pending.size, ov:!!R.overviewJob, ovBusy:!!R.tiles.ovBusy,
    lat50:lat.length?lat[(lat.length*0.5)|0]:null, lat95:lat.length?lat[Math.min(lat.length-1,(lat.length*0.95)|0)]:null, latMax:lat.length?lat[lat.length-1]:null,
    mainAvg:+(T.mainMs/Math.max(1,T.frames)).toFixed(2), frames:T.frames,
    isoNew:T.isoNew, isoCancel:T.isoCancel, isoSteps:T.isoSteps, isoDone:T.isoDone, stepAvg:+(T.isoStepMs/Math.max(1,T.isoSteps)).toFixed(1),
    jobKey:R.isoJob?R.isoJob.key:null, lastBuild:T.lastBuild, lastQ:T.lastQ.slice(0,8),
    cam:[+R.cam.cx.toFixed(4),+R.cam.cy.toFixed(4),+R.cam.zoom.toFixed(4),+(R.cam.t||0).toFixed(4),+(R.cam.tz||0).toFixed(4)],
    probeKeys:['i32:19:11','i32:15:7','i32:18:12','i32:14:8'].map(function(k){var e=R.iso.get(k);return [k,e?[e.stale?1:0,Math.round(e.used)]:'none']})}})()`);
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(5000);
  await ev(`CM.newGame({map:'${MAP}',mode:'free',name:'z'})`);
  for (let i = 0; i < 160; i++) { await sleep(400); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(3000);
  await ev(`CM.game.setSpeed(${SPEED})`);
  await ev("CM.R.zoomAt(CM.R.w/2, CM.R.h/2, 96/CM.R.cam.zoom)");
  await sleep(6000);
  console.log('ready', JSON.stringify(await ev(INSTALL)));
  console.log('at96', JSON.stringify(await snap()));
  // 缩小 3 档
  for (let k = 0; k < 3; k++) { await wheel(W / 2, H / 2, 240); await sleep(100); }
  const t0 = Date.now();
  for (let k = 0; k < 80; k++) {
    await sleep(250);
    const s = await snap();
    console.log('t+' + (Date.now() - t0), JSON.stringify(s));
    if (s.dl === s.rq && s.pend === 0) break;
  }
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
