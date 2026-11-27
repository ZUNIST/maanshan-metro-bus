import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9890 + Math.floor(Math.random() * 15);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--remote-debugging-port=' + PORT, '--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-g' + PORT, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(); const logs = [];
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};
const PAGES = [
  ['development', 'project'], ['development', 'property'], ['development', 'population'],
  ['companies', null], ['tasks', 'active'], ['tasks', 'todo'], ['tasks', 'done'],
  ['finance', 'ov'], ['finance', 'econ'], ['finance', 'fare'],
  ['metric', 'pop'], ['metric', 'share'], ['metric', 'cong'], ['metric', 'commute'], ['metric', 'sat'],
  ['saves', null], ['data', null], ['help', null],
];
try {
  let t = null;
  for (let i = 0; i < 80 && !t; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); t = l.find(x => x.type === 'page'); } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') logs.push(((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).split('\n')[0].slice(0, 160));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: process.env.CM_URL });
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.newGame)')).value) break; }
  await ev("CM.newGame({map:'ms',mode:'free'})");
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.game&&CM.game.city&&CM.game.city.N)')).value) break; }
  await sleep(2000);
  await ev("(function(){var b=[...document.querySelectorAll('button')].find(x=>/开始规划/.test(x.textContent));if(b)b.click();})()");
  await sleep(2500);

  // 让城市场景更像存档：签一个发展承诺，让 development 有状态
  await ev("CM.ui.openPage('development','project',{root:true})");
  await sleep(1000);
  await ev("(function(){var b=[...document.querySelectorAll('button')].find(e=>/选视野中心/.test(e.textContent));if(b)b.click();})()");
  await sleep(1000);
  await ev("(function(){var b=[...document.querySelectorAll('button')].find(e=>/签署发展承诺/.test(e.textContent));if(b)b.click();})()");
  await sleep(1200);

  for (const [kind, pid] of PAGES) {
    const before = logs.length;
    const r = await ev(`(function(){try{ CM.ui.openPage(${JSON.stringify(kind)}, ${JSON.stringify(pid)}, {root:true}); return 'ok'; }catch(e){ return 'ERR ' + e.message; }})()`);
    await sleep(700);
    const tag = kind + '/' + pid;
    const bad = logs.slice(before);
    const hasPanel = await ev(`(function(){var t=document.querySelector('#rightPanel .p-title');return t?t.textContent.replace(/\\s+/g,' ').slice(0,30):''})()`);
    if (r.error || /^ERR/.test(String(r.value)) || bad.length) console.log('FAIL', tag, '|', r.error || r.value, '|', JSON.stringify(bad));
    else console.log('ok  ', tag, '->', hasPanel.value);
  }
  await ev("CM.ui.closePanel && CM.ui.closePanel()");
  console.log('TOTAL EXC:', logs.length);
} catch (e) { console.log('FAIL', e.message); } finally { try { child.kill(); } catch {} }
