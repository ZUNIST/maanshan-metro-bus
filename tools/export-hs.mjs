import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9400+Math.floor(Math.random()*100);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1400,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpx${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'sketch'})");
  for(let i=0;i<200;i++){ await sleep(500); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const bbox={x0:0,x1:416,y0:0,y1:328};
  const out=await ev(`(function(){
    var C=CM.game.city, W=C.W, bw=${JSON.stringify(bbox)};
    var lu='', pop='', reg='';
    for(var j=bw.y0;j<bw.y1;j++) for(var i=bw.x0;i<bw.x1;i++){
      var c=j*W+i;
      lu+=String.fromCharCode(65+C.lu[c]);   // 单字符编码，避免 10 占两位导致错位
      pop+=String.fromCharCode(65+Math.min(89,Math.floor(Math.min(60000,C.pop[c])/700)));
      reg+=String.fromCharCode(65+C.region[c]);
    }
    var cs=CM.MAPS.ms.data.centers.map(function(k){return [k.x,k.y,k.pop,k.jobs,k.r]});
    var regs=C.regions.map(function(r){return [r.id,r.name,r.open==null?null:r.open,r.cells||0]});
    return {bw:bw,lu:lu,pop:pop,reg:reg,centers:cs,regions:regs,W:W};
  })()`);
  await writeFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/tools/lu-all.json', JSON.stringify(out));
  console.log('导出格数', out.lu.length, 'centers', out.centers.length, 'regions', out.regions.length);
  // 顺带统计含山范围内用地构成
  const w=bbox.x1-bbox.x0, h=bbox.y1-bbox.y0;
  const cnt={};
  for(const ch of out.lu) cnt[ch]=(cnt[ch]||0)+1;
  console.log('含山框内用地', JSON.stringify(cnt));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
