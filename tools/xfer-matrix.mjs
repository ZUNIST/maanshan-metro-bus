// 公司对换乘协议矩阵验证：造两/三家公司，逐对设四档，确认换乘边 eT0 与客流随协议变化。
// 用法：node tools/xfer-matrix.mjs [mapId]
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9500 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1500,950',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.xf${PORT}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'ERR ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};
const click = async (x, y) => { for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: 1 }); };

async function waitReady(max = 120) {
  for (let i = 0; i < max; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) return true; }
  return false;
}
// 读换乘边（type=4）的 eT0 分布：这是协议直接作用的地方
const XFER_T0 = `(function(){
  var m = CM.game.model, net = m && m.net;
  if (!net) return null;
  var vals = [];
  for (var e = 0; e < net.nE; e++) if (net.eType[e] === 4 && net.eKm[e] === 0 && net.eT0[e] > 0) vals.push(+net.eT0[e].toFixed(2));
  var hist = {}; vals.forEach(function(v){ hist[v]=(hist[v]||0)+1; });
  return { edges: vals.length, hist: hist };
})()`;

try {
  let t = null;
  for (let i = 0; i < 80 && !t; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); t = l.find(x => x.type === 'page'); } catch {} }
  if (!t) throw new Error('CDP 未就绪');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: SRC });
  for (let i = 0; i < 160; i++) { await sleep(500); if (await ev("typeof CM !== 'undefined' && typeof CM.newGame === 'function'") === true) break; }
  await ev(`CM.newGame({map:'${MID}',name:'xf'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const b0 = await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if (b0) await click(b0[0], b0[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  await waitReady();

  // 用 AI 生成器建一条属于新公司的线——它会复用既有站，必然在原线网上制造换乘边。
  const setup = await ev(`(function(){
    var g = CM.game, R = CM.Companies, A = CM.AIRoute;
    R.ensure(g);
    var newCo = R.add(g, '测试私铁');
    var pick = A.choose(g, 0, { tryN: 6, minCells: 8, orgId: newCo });
    if (!pick) return { err: 'AI 没有可行方案', newCo: newCo };
    var ap = A.apply(g, pick.route, { name: '测试私铁线', color: '#d4537e', owner: newCo, coId: newCo });
    if (!ap.ok) return { err: '写入失败', newCo: newCo };
    g.touch(); g.refreshOperations();
    return { newCo: newCo, lineId: ap.lineId, km: +pick.route.km.toFixed(2), stations: ap.stations.length, reused: ap.reused, shared: ap.shared };
  })()`);
  if (setup.err) throw new Error('setup: ' + setup.err);
  await waitReady();
  await sleep(1500);

  // 逐档设置协议，读换乘边 t0 直方图 + 客流
  const rows = [];
  for (let lv = 0; lv < 4; lv++) {
    await ev(`(function(){ var g=CM.game,R=CM.Companies; R.setAgreement(g,0,${setup.newCo},${lv}); g.refreshOperations(); return true; })()`);
    await waitReady();
    await sleep(1200);
    const r = await ev(`(function(){
      var g=CM.game, R=CM.Companies, m=g.model, net=m&&m.net;
      var x = ${XFER_T0};
      var d = m && m.daily || {};
      var lv = R.agreementLv(g, 0, ${setup.newCo});
      return { lv: lv, min: R.AGREEMENT[lv].min, xfer: x,
        metro: Math.round(d.metro||0), metroPkm: Math.round(d.metroPkm||0), fare: Math.round(d.fare||0),
        crossPenalty: R.agreementMin(g, 0, ${setup.newCo}) };
    })()`);
    rows.push(r);
  }

  // 三公司逐对独立：A↔B 直通、A↔C 不互通，两条换乘边 t0 必须各自不同
  const pairTest = await ev(`(function(){
    var g = CM.game, R = CM.Companies, A = CM.AIRoute;
    R.ensure(g);
    var coC = R.add(g, '第三公司');
    var pick = A.choose(g, coC, { tryN: 6, minCells: 8, orgId: coC });
    if (!pick) return { err: '第三公司无线路方案' };
    var ap = A.apply(g, pick.route, { name: '第三公司线', color: '#ba7517', owner: coC, coId: coC });
    if (!ap.ok) return { err: '第三公司写入失败' };
    // A(0)↔B(1) 直通，A(0)↔C(coC) 不互通，B↔C 一票
    R.setAgreement(g, 0, ${setup.newCo}, 0);
    R.setAgreement(g, 0, coC, 3);
    R.setAgreement(g, ${setup.newCo}, coC, 1);
    g.touch(); g.refreshOperations();
    return { coC: coC, ab: R.agreementMin(g,0,${setup.newCo}), ac: R.agreementMin(g,0,coC), bc: R.agreementMin(g,${setup.newCo},coC) };
  })()`);
  await waitReady(); await sleep(1200);
  const pairXfer = await ev(XFER_T0);

  // UI：打开公司页，确认矩阵渲染出来、按钮文字正确
  await ev("CM.ui.openPage('companies')");
  await sleep(1200);
  const ui = await ev(`(function(){
    var b=document.body;
    var txt=b.textContent||'';
    return { hasTitle: txt.indexOf('公司对换乘协议')>=0, hasPair: txt.indexOf('测试私铁')>=0,
      hasShort: /直通/.test(txt)&&/一票/.test(txt)&&/出站/.test(txt)&&/不通/.test(txt),
      hasDefault: txt.indexOf('默认·')>=0, hasThird: txt.indexOf('第三公司')>=0 };
  })()`);
  const sh = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFile } = await import('node:fs/promises');
  await writeFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/xfer-matrix.png', Buffer.from(sh.data, 'base64'));

  console.log(JSON.stringify({ map: MID, setup, rows, pairTest, pairXfer, ui, logs: logs.slice(-5) }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
