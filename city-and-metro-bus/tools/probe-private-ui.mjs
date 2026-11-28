// 私营公司 UI 探针（v3.91）：真浏览器打开 ms30，检查命名、自有资金、公司面板渲染与控制台报错
// 用法：先起本地静态服务（python -m http.server 8123 --directory 马鞍山地铁公交-v3.90），再 node tools/probe-private-ui.mjs
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html?map=ms30';
const OUT = process.argv[3] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/probe-private-ui.jpg';
const WAIT = Number(process.argv[4] || 150000);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--remote-debugging-port=9334', '--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof4', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try { const list = await (await fetch('http://127.0.0.1:9334/json')).json(); target = list.find(t => t.type === 'page'); } catch {}
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
  // 菜单页不会自动开局：直接调游戏自己的开局入口
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    const r = await evaluate('(function(){ if(!window.CM||!CM.newGame) return "no"; try { CM.newGame({map:"ms30",mode:"challenge"}); return "started"; } catch(e){ return "err:"+e.message; } })()');
    if (r.value === 'started') break;
  }
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT) {
    await sleep(1500);
    const r = await evaluate('(function(){var d=document.getElementById("diag");if(!d)return "";var s=d.textContent;if(/建城完成|失败|超时结束/.test(s))return "done";return s})()');
    if (r.value === 'done') break;
  }
  await sleep(3000);
  const info = await evaluate(`(function(){
    var out = {};
    var g = CM.game; out.map = CM.mapId; out.clock = g ? (g.clock.y+'-'+g.clock.m) : null;
    out.privateLoaded = !!CM.Private;
    if (CM.Private && g) {
      var o = CM.Private.org(g);
      out.orgName = o && o.name; out.orgKind = o && o.kind; out.cash = o && o.fin && Math.round(o.fin.cash);
      out.seed = Math.round(CM.Private.seed(g));
      out.nextReview = CM.Private.nextReview(g, o);
    }
    out.screen = CM.ui.screen && CM.ui.screen.className;
    out.pages = CM.ui && CM.ui.page ? CM.ui.page : null;
    return out;
  })()`);
  // 简报是异步弹出的全屏层：等它出来再关掉，然后打开公司页
  await sleep(9000);
  const openr = await evaluate('(function(){ try{ CM.ui.closeScreen(); }catch(e){ return "close:"+e.message } try{ CM.ui.openPage("companies",null,{root:true}); return "ok:"+CM.ui.screen.className }catch(e){ return "open:"+e.message } })()');
  await sleep(1800);
  const text = await evaluate(`(function(){
    var t = document.body.innerText || '';
    var i = t.indexOf('私营');
    return { len: t.length, hasPrivate: /私营/.test(t), hasCash: /自有资金/.test(t), hasReview: /下次评估/.test(t),
      openr: ${JSON.stringify(openr.value)}, head: t.slice(0, 500), snippet: i>=0 ? t.slice(Math.max(0,i-60), i+300) : '' };
  })()`);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
  await writeFile(OUT, Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ info: info.value || info, panel: text.value || text, logs: logs.slice(-10) }, null, 1));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  try { child.kill(); } catch {}
  process.exit(0);
}
