// 换行后标签仍可点击：任务页依次点「铁路经营权」「合同」「未完成」，确认页面切换、无脚本异常。
// 用法：node tools/probe-tabs-click.mjs
import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpc${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const logs = [];
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const clickTab = async label => {
  const r = await ev(`(function(){var bar=document.querySelector('#rightPanel .ptabs'); var b=[].slice.call(bar.children).find(function(x){return x.textContent.trim().indexOf(${JSON.stringify(label)})===0}); if(!b)return null; var q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2]})()`);
  if (!r) return 'MISS';
  await click(r[0], r[1]); await sleep(700);
  return await ev("(function(){var b=document.querySelector('#rightPanel .ptabs button.on'); return b? b.textContent.trim() : null})()");
};
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } if (d.method === 'Runtime.exceptionThrown') logs.push(d.params.exceptionDetails.text + ' ' + ((d.params.exceptionDetails.exception || {}).description || '')); if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('console: ' + JSON.stringify(d.params.args.map(a => a.value))); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: process.env.CM_URL || 'http://127.0.0.1:8123/index.html' });
  await sleep(4500);
  await ev("CM.newGame({map:'ms27',mode:'challenge',name:'p'})");
  for (let i = 0; i < 120; i++) { await sleep(400); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(2500);
  await ev("CM.ui.openPage('tasks','active',{root:true})");
  await sleep(800);
  console.log('tabs', await ev("[].slice.call(document.querySelectorAll('#rightPanel .ptabs button')).map(function(b){return b.textContent.trim()})"));
  console.log('→ 铁路经营权', await clickTab('铁路经营权'), '| 内容块', await ev("document.querySelectorAll('#rightPanel .rc-page, #rightPanel .tk-page, #rightPanel .page-enter').length"));
  console.log('→ 合同', await clickTab('合同'), '| 内容块', await ev("document.querySelectorAll('#rightPanel .pp-page, #rightPanel .page-enter').length"));
  console.log('→ 未完成', await clickTab('未完成'), '| 空态', await ev("!!document.querySelector('#rightPanel .tk-empty, #rightPanel .tk-card')"));
  console.log('→ 进行中', await clickTab('进行中'), '| 当前', await ev("CM.ui.taskTab"));
  console.log('errors', logs.length ? logs : 'none');
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
