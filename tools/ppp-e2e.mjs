// PPP 端到端：征询意向 → 批准 → 施工 → 通车 → 可用性付费，并检查财承上限与账目。
// 用法：node tools/ppp-e2e.mjs [mapId]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const MID = process.argv[2] || 'ms30';
const OUT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/ppp.png';
const SRC = 'http://127.0.0.1:8123/index.html';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.pp${PORT}`, 'about:blank'], { stdio: 'ignore' });

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
const btnAt = (re) => ev(`(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /${re}/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()`);

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
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map(a => a.value || a.description || '').join(' '));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: SRC });
  for (let i = 0; i < 160; i++) { await sleep(500); if (await ev("typeof CM !== 'undefined' && typeof CM.newGame === 'function'") === true) break; }
  await ev(`CM.newGame({map:'${MID}',name:'ppp'})`);
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())')) break; }
  const b0 = await btnAt('开始规划'); if (b0) await click(b0[0], b0[1]);
  await sleep(2500);
  await ev('CM.game.setSpeed(0)');
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await ev('!!(CM.game.model&&CM.game.model.trafficReady&&CM.game.model.trafficReady())') === true) break; }

  await ev("CM.ui.openTop('companies')");
  await sleep(1200);
  const capInfo = await ev(`(function(){var P=CM.PPP,g=CM.game;return {capYearYi:+(P.capYear(g)/10000).toFixed(2), capMonthWan:Math.round(P.capMonth(g)), committedWan:Math.round(P.committed(g)), headroomWan:Math.round(P.headroom(g)), fundsYi:+((g.econ.funds||0)/10000).toFixed(2)};})()`);

  const askBtn = await btnAt('征询意向');
  if (!askBtn) throw new Error('找不到「征询意向」按钮');
  await click(askBtn[0], askBtn[1]);
  await sleep(1500);
  const propInfo = await ev(`(function(){var P=CM.PPP,g=CM.game,s=P.ensure(g),p=s.props[0];if(!p)return {err:'没有提议'};return {km:+p.route.km.toFixed(2),nst:(p.route.stations||[]).length,buildMonths:p.buildMonths,years:p.years,capexYi:+(p.bid.capex/10000).toFixed(2),opexYi:+(p.bid.opexY/10000).toFixed(2),fareYi:+(p.bid.fareY/10000).toFixed(2),askYi:+(p.bid.ask/10000).toFixed(2),apMWan:Math.round(p.apM),cover:+(p.bid.cover*100).toFixed(0),density:Math.round(p.bid.density),afford:p.afford,headroomWan:Math.round(P.headroom(g))};})()`);

  const okBtn = await btnAt('批准');
  if (!okBtn) throw new Error('找不到「批准」按钮');
  await click(okBtn[0], okBtn[1]);
  await sleep(1500);
  const signed = await ev(`(function(){var P=CM.PPP,g=CM.game,s=P.ensure(g),c=s.contracts[0];if(!c)return {err:'签约失败'};return {state:c.state,apMWan:Math.round(c.apM),cdLeft:s.cdUntil-g.ym(),committedWan:Math.round(P.committed(g)),usagePct:+(P.usage(g)*100).toFixed(1)};})()`);

  const sh1 = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(OUT.replace('.png', '-signed.png'), Buffer.from(sh1.data, 'base64'));

  // 推进到通车（工期 30 个月，多跳一点确保进入运营）
  const bm = (propInfo && propInfo.buildMonths) || 30;
  await ev(`CM.game.startJump(${bm + 3})`);
  for (let i = 0; i < 240; i++) {
    await sleep(2000);
    const st = await ev('(function(){var g=CM.game;return {jump:!!g.jumping,pend:!!g.pending}})()');
    if (st && !st.jump && !st.pend) break;
  }

  const after = await ev(`(function(){
    var P=CM.PPP,g=CM.game,s=P.ensure(g),c=s.contracts[0]||null;
    var out={state:c&&c.state, lineId:c&&c.lineId, apMWan:c&&Math.round(c.apM), paidWan:c&&Math.round(c.paid||0),
      committedWan:Math.round(P.committed(g)), pppOutWan:Math.round((g.econ.cur&&g.econ.cur.pppOut)||0),
      linesInNet:Object.keys(g.net.lines).length, fundsYi:+((g.econ.funds||0)/10000).toFixed(2),
      ownerOfNewLine: c&&c.lineId? (g.net.lines[c.lineId]||{}).coId : null,
      ym:g.ym()};
    // 新线是否进了编译结果、有没有客流
    var F=CM.Finance&&CM.Finance.compute?CM.Finance.compute(g):null;
    if(F&&c&&c.lineId){ F.lines.forEach(function(L){ if(L.L&&L.L.id===c.lineId) out.newLine={riders:Math.round(L.riders||0), fare:Math.round(L.fare), cost:Math.round(L.cost), rec:L.cost>0?+(L.fare/L.cost*100).toFixed(0):null}; }); }
    return out;
  })()`);

  const sh2 = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(OUT, Buffer.from(sh2.data, 'base64'));

  console.log(JSON.stringify({ map: MID, capInfo, propInfo, signed, after, logs: logs.slice(-6), files: [OUT, OUT.replace('.png', '-signed.png')] }, null, 1));
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
