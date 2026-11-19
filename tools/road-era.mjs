// 马鞍山「按史实变化的道路网」验证：逐年累计路网数 + 多期路网对照图 + 石杨镇建成区校验
// 用法: node tools/road-era.mjs <url> <outPng>
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const URL_ = process.argv[2] || 'http://127.0.0.1:8199/index.html';
const OUT = process.argv[3] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/马鞍山-路网年代.png';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const PROFILE = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-roadera';

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return r.result.value;
};

const DRAW = `(function(){
  var C = CM.game.city, gs = C.roadGroups;
  var years = [2000, 2005, 2010, 2015, 2020, 2026];
  var W = 416, H = 328, SW = 480, SH = 378, COLS = 3, GAP = 34;
  var cv = document.createElement('canvas');
  cv.width = COLS * SW; cv.height = 2 * (SH + GAP) + 34;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (var n = 0; n < years.length; n++) {
    var y = years[n], prev = n === 0 ? 1990 : years[n-1];
    var ox = (n % COLS) * SW, oy = Math.floor(n / COLS) * (SH + GAP);
    ctx.save(); ctx.translate(ox, oy + GAP);
    ctx.fillStyle = '#eef3f7'; ctx.fillRect(0, 0, SW, SH);
    var sx = SW / W, sy = SH / H;
    for (var q = 0; q < gs.length; q++) {
      var g = gs[q];
      if (g.year > y) continue;
      var fresh = g.year > prev && g.year <= y;
      ctx.strokeStyle = fresh ? '#d0342c' : (g.cls >= 4 ? '#4d6478' : '#a8b7c4');
      ctx.lineWidth = fresh ? 1.7 : (g.cls >= 4 ? 1.05 : 0.55);
      ctx.beginPath();
      for (var w = 0; w < g.ways.length; w++) {
        var p = g.ways[w];
        for (var k = 0; k + 3 < p.length; k += 2) {
          ctx.moveTo(p[k] * sx, p[k+1] * sy);
          ctx.lineTo(p[k+2] * sx, p[k+3] * sy);
        }
      }
      ctx.stroke();
    }
    ctx.font = 'bold 13px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    var labs = [[103,158,'含山'],[204,153,'和县'],[265,170,'主城'],[259,222,'当涂'],[388,216,'博望'],[196,206,'郑蒲港'],[174,56,'石杨'],[345,42,'南京(境外)']];
    for (var t = 0; t < labs.length; t++) {
      var lx = labs[t][0]*sx, ly = labs[t][1]*sy;
      ctx.strokeText(labs[t][2], lx, ly);
      ctx.fillStyle = '#16212b'; ctx.fillText(labs[t][2], lx, ly);
    }
    ctx.restore();
    ctx.fillStyle = '#16212b'; ctx.font = 'bold 19px sans-serif';
    var label = n === 0
      ? '2000 年   开局路网 ' + gs.filter(function(g){return g.year <= y;}).length + ' 组（红色为开局已有）'
      : String(y) + ' 年   累计 ' + gs.filter(function(g){return g.year <= y;}).length + ' 组道路'
        + '   本期新增 ' + gs.filter(function(g){return g.year > prev && g.year <= y;}).length;
    ctx.fillText(label, ox + 12, oy + 24);
  }
  ctx.fillStyle = '#16212b'; ctx.font = '15px sans-serif';
  ctx.fillText('红色 = 该期新通车道路（2000 格为开局已有）   深蓝 = 高速/快速路   浅灰 = 既有道路   右上角密网为 OSM 边界溢出的南京江宁（境外，非马鞍山）   数据：OSM + 25 条史实事件', 12, cv.height - 11);
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  cv.style.position = 'fixed'; cv.style.left = '0'; cv.style.top = '0'; cv.style.zIndex = '99999';
  document.body.appendChild(cv);
  return { w: cv.width, h: cv.height };
})()`;

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = list.find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  const logs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('console: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || '').slice(0, 220));
  });
  await send('Page.navigate', { url: URL_ });
  await sleep(3500);
  await ev("CM.newGame({map:'ms',mode:'free',name:'roadera'})");
  let ready = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const ok = await ev("!!(CM.game&&CM.game.city&&CM.game.city.roadGroups&&!CM.isLoading())");
    if (ok === true) { ready = true; break; }
  }
  if (!ready) throw new Error('建城未完成');
  const stat = await ev(`(function(){
    var C=CM.game.city, gs=C.roadGroups, years=[2000,2005,2010,2015,2020,2026], hist={};
    for(var i=0;i<gs.length;i++){var y=gs[i].year;hist[y]=(hist[y]||0)+1;}
    var box=function(x0,x1,y0,y1){var n=0;for(var j=y0;j<y1;j++)for(var x=x0;x<x1;x++){var c=j*C.W+x;if(C.street&&C.street[c])n++;}return n;};
    var lateX={}, lateR={}, allX={}, allR={}, lenR={};
    var regOf=function(x,y){var cc=Math.floor(y)*C.W+Math.floor(x);return (C.regions[C.region[cc]]||{}).name||'外围';};
    for(var i=0;i<gs.length;i++){
      var g=gs[i], cx=(g.bbox[0]+g.bbox[2])/2, cy=(g.bbox[1]+g.bbox[3])/2;
      var bx=Math.floor(cx/80)*80;
      allX[bx]=(allX[bx]||0)+1;
      var rn=regOf(cx,cy);
      allR[rn]=(allR[rn]||0)+1;
      var L=0;
      for(var w=0;w<g.ways.length;w++){var p=g.ways[w];for(var k=0;k+3<p.length;k+=2){L+=Math.hypot(p[k+2]-p[k],p[k+3]-p[k+1]);}}
      lenR[rn]=(lenR[rn]||0)+Math.round(L);
      if(g.year>2000){
        lateX[bx]=(lateX[bx]||0)+1;
        lateR[rn]=(lateR[rn]||0)+1;
      }
    }
    return { groups: gs.length, cum: years.map(function(y){return gs.filter(function(g){return g.year<=y;}).length;}),
      hist: hist, shiyang: box(170,178,52,60), rushanhu: box(158,168,71,84), width: C.W,
      allX: allX, lateX: lateX, lateR: lateR, allR: allR, lenR: lenR };
  })()`);
  console.log(JSON.stringify({ years: [2000, 2005, 2010, 2015, 2020, 2026], ...stat }, null, 1));
  const info = await ev(DRAW);
  console.log('canvas', JSON.stringify(info));
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(OUT, Buffer.from(shot.data, 'base64'));
  console.log('PNG', OUT);
  console.log('logs', JSON.stringify(logs.slice(0, 6)));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  try { child.kill(); } catch {}
  process.exit(0);
}
