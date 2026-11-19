// 浏览器内跑一段模拟：hx27 开局 12 个月，收集运行时异常与控制台错误
import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9700 + Math.floor(Math.random() * 80);
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,800', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpr${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errs = [];
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)) : r.result.value; };
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('CON ' + d.params.args.map(a => a.value || a.description || '').join(' '));
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8123/index.html' }); await sleep(5000);
  console.log('newGame', await ev(`CM.newGame({map:'hx27',mode:'free',name:'smoke'})&&'ok'`));
  for (let i = 0; i < 200; i++) { await sleep(300); if (await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) for (const ty of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: ty, x: r[0], y: r[1], button: 'left', clickCount: 1 });
  await sleep(1500);
  await ev("CM.game.paused=false; CM.game.speed=8; 'go'");
  await sleep(14000);
  const st = await ev("JSON.stringify({y:CM.game.clock.y,m:CM.game.clock.m,d:CM.game.clock.d,pop:Math.round(Object.values(CM.game.city.pop).reduce((a,b)=>a+b,0)),rev:Math.round(CM.game.econ&&CM.game.econ.cash||0)})");
  console.log('state', st);
  console.log('errors', errs.length ? errs.slice(0, 8) : 'none');
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
