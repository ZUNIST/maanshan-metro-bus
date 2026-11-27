import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9830 + Math.floor(Math.random() * 15);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--remote-debugging-port=' + PORT, '--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-c' + PORT, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(); const logs = [];
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};
const panelText = () => ev(`(function(){var r=document.querySelector('#rightPanel .p-body')||document.querySelector('#rightPanel .rbody');return r?r.textContent.replace(/\\s+/g,' '):''})()`);
try {
  let t = null;
  for (let i = 0; i < 80 && !t; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); t = l.find(x => x.type === 'page'); } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: process.env.CM_URL });
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.newGame)')).value) break; }
  await ev("CM.newGame({map:'ms',mode:'free'})");
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.game&&CM.game.city&&CM.game.city.N)')).value) break; }
  await sleep(2000);
  await ev("(function(){var b=[...document.querySelectorAll('button')].find(x=>/开始规划/.test(x.textContent));if(b)b.click();})()");
  await sleep(2500);

  // 建一条两站的线 + 一个孤站（不接线）
  console.log('BUILD:', JSON.stringify((await ev(`(function(){
    var g = CM.game, c = g.city;
    var b = CM.ui.R.view, cx = Math.round((b.x0+b.x1)/2), cy = Math.round((b.y0+b.y1)/2);
    var out = {cx:cx, cy:cy};
    g.edit(function(net){
      var lid = CM.Metro.newLine(net, '测试线', 'metro').id;
      var a = CM.Metro.addStation(net, cx-5, cy, {size:'M', type:'underground'}, c);
      var bb = CM.Metro.addStation(net, cx+5, cy, {size:'M', type:'underground'}, c);
      CM.Metro.addSegment(net, lid, a, bb, null, 'underground');
      out.a = a; out.b = bb;
    });
    var C = CM.RailConcessions.compile(g.net, g);
    var acc = g.model.computeAccess(C);
    g.model.setNetwork(C, true, acc);
    out.stations = C.stations.length; out.serviced = C.serviced.filter(Boolean).length;
    out.trees = acc.trees.filter(function(t){return !!t;}).length;
    out.treeNull = acc.trees.filter(function(t){return !t;}).length;
    return out;
  })()`)).value));

  await ev("CM.ui.openPage('development','project',{root:true})");
  await sleep(1200);
  await ev("(function(){var x=[...document.querySelectorAll('button')].find(e=>/选视野中心/.test(e.textContent));if(x)x.click();})()");
  await sleep(1500);
  const before = (await panelText()).value || '';
  console.log('BEFORE:', before.slice(before.indexOf('步行覆盖'), before.indexOf('步行覆盖') + 60));

  // 再加一个孤站（不接线），重算接驳
  console.log('ORPHAN:', JSON.stringify((await ev(`(function(){
    var g = CM.game, c = g.city;
    var b = CM.ui.R.view, cx = Math.round((b.x0+b.x1)/2), cy = Math.round((b.y0+b.y1)/2);
    var out = {};
    g.edit(function(net){ out.o = CM.Metro.addStation(net, cx, cy-3, {size:'M', type:'underground'}, c); });
    var C = CM.RailConcessions.compile(g.net, g);
    var acc = g.model.computeAccess(C);
    g.model.setNetwork(C, true, acc);
    out.stations = C.stations.length; out.serviced = C.serviced.filter(Boolean).length;
    out.trees = acc.trees.filter(function(t){return !!t;}).length;
    return out;
  })()`)).value));

  await ev("CM.ui.openPage('development','project',{root:true, replaceTop:true})");
  await sleep(1200);
  const after = (await panelText()).value || '';
  console.log('AFTER :', after.slice(after.indexOf('步行覆盖'), after.indexOf('步行覆盖') + 90));
  console.log('LOGS:', JSON.stringify(logs.slice(-3)));
} catch (e) { console.log('FAIL', e.message); } finally { try { child.kill(); } catch {} }
