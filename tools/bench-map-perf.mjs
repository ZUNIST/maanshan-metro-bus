// 地图加载 / 缩放的性能基线：无头浏览器打开游戏 → 建城 → 空转采样 → 连续滚轮缩放采样。
// 用法：CM_URL=http://127.0.0.1:8219/index.html node tools/bench-map-perf.mjs [map] [year]
// 输出：建城耗时、空转与缩放时每帧耗时（p50/p95/最长）、超过 50/100 ms 的帧数，以及路网规模。
import { spawn } from 'node:child_process';

const MAP = process.argv[2] || 'ms30';
const YEAR = Number(process.argv[3] || 0);
const URL = process.env.CM_URL || 'http://127.0.0.1:8219/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9500 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-p${PORT}`, 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};

const SAMPLER = `(function(){
  if (window.__fps) return 'exists';
  window.__fps = { on: true, d: [] };
  let last = performance.now();
  function tick(t){ const d = t - last; last = t; if (window.__fps.on) window.__fps.d.push(d); requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  return 'ok';
})()`;

const pct = (arr, q) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))] || 0; };
const stat = ms => ({ n: ms.length, p50: +pct(ms, 0.5).toFixed(1), p95: +pct(ms, 0.95).toFixed(1), max: +Math.max(...ms, 0).toFixed(1), over50: ms.filter(d => d > 50).length, over100: ms.filter(d => d > 100).length });

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(500);
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = l.find(t => t.type === 'page'); } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM && CM.newGame)')).value) break; }

  const t0 = Date.now();
  const started = await ev(YEAR
    ? `(function(){try{CM.newGame({map:'${MAP}',startYear:${YEAR},mode:'free'});return 'ok'}catch(e){return 'ERR '+e.message}})()`
    : `(function(){try{CM.newGame({map:'${MAP}',mode:'free'});return 'ok'}catch(e){return 'ERR '+e.message}})()`);
  if (!/^ok/.test(String(started.value))) console.log('START:', JSON.stringify(started));
  for (let i = 0; i < 240; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.game&&CM.game.city&&CM.game.city.N)')).value) break; }
  const cityMs = Date.now() - t0;
  const scale = (await ev(`(function(){var c=CM.game&&CM.game.city;return c?{groups:(c.roadGroups||[]).length,ways:(c.roadWays||[]).length}:{}})()`)).value;
  await sleep(2500);   // 等首屏瓦片与动画稳定

  await ev(SAMPLER);
  await ev('window.__fps.d.length = 0');
  await sleep(1500);
  const idle = (await ev('window.__fps.d.splice(0)')).value || [];

  // 连续缩放：先放大 10 档，再缩小 10 档
  await ev('window.__fps.d.length = 0');
  const rect = (await ev(`(function(){var c=document.querySelector('canvas');var r=c.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)).value;
  for (let i = 0; i < 10; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY: -240, modifiers: 0 });
    await sleep(160);
  }
  for (let i = 0; i < 10; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY: 240, modifiers: 0 });
    await sleep(160);
  }
  await sleep(400);
  const zoom = (await ev('window.__fps.d.splice(0)')).value || [];

  console.log(JSON.stringify({ url: URL, map: MAP, cityMs, ...scale, idle: stat(idle), zoom: stat(zoom) }, null, 1));
} catch (e) {
  console.log('FAIL', e.message);
} finally {
  try { child.kill(); } catch {}
}
