import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9860 + Math.floor(Math.random() * 15);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--remote-debugging-port=' + PORT, '--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-p' + PORT, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(); const logs = [];
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};
const panel = () => ev(`(function(){var r=document.querySelector('#rightPanel .p-body')||document.querySelector('#rightPanel .rbody');return r?r.textContent.replace(/\\s+/g,' ').slice(0,400):'none'})()`);
try {
  let t = null;
  for (let i = 0; i < 80 && !t; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); t = l.find(x => x.type === 'page'); } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 200));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: process.env.CM_URL });
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.newGame)')).value) break; }
  await ev("CM.newGame({map:'ms',mode:'free'})");
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.game&&CM.game.city&&CM.game.city.N)')).value) break; }
  await sleep(2000);
  await ev("(function(){var b=[...document.querySelectorAll('button')].find(x=>/开始规划/.test(x.textContent));if(b)b.click();})()");
  await sleep(2500);

  // 1) 只有页面本身
  await ev("CM.ui.openPage('development','property',{root:true})");
  await sleep(1500);
  console.log('EMPTY:', (await panel()).value);
  console.log('EXC1:', JSON.stringify(logs.slice(-2)));

  // 2) 签一个发展承诺后再看
  console.log('SIGN:', JSON.stringify((await ev(`(function(){
    try {
      CM.ui.openPage('development','project',{root:true});
      var b=[...document.querySelectorAll('button')].find(e=>/选视野中心/.test(e.textContent)); if(b) b.click();
      return 'picked';
    } catch(e) { return 'ERR '+e.message; }
  })()`)).value));
  await sleep(1200);
  console.log('SIGN2:', JSON.stringify((await ev(`(function(){
    try {
      var b=[...document.querySelectorAll('button')].find(e=>/签署发展承诺/.test(e.textContent));
      if(!b) return 'nobtn';
      b.click();
      return CM.game.development ? 'signed' : 'nostate';
    } catch(e) { return 'ERR '+e.message; }
  })()`)).value));
  await sleep(1500);
  await ev("CM.ui.openPage('development','property',{root:true})");
  await sleep(1500);
  console.log('WITHDEV:', (await panel()).value);
  console.log('CAN:', JSON.stringify((await ev("(function(){var e=CM.game.econ;return {afford:typeof e.canAfford, build:typeof e.canAffordBuild, funds:Math.round(e.funds)}})()")).value));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(process.env.OUT, Buffer.from(shot.data, 'base64'));
  console.log('LOGS:', JSON.stringify(logs.slice(-4)));
} catch (e) { console.log('FAIL', e.message); } finally { try { child.kill(); } catch {} }
