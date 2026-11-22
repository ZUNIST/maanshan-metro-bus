// 标签栏在视口变化后的自适应：先宽屏（5 个标签须换行），再把窗口缩到窄屏，看是否重算、是否抖动。
// 用法：node tools/probe-tabs-resize.mjs
import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpr${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const st = () => ev(`(function(){var bar=document.querySelector('#rightPanel .ptabs'); if(!bar)return null;
  var rows={}; [].slice.call(bar.children).forEach(function(b){rows[b.getBoundingClientRect().y]=1});
  return {wrap:bar.classList.contains('wrap'), rows:Object.keys(rows).length, w:+bar.getBoundingClientRect().width.toFixed(0),
    over:[].slice.call(bar.children).map(function(b){return b.scrollWidth-b.clientWidth})}})()`);
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8123/index.html' });
  await sleep(4500);
  await ev("CM.newGame({map:'ms27',mode:'challenge',name:'p'})");
  for (let i = 0; i < 120; i++) { await sleep(400); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(2500);
  await ev("CM.ui.openPage('tasks','active',{root:true})");
  await sleep(800);
  console.log('1440', JSON.stringify(await st()));
  for (const [w, h] of [[900, 700], [760, 620], [600, 900], [420, 800]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await sleep(600);
    console.log(w + 'x' + h, JSON.stringify(await st()));
  }
  console.log('back', await (async () => { await send('Emulation.clearDeviceMetricsOverride'); await sleep(600); return JSON.stringify(await st()); })());
  console.log('stable', JSON.stringify(await st()));
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
