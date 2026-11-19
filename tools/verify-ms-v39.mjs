// 验证马鞍山 2020 年建城结果：统计和县五处建成区、检查报错并截图。
// 用法：node tools/verify-ms-v39.mjs
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = 'http://127.0.0.1:8199/index.html?v=verify39';
const OUT = ROOT + '/验证-马鞍山2020.jpg';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--remote-debugging-port=9336', `--user-data-dir=${ROOT}/.chromeprof-v39`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
  return { value: r.result.value };
};

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(400);
    try { const l = await (await fetch('http://127.0.0.1:9336/json')).json(); target = l.find(t => t.type === 'page'); } catch { }
  }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const logs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL_ });
  await sleep(4000);
  const ready = await evaluate('typeof CM !== "undefined" && typeof CM.newGame === "function"');
  if (!ready.value) throw new Error('CM.newGame 未就绪: ' + JSON.stringify(ready));
  await evaluate('CM.newGame({ map: "ms", mode: "free", startYear: 2020 })');

  // 等建城
  let ok = false;
  for (let i = 0; i < 180; i++) {
    await sleep(1000);
    const r = await evaluate('(function(){try{return CM.game && CM.game.city ? "ready:"+CM.game.clock.y : "wait"}catch(e){return "err"}})()');
    if (typeof r.value === 'string' && r.value.startsWith('ready:')) { ok = true; break; }
    if (logs.some(l => /exception/.test(l))) break;
  }
  if (!ok) throw new Error('建城未完成 ' + JSON.stringify(logs.slice(-3)));
  await sleep(3000);

  const stat = await evaluate(`(function(){
    var C = CM.game.city, W = C.W;
    var zones = { "乌江镇区":[240,253,82,97], "乌江化工园":[236,252,99,114], "郑蒲港产业园":[187,205,179,199],
                  "姥桥镇区":[179,191,200,211], "和县经开区":[200,216,129,147], "历阳县城":[196,219,148,172],
                  "沈巷镇区":[145,162,258,275], "香泉镇区":[183,196,82,94], "西埠镇区":[168,186,124,140],
                  "丹阳镇区":[336,350,188,202], "年陡镇区":[236,250,274,286] };
    var out = {}, urbanTotal = 0, popTotal = 0;
    for (var c = 0; c < C.N; c++) { if (C.street[c]) urbanTotal++; popTotal += C.pop[c]; }
    for (var k in zones) {
      var b = zones[k], n = 0, u = 0, p = 0;
      for (var j = b[2]; j < b[3]; j++) for (var i = b[0]; i < b[1]; i++) {
        var c2 = j * W + i;
        if (C.street[c2]) u++;
        p += C.pop[c2];
      }
      out[k] = { urban: u, pop: Math.round(p) };
    }
    return { year: CM.game.clock.y, cells: C.N, urbanTotal: urbanTotal, pop: Math.round(popTotal), zones: out };
  })()`);

  console.log(JSON.stringify({ stat: stat.value, logs: logs.slice(-6) }, null, 1));
  const png = await send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
  await writeFile(OUT, Buffer.from(png.data, 'base64'));
  console.log('截图:', OUT);
} catch (e) { console.error('FAIL', e.message); }
finally { try { child.kill(); } catch { } process.exit(0); }
