// 只截「待批项目」卡片：开局 → 打开公司页 → 征询意向 → 截图。
// 用法：node tools/shot-ppp.mjs [mapId]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const OUT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/ppp-proposal.png';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.sp${PORT}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};
const click = async (x, y) => { for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: 1 }); };
const btnAt = (re) => ev(`(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /${re}/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()`);

try {
  let t = null;
  for (let i = 0; i < 80 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch {} }
  if (!t) throw new Error('CDP 未就绪');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: SRC });
  for (let i = 0; i < 160; i++) { await sleep(500); if (await ev("typeof CM !== 'undefined' && typeof CM.newGame === 'function'") === true) break; }
  await ev(`CM.newGame({map:'${MID}',name:'shot'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const b0 = await btnAt('开始规划'); if (b0) await click(b0[0], b0[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) break; }

  await ev("CM.ui.openTop('companies')");
  await sleep(1000);
  const a = await btnAt('征询意向');
  if (a) { await click(a[0], a[1]); await sleep(1500); }
  const text = await ev("(function(){var p=document.querySelector('.pp-body')||document.querySelector('.right');return p?p.textContent.replace(/\\s+/g,' ').slice(0,600):'NO'})()");
  const sh = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(OUT, Buffer.from(sh.data, 'base64'));
  console.log(JSON.stringify({ text, out: OUT, logs: logs.slice(-4) }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
