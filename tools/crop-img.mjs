// 图片裁剪放大（canvas 实现）：node tools/crop-img.mjs <img> <x> <y> <w> <h> <out> <scale>
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9800 + Math.floor(Math.random() * 90);
const IMG = path.resolve(process.argv[2]);
const X = Number(process.argv[3] || 0), Y = Number(process.argv[4] || 0);
const W = Number(process.argv[5] || 600), H = Number(process.argv[6] || 600);
const OUT = process.argv[7] || 'crop.png';
const S = Number(process.argv[8] || 2);

const tmp = await mkdtemp(path.join(os.tmpdir(), 'crop-'));
const blank = path.join(tmp, 'blank.html');
await writeFile(blank, '<!doctype html><meta charset="utf-8"><body style="margin:0"></body>');

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--allow-file-access-from-files', '--window-size=1300,1000',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}/prof`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
try {
  let t = null;
  for (let i = 0; i < 60 && !t; i++) { await sleep(300); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: pathToFileURL(blank).href });
  await sleep(800);
  const url = pathToFileURL(IMG).href;
  const data = await ev(`new Promise(function(res,rej){var im=new Image();im.onload=function(){
    var c=document.createElement('canvas');c.width=${W};c.height=${H};
    var g=c.getContext('2d');g.imageSmoothingQuality='high';
    g.drawImage(im, ${X}, ${Y}, ${W / S}, ${H / S}, 0, 0, ${W}, ${H});
    try{res(c.toDataURL('image/png'))}catch(e){rej(e.message)}
  };im.onerror=function(){rej('load fail')};im.src=${JSON.stringify(url)};})`);
  const b64 = String(data).split(',')[1];
  await writeFile(OUT, Buffer.from(b64, 'base64'));
  console.log('ok', OUT, W + 'x' + H);
} catch (e) { console.error('FAIL', e.message); } finally { child.kill(); process.exit(0); }
