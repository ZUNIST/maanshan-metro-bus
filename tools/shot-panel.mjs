// 通用：打开右侧面板的任意页面并截图（用于检查面板内的排版）。
// 用法：node tools/shot-panel.mjs <page> [map] [mode] [宽] [高] [输出]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9000 + Math.floor(Math.random() * 200);
const page = process.argv[2] || 'finance', map = process.argv[3] || 'ms27', mode = process.argv[4] || 'challenge';
const W = Number(process.argv[5] || 1440), H = Number(process.argv[6] || 900);
const out = process.argv[7] || `C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/_panel-${page}`;
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpp2${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: process.env.CM_URL || 'http://127.0.0.1:8123/index.html' });
  await sleep(4500);
  await ev(`CM.newGame({map:'${map}',mode:'${mode}',name:'p'})`);
  for (let i = 0; i < 120; i++) { await sleep(400); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const r = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (r) await click(r[0], r[1]);
  await sleep(2500);
  console.log(await ev(`(function(){var id=null; if('${page}'==='station'){id=Object.keys(CM.game.net.stations)[0];} if('${page}'==='line'){id=Object.keys(CM.game.net.lines)[0];} CM.ui.openPage('${page}',id,{root:true});return 'ok '+id})()`));
  await sleep(1200);
  console.log(JSON.stringify(await ev(`(function(){
    var bar=document.querySelector('#rightPanel .ptabs'); if(!bar)return {none:1};
    var dbg={cw:bar.clientWidth, sww:[].slice.call(bar.children).map(function(b){return [b.scrollWidth,b.offsetWidth,+getComputedStyle(b).flexBasis]}), cls:bar.className, varp:bar.style.getPropertyValue('--tab-per'), rect:+bar.getBoundingClientRect().width.toFixed(1)};
    var out={wrap:bar.classList.contains('wrap'),rows:{},items:[]};
    [].slice.call(bar.children).forEach(function(b){ var q=b.getBoundingClientRect(), sp=b.querySelectorAll('span'), tx=sp[sp.length-1];
      out.items.push({t:tx.textContent, w:+q.width.toFixed(1), y:+q.y.toFixed(0), spill:+(tx.getBoundingClientRect().right-q.right).toFixed(1)}); out.rows[q.y]=1; });
    out.rows=Object.keys(out.rows).length; out.dbg=dbg; return out;})()`)));
  const panel = await ev("(function(){var p=document.getElementById('rightPanel').getBoundingClientRect();return [p.x,p.y,p.width,p.height]})()");
  const cl = await send('Page.captureScreenshot', { format: 'png', clip: { x: panel[0], y: panel[1] + 4, width: panel[2], height: 130, scale: 2 } });
  await writeFile(out + '.png', Buffer.from(cl.data, 'base64'));
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
