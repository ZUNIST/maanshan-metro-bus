// 拖动 / 缩放基准：同样视口、同样动作，在任意版本（原作者仓库或本分支）上测
//   ① 拖动期间的掉帧（长任务与帧间隔 p95）② 撒手后「画面补齐」的耗时 ③ 放大三档的补齐耗时
// 用法：node tools/bench-pan.mjs <url> [map] [宽] [高] [标签]
import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const url = process.argv[2] || 'http://127.0.0.1:8125/index.html';
const MAP = process.argv[3] || 'gz';
const W = Number(process.argv[4] || 1440), H = Number(process.argv[5] || 900);
const TAG = process.argv[6] || 'run';
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpb${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const mouse = (type, x, y, extra) => send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra || {}));
const wheel = async (x, y, dy) => { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); };
// 页面内：记录帧间隔与长任务
const INSTALL = `(function(){ if(window.__ft) return 'on';
  window.__ft=[]; window.__lt=[]; var last=performance.now();
  (function loop(t){ window.__ft.push(+(t-last).toFixed(1)); last=t; if(window.__ft.length>6000) window.__ft.shift(); requestAnimationFrame(loop); })(performance.now());
  try{ new PerformanceObserver(function(l){ for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({entryTypes:['longtask']}); }catch(e){}
  return 'ok';})()`;
const stat = () => ev(`(function(){var R=CM.R; if(!R) return null; return {z:+R.cam.zoom.toFixed(2),dl:R.displayedLevel,rq:R.requestedLevel,pend:R.stats.pendingVisible||0,cache:+(R.cachePx/1e6).toFixed(1),off:!!R.off,g:R.ground.size,i:R.iso.size}})()`);
const clearStats = () => ev(`(function(){window.__ft=[]; window.__lt=[]; return 1})()`);
const readStats = () => ev(`(function(){var f=window.__ft.slice(), l=window.__lt.slice();
  function q(a,p){ if(!a.length) return null; var b=a.slice().sort(function(x,y){return x-y}); return +b[Math.min(b.length-1,Math.floor(b.length*p))].toFixed(1); }
  var lt=l.map(function(x){return x[1]});
  return {frames:f.length, gap50:q(f,.5), gap95:q(f,.95), gapMax:q(f,1), longN:lt.length,
    longSum:lt.reduce(function(a,b){return a+b},0), longMax:lt.length?Math.max.apply(null,lt):0};})()`);
const settle = async (maxMs, label) => {
  const t0 = Date.now();
  for (;;) {
    const s = await stat();
    if (s && s.pend === 0 && s.dl === s.rq) return { label, ms: Date.now() - t0, ...s };
    if (Date.now() - t0 > maxMs) return { label, ms: Date.now() - t0, timeout: 1, ...s };
    await sleep(50);
  }
};
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  const nav = Date.now();
  await send('Page.navigate', { url });
  await sleep(5000);
  await ev(INSTALL);
  console.log(TAG, 'nav2interactive', Date.now() - nav);
  await ev(`CM.newGame({map:'${MAP}',mode:'free',name:'b'})`);
  for (let i = 0; i < 160; i++) { await sleep(400); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const tBoot = Date.now() - nav;
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(3000);
  await ev("CM.game.setSpeed(0)");
  await ev("CM.R.zoomAt(CM.R.w/2, CM.R.h/2, 34/CM.R.cam.zoom)");   // 统一机位：固定缩放
  const s0 = await settle(20000, 'warm');
  console.log(TAG, 'boot', tBoot, 'warm', JSON.stringify(s0));
  // ① 拖动：向右下拖 600 px
  const cx = W / 2, cy = H / 2;
  await clearStats();
  await mouse('mousePressed', cx, cy);
  for (let k = 1; k <= 20; k++) { await mouse('mouseMoved', cx + k * 30, cy + k * 18); await sleep(16); }
  await mouse('mouseReleased', cx + 600, cy + 360);
  await sleep(120);
  console.log(TAG, 'drag-frames', JSON.stringify(await readStats()));
  console.log(TAG, 'drag-settle', JSON.stringify(await settle(25000, 'drag')));
  // ② 放大三档
  for (let k = 0; k < 3; k++) { await wheel(cx, cy, -240); await sleep(120); }
  console.log(TAG, 'zoom-in', JSON.stringify(await settle(25000, 'in')));
  // ③ 缩小三档
  for (let k = 0; k < 3; k++) { await wheel(cx, cy, 240); await sleep(120); }
  console.log(TAG, 'zoom-out', JSON.stringify(await settle(25000, 'out')));
  // ④ 快速连续拖动（不等待补齐）
  await clearStats();
  await mouse('mousePressed', cx, cy);
  for (let k = 1; k <= 30; k++) { await mouse('mouseMoved', cx - k * 24, cy + k * 10); await sleep(12); }
  await mouse('mouseReleased', cx - 720, cy + 300);
  await sleep(120);
  console.log(TAG, 'pan2-frames', JSON.stringify(await readStats()));
  console.log(TAG, 'pan2-settle', JSON.stringify(await settle(25000, 'pan2')));
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
