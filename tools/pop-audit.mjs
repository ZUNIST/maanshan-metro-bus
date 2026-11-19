// 人口分布审计：读取开局城市的人口格，输出统计与密度图
// 用法: node tools/pop-audit.mjs <url> <outPng> [outJson]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const URL_ = process.argv[2] || 'http://127.0.0.1:8199/index.html';
const OUT = process.argv[3] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/马鞍山-人口分布.png';
const JSON_OUT = process.argv[4] || '';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9342;
const PROFILE = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-popaudit';

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

const AUDIT = `(function(){
  var C=CM.game.city, W=C.W, H=C.H, N=W*H;
  var total=0, urbanP=0, ruralP=0, urbanCells=0, ruralCells=0, drawn=0, blank=0;
  var regName=['含山','和县','主城','当涂','博望','其它'];
  var reg=function(x,y){
    if(x<160) return 0;
    if(x>=330) return 4;
    if(y>=215) return 3;
    if(x>=240 && y>=140) return 2;
    if(x>=155 && y<230) return 1;
    return 5;
  };
  var R=[]; for(var i=0;i<6;i++) R.push({pop:0,cells:0,drawn:0,urban:0});
  for(var c=0;c<N;c++){
    var x=c%W, y=(c/W)|0, p=C.pop[c]||0, j=C.jobs[c]||0, st=C.street[c];
    total+=p; var r=reg(x,y);
    R[r].pop+=p; R[r].cells++;
    if(st){ urbanP+=p; urbanCells++; R[r].urban++; }
    else { ruralP+=p; ruralCells++; if(p>=12){drawn++;R[r].drawn++;} else blank++; }
  }
  return {
    total: Math.round(total), urbanCells: urbanCells, ruralCells: ruralCells,
    urbanPop: Math.round(urbanP), ruralPop: Math.round(ruralP),
    urbanShare: +(urbanP/total*100).toFixed(1), ruralShare: +(ruralP/total*100).toFixed(1),
    ruralDrawnCells: drawn, ruralDrawnPct: +(drawn/ruralCells*100).toFixed(2),
    blankCells: blank,
    regions: R.map(function(o,i){ return {name:regName[i], pop:Math.round(o.pop), cells:o.cells,
      drawn:o.drawn, drawnPct:+(o.drawn/o.cells*100).toFixed(2), urban:o.urban,
      share:+(o.pop/total*100).toFixed(1)}; })
  };
})()`;

const DRAW = `(function(){
  var C=CM.game.city, W=C.W, H=C.H, S=2;
  var cv=document.createElement('canvas'); cv.width=W*S; cv.height=H*S+54;
  var ctx=cv.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,cv.width,cv.height);
  var img=ctx.createImageData(W*S,H*S);
  for(var c=0;c<W*H;c++){
    var p=C.pop[c]||0, st=C.street[c], L=C.lu[c];
    var col;
    if(L===4||L===5) col=[214,229,216];            // 水/山/公园
    else if(st) col=[24,54,86];                     // 建成区
    else if(p>=25) col=[214,58,48];                 // 乡村聚落（较密）
    else if(p>=12) col=[240,158,74];                // 乡村零星房屋
    else col=[238,242,245];                         // 空旷农地
    var x=(c%W)*S, y=((c/W)|0)*S;
    for(var dy=0;dy<S;dy++)for(var dx=0;dx<S;dx++){
      var k=((y+dy)*cv.width+(x+dx))*4;
      img.data[k]=col[0];img.data[k+1]=col[1];img.data[k+2]=col[2];img.data[k+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  ctx.fillStyle='#16212b'; ctx.font='bold 17px sans-serif';
  ctx.fillText('2000 年人口分布：深蓝 = 城镇建成区   橙 = 乡村零星   红 = 乡村聚落   浅灰 = 空旷农地   绿 = 山水', 10, H*S+22);
  ctx.font='13px sans-serif';
  ctx.fillText('1 格 = 250 m；数据：OSM 建成区掩膜 + 乡镇/自然村聚落中心', 10, H*S+43);
  document.body.innerHTML=''; document.body.style.margin='0';
  cv.style.position='fixed'; cv.style.left='0'; cv.style.top='0'; cv.style.zIndex='99999';
  document.body.appendChild(cv);
  return {w:cv.width,h:cv.height};
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
  await ev("CM.newGame({map:'ms',mode:'free',name:'popaudit'})");
  let ready = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const ok = await ev("!!(CM.game&&CM.game.city&&CM.game.city.pop&&!CM.isLoading())");
    if (ok === true) { ready = true; break; }
  }
  if (!ready) throw new Error('建城未完成');
  const stat = await ev(AUDIT);
  console.log(JSON.stringify(stat, null, 1));
  if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(stat, null, 1), 'utf8');
  const info = await ev(DRAW);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(OUT, Buffer.from(shot.data, 'base64'));
  console.log('PNG', OUT, JSON.stringify(info), 'logs', JSON.stringify(logs));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  try { ws && ws.close(); } catch {}
  child.kill();
}
