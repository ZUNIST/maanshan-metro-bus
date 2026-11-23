// 截主菜单封面并核验 v3.65 的封面小字与 GitHub 按钮。
// 用法：node tools/shot-menu-v365.mjs [outPng]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const OUT = process.argv[2] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/menu-v365.png';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
  '--remote-debugging-port=9341', '--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cmenupr365', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try { const list = await (await fetch('http://127.0.0.1:9341/json')).json(); target = list.find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8123/index.html' });
  // 等封面出现：start-root 或 screen
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const r = await evaluate('!!document.querySelector(".start-root")');
    if (r.value) break;
  }
  await sleep(2500);
  const info = await evaluate(`(function(){
    var tag = document.querySelector('.start-edition-tag');
    var links = Array.from(document.querySelectorAll('.start-corner a')).map(function(a){return {tip:a.getAttribute('data-tip'),href:a.getAttribute('href'),icon:!!a.querySelector('svg')}});
    var oldFoot = document.body.textContent.indexOf('有轨电车版 v3.26.1') >= 0;
    return {version: (window.CM&&CM.CFG&&CM.CFG.APP_VERSION)||null, tag: tag?tag.textContent:null,
            tagTop: tag?Math.round(tag.getBoundingClientRect().top):null,
            titleTop: (function(){var t=document.querySelector('.start-title');return t?Math.round(t.getBoundingClientRect().top):null})(),
            cornerLinks: links, oldFootMark: oldFoot};
  })()`);
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(OUT, Buffer.from(res.data, 'base64'));
  console.log(JSON.stringify({ info: info.value, logs: logs.slice(-8), out: OUT }, null, 1));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  try { child.kill(); } catch {}
  process.exit(0);
}
