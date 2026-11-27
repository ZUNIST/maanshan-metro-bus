// 线上诊断：开局后为何 CM.game 不出现
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9420 + Math.floor(Math.random() * 30);
const URL = process.env.CM_URL;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-d${PORT}`, 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const logs = [], pending = new Map();
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};

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
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    if (m.method === 'Network.responseReceived' && /geo|data_|bundle/.test(m.params.response.url)) logs.push('NET ' + m.params.response.status + ' ' + m.params.response.url.split('/').pop().slice(0, 60));
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 120; i++) { await sleep(500); const r = await ev('!!(window.CM && CM.newGame)'); if (r.value) break; }

  console.log('CORE:', JSON.stringify((await ev(`(function(){return {ver:CM.CFG.APP_VERSION, geos:Object.keys(CM.GEOS||{}).length, has_ms:!!(CM.GEOS&&CM.GEOS.ms), maps:CM.MAP_ORDER.length}})()`)).value));

  // 页面上下文直接取 geo_ms，看是否被访问码拦住
  console.log('FETCH:', JSON.stringify((await ev(`fetch('js/geo_ms.js').then(r=>r.text()).then(t=>t.length).catch(e=>'ERR '+e.message)`)).value));

  console.log('START:', (await ev(`(function(){try{var r=CM.newGame({map:'ms',startYear:2000,mode:'free'});return 'ok '+(r&&r.then?'promise':'sync')}catch(e){return 'ERR '+e.message}})()`)).value);
  await sleep(15000);
  console.log('AFTER15:', JSON.stringify((await ev(`(function(){return {game:!!CM.game, city:!!(CM.game&&CM.game.city), modal:(document.querySelector('.modal,.dialog,.sheet')||{}).className||'', boot:(document.querySelector('[data-role=boot-error]')||{}).textContent||''}})()`)).value));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/live_diag.png', Buffer.from(shot.data, 'base64'));
  console.log('LOGS:', JSON.stringify(logs.slice(-14), null, 0));
} catch (e) {
  console.log('FAIL', e.message);
  console.log('LOGS:', JSON.stringify(logs.slice(-10)));
} finally {
  try { child.kill(); } catch {}
}
