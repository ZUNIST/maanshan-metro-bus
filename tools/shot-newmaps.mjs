// 打开游戏并对指定地图开局截图：node shot-newmaps.mjs <map> <out.png> [year]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const MAP = process.argv[2] || 'su';
const OUT = process.argv[3] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/shot-new.png';
const YEAR = Number(process.argv[4] || 0);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345 + Math.floor(Math.random() * 40);

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-${PORT}`, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0, logs = []; const pending = new Map();
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(500);
    try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = list.find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  logs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
  };
  await send('Page.enable'); await send('Runtime.enable');
  const PAGE_URL = process.env.CM_URL || 'http://127.0.0.1:8211/index.html';
  await send('Page.navigate', { url: PAGE_URL });

  // 等启动完成
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const r = await evaluate('!!(window.CM && CM.MAP_ORDER && CM.MAP_ORDER.length && CM.ui && CM.newGame)');
    if (r.value) { ready = true; break; }
  }
  if (!ready) {
    const d = await evaluate(`(function(){ return { ready: document.readyState, href: location.href, title: document.title, cm: typeof window.CM, geo: !!(window.CM && CM.GEOS), maps: !!(window.CM && CM.MAPS), order: (window.CM && CM.MAP_ORDER && CM.MAP_ORDER.length) || 0, ui: !!(window.CM && CM.ui), scripts: document.querySelectorAll('script[src]').length, boot: (document.querySelector('[data-role=boot-error]')||{}).textContent || '' }; })()`);
    console.log('DIAG:', JSON.stringify(d.value));
    const st = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(OUT, Buffer.from(st.data, 'base64'));
    throw new Error('启动未完成 logs=' + JSON.stringify(logs.slice(-6)));
  }
  const maps = await evaluate('CM.MAP_ORDER.join(",")');
  console.log('MAPS:', maps.value);

  const playable = await evaluate(`(function(){var m=CM.MAPS['${MAP}'];return m?{ok:true,w:m.cfg.W,h:m.cfg.H,y:m.cfg.START.y,city:m.data.city}:{ok:false}})()`);
  console.log('TARGET:', JSON.stringify(playable.value));
  if (!playable.value || !playable.value.ok) throw new Error('地图未注册：' + MAP);

  const year = YEAR || playable.value.y;
  const started = await evaluate(`(function(){ try { CM.newGame({ map: '${MAP}', startYear: ${year}, mode: 'free' }); return 'ok'; } catch (e) { return 'ERR ' + e.message; } })()`);
  console.log('START:', started.value);

  let live = false;
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const r = await evaluate('JSON.stringify({city:!!(window.CM&&CM.game&&CM.game.city), n:(window.CM&&CM.game&&CM.game.city&&CM.game.city.N)||0, boot:(document.querySelector("[data-role=boot-error]")||{}).textContent||""})');
    if (i % 10 === 0) console.log('WAIT', i, r.value);
    let j = {}; try { j = JSON.parse(r.value); } catch {}
    if (j.city && j.n) { live = true; break; }
  }
  if (!live) throw new Error('建城超时');
  await sleep(4000);

  const stat = await evaluate(`(function(){ var g=CM.game; return { clock:g.clock.y+'-'+g.clock.m, cells:g.city.N, pop:Math.round(g.city.totalPop||0), jobs:Math.round(g.city.totalJobs||0), net:!!g.net, dev:!!g.development, devOn:!!(CM.Development && CM.Development.enabled(g)), devPlan:(function(){try{return !!CM.Development.monthPlan(g)}catch(e){return 'ERR '+e.message}})(), noisePpl:(function(){try{return CM.Noise.current(g.model).people}catch(e){return 'ERR '+e.message}})(), noise: !!(CM.Noise && g.model && CM.Noise.current(g.model)) }; })()`);
  console.log('STATE:', JSON.stringify(stat.value));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(OUT, Buffer.from(shot.data, 'base64'));
  console.log('SHOT:', OUT);

  // 点掉开局简报，进入主界面
  await evaluate(`(function(){ var b=[...document.querySelectorAll('button')].find(x=>/开始规划/.test(x.textContent)); if(b) b.click(); return !!b; })()`);
  await sleep(Number(process.env.CM_WAIT || 4000));
  const main = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(OUT.replace(/\.png$/, '_main.png'), Buffer.from(main.data, 'base64'));

  // 城市发展面板
  const dev = await evaluate(`(function(){ try { CM.ui.openPage('development','project',{root:true}); return 'ok'; } catch(e) { return 'ERR '+e.message; } })()`);
  console.log('DEV PAGE:', dev.value);
  await sleep(2500);
  const devShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(OUT.replace(/\.png$/, '_dev.png'), Buffer.from(devShot.data, 'base64'));
  const devText = await evaluate(`(function(){ var r=document.querySelector('.rbody,#rightPanel'); return r? r.textContent.slice(0,300) : 'none'; })()`);
  console.log('DEV TEXT:', String(devText.value).replace(/\s+/g,' ').slice(0,220));
  console.log('LOGS:', JSON.stringify(logs.slice(-10), null, 1));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  try { child.kill(); } catch {}
  process.exit(0);
}
