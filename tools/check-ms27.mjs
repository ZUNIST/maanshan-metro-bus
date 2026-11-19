// 验证 2027 剧本：开局线网（宁马线 16 站、全线高架）、南京方向接驳口是否已接通、客流与城市状态。
// 用法：node tools/check-ms27.mjs
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = 'http://127.0.0.1:8199/index.html?v=ms27';
const OUT = ROOT + '/验证-马鞍山2027.jpg';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  '--remote-debugging-port=9337', `--user-data-dir=${ROOT}/.chromeprof-ms27`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
  return { value: r.result.value };
};

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(400);
    try { const l = await (await fetch('http://127.0.0.1:9337/json')).json(); target = l.find(t => t.type === 'page'); } catch { }
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
  await sleep(4500);

  const meta = await evaluate(`(function(){
    var ok = typeof CM !== 'undefined' && CM.MAPS && CM.MAPS.ms27;
    if (!ok) return { ok: false, maps: Object.keys(CM.MAPS || {}) };
    var m = CM.MAPS.ms27;
    return { ok: true, title: m.title, start: m.cfg.START.y, dif: m.difficulty, line: m.data.initialNetwork && m.data.initialNetwork.lines[0].stations.length,
      fac: m.data.facilities.filter(function(f){return f.id==='ms_njlink';}).length, order: CM.MAP_ORDER.indexOf('ms27') };
  })()`);
  console.log('地图登记:', JSON.stringify(meta.value || meta.error));

  const started = await evaluate('CM.newGame({ map: "ms27", mode: "free" })');
  if (started.error) throw new Error('开局失败: ' + started.error);
  let ok = false;
  for (let i = 0; i < 200; i++) {
    await sleep(1000);
    const r = await evaluate('(function(){try{return CM.game && CM.game.city ? "ready:"+CM.game.clock.y+"."+CM.game.clock.m : "wait"}catch(e){return "err:"+e.message}})()');
    if (typeof r.value === 'string' && r.value.startsWith('ready:')) { ok = true; break; }
    if (typeof r.value === 'string' && r.value.startsWith('err:')) throw new Error(r.value);
    if (logs.some(l => /exception/.test(l))) break;
  }
  if (!ok) throw new Error('建城未完成 ' + JSON.stringify(logs.slice(-3)));
  await sleep(2500);

  // 关掉开局简报，进入地图
  await evaluate(`(function(){ var b=[].slice.call(document.querySelectorAll('button')); var t=b.filter(function(x){return /开始规划/.test(x.textContent||'');})[0]; if(t) t.click(); return !!t; })()`);
  await sleep(3500);

  const stat = await evaluate(`(function(){
    var g = CM.game, C = g.city, net = g.net, F = CM.Fac;
    var st = Object.keys(net.stations).map(function(k){return net.stations[k];});
    var segs = Object.keys(net.segments).map(function(k){return net.segments[k];});
    var types = {}; segs.forEach(function(s){ types[s.type] = (types[s.type]||0)+1; });
    var lines = Object.keys(net.lines).map(function(k){return net.lines[k];});
    var fac = F.list(C).filter(function(f){return f.ext;});
    var ext = fac.map(function(f){ var lk = F.extLink(f, g); return { n: f.name, gate: !!f.ext.gate, pax: F.pax(f, g.clock.y), linked: !!lk, at: lk ? lk.st.name : null, d: lk ? +lk.d.toFixed(2) : null }; });
    var pop = 0, urban = 0;
    for (var c = 0; c < C.N; c++) { pop += C.pop[c]; if (C.street[c]) urban++; }
    // 各站客流（若有）
    var boards = {};
    if (g.riders) {}
    return { year: g.clock.y + '.' + g.clock.m, stations: st.length, segs: segs.length, types: types,
      lines: lines.map(function(l){return l.name;}), lineLen: (function(){ var t=0; segs.forEach(function(s){ t+=CM.U.dist(net.stations[s.a].x,net.stations[s.a].y,net.stations[s.b].x,net.stations[s.b].y); }); return +(t*0.25).toFixed(1); })(),
      urban: urban, pop: Math.round(pop), ext: ext, fare: CM.Economy ? CM.Economy.fareText ? CM.Economy.fareText(g.econ.fare, g.clock.y) : JSON.stringify(g.econ.fare) : null,
      funds: Math.round(g.econ ? g.econ.funds : 0), free: g.econ ? g.econ.isFree() : null,
      daily: g.model && g.model.daily ? g.model.daily : null,
      served: (function(){ var lk = F.extLink(fac[0], g); return lk ? lk.st.name : null; })(),
      share: (function(){ var s2 = 0, v = 0; try { var it = (g.model.fac || []).filter(function(x){return x.f.id==='ms_njlink';})[0]; if (it) { s2 = it.tshare; v = it.tv; } } catch(e) {} return { tshare: s2, tv: v }; })() };
  })()`);

  console.log(JSON.stringify({ stat: stat.value || stat.error, logs: logs.slice(-8) }, null, 1));
  const png = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  await writeFile(OUT, Buffer.from(png.data, 'base64'));
  console.log('截图:', OUT);
} catch (e) { console.error('FAIL', e.message); }
finally { try { child.kill(); } catch { } process.exit(0); }
