// 长距离连续拖动：每次拖 500 px 后测「补齐耗时」，并统计 2 秒内有多少分块被反复重建（抖动）。
// 用法：node tools/bench-pan-far.mjs <url> [map] [次数]
import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const url = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const MAP = process.argv[3] || 'ms';
const N = Number(process.argv[4] || 6);
const W = 1440, H = 900;
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cppf2${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const INSTALL = `(function(){ if (window.__ch) return 'on'; var R=CM.R, T=window.__ch={new:{}, frame:0};
  var og=R.isoChunkGen.bind(R), oc=R.cancelIsoJob.bind(R);
  R.isoChunkGen=function(l,c,i,C){ T.new[l]=(T.new[l]||0)+1; return og(l,c,i,C); };
  R.cancelIsoJob=function(){ T.cancel=(T.cancel||0)+1; return oc(); };
  return 'ok';})()`;
const st = () => ev(`(function(){var R=CM.R;return {dl:R.displayedLevel,rq:R.requestedLevel,pend:R.stats.pendingVisible,cache:+(R.cachePx/1e6).toFixed(1),cap:+(R.cacheLimit()/1e6).toFixed(0),g:R.ground.size,i:R.iso.size,ms:+(R.lastFrameMs||0).toFixed(1),new:window.__ch?window.__ch.new:null,cancel:window.__ch?window.__ch.cancel:0}})()`);
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(5000);
  await ev(`CM.newGame({map:'${MAP}',mode:'free',name:'f'})`);
  for (let i = 0; i < 160; i++) { await sleep(400); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(3000);
  await ev("CM.game.setSpeed(0)");
  await ev(INSTALL);
  await ev("CM.R.zoomAt(CM.R.w/2, CM.R.h/2, 40/CM.R.cam.zoom)");
  await sleep(5000);
  console.log('start', JSON.stringify(await st()));
  for (let k = 0; k < N; k++) {
    const cx = W / 2, cy = H / 2;
    await mouse('mousePressed', cx, cy);
    for (let j = 1; j <= 12; j++) { await mouse('mouseMoved', cx - j * 40, cy - j * 20); await sleep(10); }
    await mouse('mouseReleased', cx - 480, cy - 240);
    const t0 = Date.now(); let s;
    for (;;) { s = await st(); if (s.pend === 0 && s.dl === s.rq) break; if (Date.now() - t0 > 15000) break; await sleep(50); }
    const settle = Date.now() - t0;
    const before = JSON.parse(JSON.stringify(s.new || {}));
    await sleep(2000);
    const after = await st();
    const rebuilt = Object.keys(after.new || {}).reduce((a, l) => a + after.new[l] - (before[l] || 0), 0);
    console.log('pan' + k, 'settle', settle, 'ms', 'cache', after.cache + '/' + after.cap, 'rebuilt-in-2s', rebuilt, 'cancel', after.cancel, 'g/i', after.g + '/' + after.i, 'frame', after.ms);
  }
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
