// 主线程采样分析：拖动期间用 CDP Profiler 采样，按「自身耗时」聚合函数，找出每帧的热点。
// 用法：node tools/profile-pan.mjs <url> [map] [秒数]
import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const url = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const MAP = process.argv[3] || 'ms';
const SECS = Number(process.argv[4] || 3);
const W = 1440, H = 900;
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cppr${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable'); await send('Profiler.enable');
  await send('Page.navigate', { url });
  await sleep(5000);
  await ev(`CM.newGame({map:'${MAP}',mode:'free',name:'p'})`);
  for (let i = 0; i < 160; i++) { await sleep(400); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(3500);
  await ev("CM.game.setSpeed(0); CM.R.zoomAt(CM.R.w/2, CM.R.h/2, 34/CM.R.cam.zoom)");
  await sleep(4000);
  console.log('state', JSON.stringify(await ev("(function(){var R=CM.R;return {z:+R.cam.zoom.toFixed(1),dl:R.displayedLevel,pend:R.stats.pendingVisible,g:R.ground.size,i:R.iso.size,ms:+(R.lastFrameMs||0).toFixed(1)}})()")));
  await send('Profiler.setSamplingInterval', { interval: 200 });
  await send('Profiler.start');
  const cx = W / 2, cy = H / 2;
  await mouse('mousePressed', cx, cy);
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < SECS * 1000) { k++; await mouse('mouseMoved', cx + Math.sin(k / 6) * 200, cy + Math.cos(k / 8) * 120); await sleep(10); }
  await mouse('mouseReleased', cx, cy);
  const prof = await send('Profiler.stop');
  const p = prof.profile, byId = new Map();
  for (const n of p.nodes) byId.set(n.id, n);
  const parent = new Map(); for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
  const self = new Map(); const callers = new Map();
  const dt = p.timeDeltas || [];
  const counts = p.samples || [];
  for (let i = 0; i < counts.length; i++) {
    const n = byId.get(counts[i]); if (!n) continue;
    const cf = n.callFrame;
    const key = (cf.functionName || '(anonymous)') + ' @ ' + (cf.url || '').split('/').pop() + ':' + (cf.lineNumber + 1);
    self.set(key, (self.get(key) || 0) + (dt[i] || 0));
    if (!cf.url) {   // 原生调用（drawImage / fillRect 等）：往上找第一个 JS 调用点
      let pid = parent.get(n.id), ck = '(unknown)';
      for (let g = 0; g < 8 && pid; g++) { const pn = byId.get(pid); if (!pn) break; const pc = pn.callFrame;
        if (pc.url) { ck = (pc.functionName || '(anon)') + ' @ ' + pc.url.split('/').pop() + ':' + (pc.lineNumber + 1); break; }
        pid = parent.get(pid); }
      const k3 = cf.functionName + ' ← ' + ck;
      callers.set(k3, (callers.get(k3) || 0) + (dt[i] || 0));
    }
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
  console.log('samples', counts.length, 'span', Math.round(total / 1000), 'ms');
  for (const [k2, v] of top) console.log(String((v / 1000).toFixed(0)).padStart(6), 'ms', (100 * v / total).toFixed(1) + '%', k2);
  console.log('--- 原生调用的调用点');
  for (const [k2, v] of [...callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(String((v / 1000).toFixed(0)).padStart(6), 'ms', (100 * v / total).toFixed(1) + '%', k2);
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
