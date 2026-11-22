// 逐像素比较两张 PNG（用无头 Chrome 的 canvas 解码，不依赖额外依赖）。
// 用法：node tools/diff-png.mjs <a.png> <b.png> [阈值]
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9800 + Math.floor(Math.random() * 90);
const A = pathToFileURL(path.resolve(process.argv[2])).href, B = pathToFileURL(path.resolve(process.argv[3])).href;
const TH = Number(process.argv[4] || 24);
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpd${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text)) : r.result.value; };
try {
  let t = null; for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: pathToFileURL(path.dirname(path.resolve(process.argv[2]))).href + '/' });
  await sleep(800);
  const out = await ev(`(async function(){
    const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const a = await load(${JSON.stringify(A)}), b = await load(${JSON.stringify(B)});
    if (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight) return {size:[a.naturalWidth,a.naturalHeight,b.naturalWidth,b.naturalHeight]};
    const c = document.createElement('canvas'); c.width = a.naturalWidth; c.height = a.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(a, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0, max = 0, sum = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i]-db[i]), Math.abs(da[i+1]-db[i+1]), Math.abs(da[i+2]-db[i+2]));
      if (d > ${TH}) n++;
      if (d > max) max = d; sum += d;
    }
    const px = da.length / 4;
    return {w: c.width, h: c.height, over: n, pct: +(100*n/px).toFixed(3), max, mean: +(sum/px/3).toFixed(2)};
  })()`);
  console.log(JSON.stringify(out));
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
