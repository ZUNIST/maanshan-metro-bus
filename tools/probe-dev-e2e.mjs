import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9920 + Math.floor(Math.random() * 15);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--remote-debugging-port=' + PORT, '--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-e' + PORT, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(); const logs = [];
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return { value: r.result.value };
};
try {
  let t = null;
  for (let i = 0; i < 80 && !t; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); t = l.find(x => x.type === 'page'); } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') logs.push(((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).split('\n')[0].slice(0, 160));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: process.env.CM_URL });
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.newGame)')).value) break; }
  await ev("CM.newGame({map:'ms',mode:'free'})");
  for (let i = 0; i < 160; i++) { await sleep(500); if ((await ev('!!(window.CM&&CM.game&&CM.game.city&&CM.game.city.N)')).value) break; }
  await sleep(2000);
  await ev("(function(){var b=[...document.querySelectorAll('button')].find(x=>/开始规划/.test(x.textContent));if(b)b.click();})()");
  await sleep(2500);

  // 选视野中心拿到选区，再沿选区中心建一条六站的东西向线
  await ev("CM.ui.openPage('development','project',{root:true})"); await sleep(900);
  await ev("(function(){var b=[...document.querySelectorAll('button')].find(e=>/选视野中心/.test(e.textContent));if(b)b.click();})()");
  await sleep(1000);
  console.log('AREA:', JSON.stringify((await ev("(function(){return CM.ui.developmentDraft? CM.ui.developmentDraft.bounds : null})()")).value));

  console.log('LINE:', JSON.stringify((await ev(`(function(){
    try {
      var d = CM.ui.developmentDraft; if (!d) return 'no draft';
      var b = d.bounds, g = CM.game, c = g.city;
      var cx = Math.round((b[0]+b[2])/2), cy = Math.round((b[1]+b[3])/2);
      var r = {};
      g.edit(function(net){
        var lid = CM.Metro.newLine(net, '测试线', 'metro').id;
        var ids = [];
        for (var k = -3; k <= 3; k++) {
          var x = cx + k * 2, y = cy + (k % 2 ? 1 : 0);
          ids.push(CM.Metro.addStation(net, x, y, {size:'M', type:'underground'}, c));
        }
        for (var i = 0; i + 1 < ids.length; i++) CM.Metro.addSegment(net, lid, ids[i], ids[i+1], null, 'underground');
        r.n = ids.length;
      });
      var conf = g.confirmDraft ? g.confirmDraft() : 'no confirmDraft';
      r.conf = conf && conf.error ? conf.error : 'ok';
      r.netStations = Object.keys(g.net.stations).length;
      return r;
    } catch(e) { return 'ERR ' + e.message; }
  })()`)).value));

  // 签承诺
  console.log('SIGN:', JSON.stringify((await ev(`(function(){
    CM.ui.openPage('development','project',{root:true});
    var b=[...document.querySelectorAll('button')].find(e=>/签署发展承诺/.test(e.textContent));
    if(!b) return 'nobtn';
    b.click();
    return CM.game.development ? {size:CM.game.development.size, type:CM.game.development.type, phase:CM.game.development.phase} : 'nostate';
  })()`)).value));
  await sleep(1200);

  // 看 monthPlan 是否给出月预算
  console.log('PLAN:', JSON.stringify((await ev(`(function(){
    try {
      var m = CM.Development.monthPlan(CM.game);
      if (!m) return 'null';
      return {cells:m.cells.length, type:m.type, pop:Math.round(m.pop), jobs:Math.round(m.jobs),
        popRate:Math.round(m.popRate||0), jobsRate:Math.round(m.jobsRate||0), fill:m.fill, left:m.leftMonths};
    } catch(e) { return 'ERR '+e.message; }
  })()`)).value));

  const before = (await ev("(function(){var g=CM.game,d=g.development;var pop=0;for(var i=0;i<d.bounds.length;i++){}return {p:Math.round(g.city.totals().pop), j:Math.round(g.city.totals().jobs)}})()")).value;
  await ev("CM.game.startJump(24)");
  for (let i = 0; i < 120; i++) { await sleep(1000); if (!(await ev('!!(window.CM&&CM.game&&CM.game.jumping)')).value) break; }
  const after = (await ev(`(function(){
    var g = CM.game, d = g.development, c = g.city;
    if (!d) return {err:'no development'};
    var pop = 0, jobs = 0, built = 0;
    for (var j = d.bounds[1]; j <= d.bounds[3]; j++) for (var i = d.bounds[0]; i <= d.bounds[2]; i++) {
      var k = j*c.W+i; pop += c.pop[k]; jobs += c.jobs[k]; if (c.street[k]) built++;
    }
    return { date: g.clock.y + '-' + g.clock.m, totPop: Math.round(c.totals().pop), totJobs: Math.round(c.totals().jobs),
      projPop: Math.round(d.totalPop), projJobs: Math.round(d.totalJobs), phase: d.phase,
      areaPop: Math.round(pop), areaJobs: Math.round(jobs), areaBuilt: built };
  })()`)).value;
  console.log('BEFORE:', JSON.stringify(before));
  console.log('AFTER :', JSON.stringify(after));
  console.log('LOGS:', JSON.stringify(logs.slice(-3)));
} catch (e) { console.log('FAIL', e.message); } finally { try { child.kill(); } catch {} }
