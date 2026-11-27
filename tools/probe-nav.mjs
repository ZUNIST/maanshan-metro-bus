import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9800 + Math.floor(Math.random() * 15);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--remote-debugging-port=' + PORT, '--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-n' + PORT, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(); const logs = [];
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};
try {
  let t = null;
  for (let i = 0; i < 80 && !t; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); t = l.find(x => x.type === 'page'); } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: process.env.CM_URL });
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.newGame)')).value) break; }
  await ev("CM.newGame({map:'ms30',mode:'free'})");
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.game&&CM.game.city&&CM.game.city.N)')).value) break; }
  await sleep(2500);
  await ev("(function(){var b=[...document.querySelectorAll('button')].find(x=>/开始规划/.test(x.textContent));if(b)b.click();})()");
  await sleep(2500);

  console.log('BAR:', JSON.stringify((await ev(`(function(){
    var acts=document.querySelector('#hudTop .actions'); if(!acts) return {err:'no actions'};
    var bs=[...acts.querySelectorAll('.hbtn')];
    return { box: Math.round(acts.getBoundingClientRect().width), n: bs.length,
      items: bs.map(function(b){var r=b.getBoundingClientRect();return {tip:b.getAttribute('data-tip'),w:Math.round(r.width),h:Math.round(r.height),shown:getComputedStyle(b).display!=='none'};}) };
  })()`)).value));

  const co = await ev("(function(){var b=[...document.querySelectorAll('#hudTop .actions .hbtn')].find(x=>x.getAttribute('data-tip')==='公司运营');if(!b)return 'nobtn';b.click();return 'clicked';})()");
  console.log('CO BTN:', co.value);
  await sleep(1800);
  console.log('CO PANEL:', JSON.stringify((await ev(`(function(){var t=document.querySelector('#rightPanel .p-title');var r=document.querySelector('#rightPanel .rbody, #rightPanel .p-body');return {title:t?t.textContent.replace(/\\s+/g,' ').slice(0,40):'',text:r?r.textContent.replace(/\\s+/g,' ').slice(0,150):''};})()`)).value));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(process.env.OUT, Buffer.from(shot.data, 'base64'));

  await ev("(function(){var b=[...document.querySelectorAll('#hudTop .actions .hbtn')].find(x=>x.getAttribute('data-tip')==='任务');if(b)b.click();})()");
  await sleep(1500);
  console.log('TASK TABS:', JSON.stringify((await ev(`(function(){var t=[...document.querySelectorAll('#rightPanel .ptabs button, #rightPanel .tab')];return t.map(function(b){return b.textContent.replace(/\\s+/g,' ');});})()`)).value));
  console.log('LOGS:', JSON.stringify(logs.slice(-4)));
} catch (e) { console.log('FAIL', e.message); } finally { try { child.kill(); } catch {} }
