// 用 Chrome DevTools Protocol 打开页面、等待游戏建城、抓取诊断与截图
// 用法：node cdp.mjs <url> <outPng> [waitMs] [mapId]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const URL_ = process.argv[2] || 'http://127.0.0.1:8123/preview.html?map=ms';
const OUT = process.argv[3] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/shot.png';
const WAIT = Number(process.argv[4] || 90000);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--remote-debugging-port=9333', '--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof2', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '') };
  return { value: r.result.value };
};

try {
  // 等 CDP 就绪
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try { const list = await (await fetch('http://127.0.0.1:9333/json')).json(); target = list.find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
  });
  await send('Page.navigate', { url: URL_ });
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < WAIT) {
    await sleep(1000);
    const r = await evaluate('(function(){var d=document.getElementById("diag");return d?d.textContent:""})()');
    state = r.value || '';
    if (/建城完成|失败|超时结束/.test(state)) break;
  }
  await sleep(2500);
  const info = await evaluate(`(function(){
    var C = CM.game && CM.game.city;
    var out = {diag: (document.getElementById('diag')||{}).textContent};
    if (C) {
      var counts={}, N=C.N;
      for (var c=0;c<N;c++){var k=C.regions[C.region[c]].name; counts[k]=(counts[k]||0)+1;}
      out.regions = Object.keys(counts).map(function(k){return k+': '+counts[k]}).sort(function(a,b){return parseInt(b.split(': ')[1])-parseInt(a.split(': ')[1])});
      out.pop = Math.round(C.totalPop||0); out.jobs = Math.round(C.totalJobs||0);
      out.cells = N;
    }
    var g = CM.game;
    if (g) { try { out.clock = g.clock.y+'-'+g.clock.m; } catch(e){} }
    return out;
  })()`);
  const res = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  await writeFile(OUT, Buffer.from(res.data, 'base64'));
  console.log(JSON.stringify({ diag: info.value && info.value.diag, regions: info.value && info.value.regions, pop: info.value && info.value.pop, jobs: info.value && info.value.jobs, cells: info.value && info.value.cells, logs: logs.slice(-8) }, null, 1));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  try { child.kill(); } catch {}
  process.exit(0);
}
