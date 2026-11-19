import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9200+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1200,800',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cps${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true,timeout:120000});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html?v='+Date.now()}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'p7'})");
  for(let i=0;i<300;i++){ await sleep(400); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const count = `(function(){var C=CM.game.city,n=0;for(var i=0;i<C.N;i++){var v=C.lu[i];if(v>=1&&v<=4)n++;}return {cells:n,km2:+(n*0.0625).toFixed(1),pop:Math.round(CM.game.city.pop.reduce(function(a,b){return a+b},0)),y:CM.game.clock.y,m:CM.game.clock.m}})()`;
  console.log('start', JSON.stringify(await ev(count)));
  // 快进 120 个月
  const t0=Date.now();
  const r=await ev("(function(){var g=CM.game,n=0;for(var i=0;i<120;i++){ if(g.advanceMonth) { g.advanceMonth(); n++; } }return n})()");
  console.log('advanced', r, 'ms', Date.now()-t0);
  console.log('after120', JSON.stringify(await ev(count)));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
