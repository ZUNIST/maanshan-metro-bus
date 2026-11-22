// 校验后台线程画的地面块与主线程一致：同一机位先截线程版，再关掉线程、清空分块重画后截图，逐像素比较。
// 用法：node tools/check-worker-parity.mjs <url> [map]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const url = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const MAP = process.argv[3] || 'ms27';
const pre = `C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/_parity-${MAP}`;
const W = 1440, H = 900;
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cppar${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const shot = async f => { const s = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(f, Buffer.from(s.data, 'base64')); return f; };
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(5000);
  await ev(`CM.newGame({map:'${MAP}',mode:'free',name:'q'})`);
  for (let i = 0; i < 160; i++) { await sleep(400); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(3000);
  await ev("CM.game.setSpeed(0); CM.R.zoomAt(CM.R.w/2, CM.R.h/2, 44/CM.R.cam.zoom)");
  await sleep(5000);
  console.log('worker', JSON.stringify(await ev("(function(){var R=CM.R;return {off:!!R.tiles.off,slots:R.tiles.list?R.tiles.list.length:0,pend:R.stats.pendingVisible,g:R.ground.size}})()")));
  await shot(pre + '-worker.png');
  // 关掉线程、清空地面块，让主线程重画同一批块
  console.log('switch', await ev("(function(){var R=CM.R;R.tiles.off=true;R.tiles.stop();R.ground.forEach(function(e){if(e.cv&&e.cv.close)e.cv.close();});R.ground.clear();R.cachePx=0;R.warm(3000);return 'ok'})()"));
  await sleep(6000);
  console.log('main', JSON.stringify(await ev("(function(){var R=CM.R;return {off:!!R.tiles.off,pend:R.stats.pendingVisible,g:R.ground.size}})()")));
  await shot(pre + '-main.png');
  // 像素比较
  const a = readFileSync(pre + '-worker.png'), b = readFileSync(pre + '-main.png');
  console.log('bytes', a.length, b.length, 'identical', a.equals(b));
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
