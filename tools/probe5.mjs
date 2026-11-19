import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9400+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1200,800',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpp${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html?v='+Date.now()}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'p5',startYear:2010})");
  for(let i=0;i<240;i++){ await sleep(400); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  console.log(JSON.stringify(await ev(`(function(){
    var C=CM.game.city, W=C.W, urb=0, pop=0, lu={};
    for(var j=141;j<166;j++)for(var i=189;i<214;i++){var c=j*W+i; lu[C.lu[c]]=(lu[C.lu[c]]||0)+1; if(C.lu[c]>=1&&C.lu[c]<=4)urb++; pop+=C.pop[c];}
    var cen=CM.MAPS.ms.data.centers.filter(function(k){return Math.abs(k.x-201)<6&&Math.abs(k.y-153)<6}).length;
    return {urbanCells:urb, km2:(urb*0.0625).toFixed(1), pop:Math.round(pop), lu:lu, centersNear:cen, totalCenters:CM.MAPS.ms.data.centers.length};
  })()`),null,1));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
