// 检查「出行与通勤」图层的片区名与质心位置，并截图。
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--remote-debugging-port=9337', `--user-data-dir=${ROOT}/.chromeprof-flow`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
  return { value: r.result.value };
};

try {
  let t = null;
  for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch('http://127.0.0.1:9337/json')).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const logs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') logs.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8199/index.html?v=flow1' });
  await sleep(4000);
  await ev('CM.newGame({ map: "ms", mode: "free" })');
  for (let i = 0; i < 180; i++) {
    await sleep(1000);
    const r = await ev('(function(){try{return CM.game && CM.game.city ? "y" : "n"}catch(e){return "e"}})()');
    if (r.value === 'y') break;
  }
  await sleep(2500);
  const ok = await ev('(function(){try{ CM.ui.setLayer("flow"); return "ok" }catch(e){ return "err:"+e.message }})()');
  console.log('setLayer:', JSON.stringify(ok));
  await sleep(4000);

  const info = await ev(`(function(){
    var R = CM.R, fa = R.flowAreas();
    var C = CM.game.city, out = [];
    for (var i = 0; i < fa.names.length; i++) {
      var x = fa.x[i], y = fa.y[i];
      var ci = Math.round(y - 0.5) * C.W + Math.round(x - 0.5);
      var rg = (C.region[ci] != null) ? C.regions[C.region[ci]] : null;
      out.push({ name: fa.names[i], x: +x.toFixed(1), y: +y.toFixed(1),
        regionAtCentroid: rg ? rg.name : '(城外)',
        popHere: Math.round(C.pop[ci] || 0), jobsHere: Math.round(C.jobs[ci] || 0),
        urbanHere: C.street[ci] ? 1 : 0 });
    }
    return { count: fa.names.length, areas: out, labels: (C.districtLabels||[]).length };
  })()`);
  await writeFile(ROOT + '/tools/flow-areas.json', JSON.stringify(info.value, null, 1));
  for (const a of info.value.areas) console.log([a.name.padEnd(14), String(a.x).padStart(6), String(a.y).padStart(6), 'pop=' + String(a.popHere).padStart(6), 'urban=' + a.urbanHere, a.regionAtCentroid].join('  '));

  const du = await ev('document.getElementById("map").toDataURL("image/jpeg",0.85)');
  if (du.value && du.value.startsWith('data:')) { await writeFile(ROOT + '/验证-通勤图层.jpg', Buffer.from(du.value.split(',')[1], 'base64')); console.log('地图画布已导出'); } else console.log('导出失败', du.error);
  console.log('logs:', JSON.stringify(logs.slice(-4)));
} catch (e) { console.error('FAIL', e.message); }
finally { try { child.kill(); } catch { } process.exit(0); }
