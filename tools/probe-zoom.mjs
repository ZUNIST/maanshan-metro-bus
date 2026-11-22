// 缩放补块耗时探针：进入地图后按固定档位放大/缩小，测量「画面补齐」的时间与块缓存命中情况。
// 用法：node tools/probe-zoom.mjs [mapId] [url]
import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const mapId = process.argv[2] || 'ms';
const URL = process.argv[3] || 'http://127.0.0.1:8123/index.html';
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1500,900', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpz${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const wheel = async (x, y, dy) => { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); };
const state = () => ev(`(function(){var R=CM.R,s=R.stats;return {z:+CM.R.cam.zoom.toFixed(2),dlvl:R.displayedLevel,rlvl:R.requestedLevel,tier:R.detail.tier,pend:s.pendingVisible,cachePx:R.cachePx,g:R.ground.size,i:R.iso.size,limit:R.cacheLimit(),chunks:s.chunksDrawn,ms:+(R.lastQueueMs||0).toFixed(1),fps:+(R.lastFrameMs||0).toFixed(1)}})()`);
// 等画面补齐：pendingVisible 归零且 displayedLevel 追平 requestedLevel
const waitSharp = async (maxMs) => {
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (typeof s === 'string') return { err: s };
    if (!s.pend && s.dlvl === s.rlvl) return Object.assign({ waitMs: Date.now() - t0 }, s);
    if (Date.now() - t0 > maxMs) return Object.assign({ waitMs: Date.now() - t0, timeout: true }, s);
    await sleep(60);
  }
};
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find((x) => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await sleep(5000);
  const t0 = Date.now();
  await ev(`CM.newGame({map:'${mapId}',mode:'free',name:'p'})`);
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  console.log('buildMs', Date.now() - t0);
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  await sleep(500);
  console.log('start', JSON.stringify(await waitSharp(20000)));
  const out = [];
  // 放大 4 档（滚轮负值放大），每档等补齐
  for (let i = 0; i < 4; i++) {
    await wheel(750, 450, -240);
    out.push({ dir: 'in', step: i, ...(await waitSharp(20000)) });
  }
  // 缩小 4 档回原位，再放大 4 档（第二轮：看缓存是否保住）
  for (let i = 0; i < 4; i++) { await wheel(750, 450, 240); await sleep(250); }
  out.push({ dir: 'out-return', ...(await waitSharp(20000)) });
  for (let i = 0; i < 4; i++) {
    await wheel(750, 450, -240);
    out.push({ dir: 'in2', step: i, ...(await waitSharp(20000)) });
  }
  for (const o of out) console.log(JSON.stringify(o));
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
