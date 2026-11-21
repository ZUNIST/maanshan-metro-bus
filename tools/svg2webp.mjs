// 把主菜单背景的 SVG 转成 WebP（1600×900）：原版广州封面就是 webp，位图比几 MB 的 SVG 轻得多。
// 用法：node tools/svg2webp.mjs <svg 列表> [质量]
import { spawn } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const files = process.argv.slice(2).filter(a => a.endsWith('.svg'));
const Q = 0.92;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9920 + Math.floor(Math.random() * 20);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,900',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cp2w${PORT}`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pend = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
try {
  let t = null;
  for (let i = 0; i < 60 && !t; i++) { await sleep(300); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Runtime.enable');

  for (const f of files) {
    const abs = path.resolve(f);
    const svg = await readFile(abs, 'utf8');
    const b64 = Buffer.from(svg, 'utf8').toString('base64');
    const r = await send('Runtime.evaluate', {
      expression: `(async () => {
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,${b64}';
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = 1600; cv.height = 900;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0, 1600, 900);
        return cv.toDataURL('image/webp', ${Q});
      })()`,
      returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.text));
    const data = String(r.result.value);
    if (!data.startsWith('data:image/webp')) throw new Error('不是 webp：' + data.slice(0, 40));
    const out = abs.replace(/\.svg$/, '.webp');
    const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    await writeFile(out, buf);
    console.log(path.basename(out), (buf.length / 1024).toFixed(0) + ' KB');
  }
} catch (e) {
  console.error('FAIL', e.message);
  process.exitCode = 1;
} finally {
  child.kill();
  setTimeout(() => process.exit(), 200);
}
