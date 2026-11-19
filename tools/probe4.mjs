import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9300+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1400,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpy${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(((m.params.exceptionDetails.exception||{}).description||'').slice(0,160));});
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'p4',startYear:2017})");
  for(let i=0;i<300;i++){ await sleep(400); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  console.log(JSON.stringify(await ev(`(function(){
    var g=CM.game, F=CM.Fac;
    var named={}; F.list().forEach(function(f){ var nm=F.shortName(f); if(/东站|西站|商务区|商圈|经开区/.test(nm)) named[nm]=1; });
    var lg=(g.events||[]).map(function(e){return e.tag+':'+e.title});
    var open=Object.keys(g.city.regions).length;
    return {fac:Object.keys(named), logCount:lg.length, logTail:lg.slice(-6), errors:0};
  })()`),null,1));
  // 推进 12 个月
  await ev("(function(){for(var i=0;i<12;i++) CM.game.advanceMonth(); return 1})()");
  await sleep(1500);
  console.log(JSON.stringify(await ev("(function(){var g=CM.game;return {clock:g.clock.y+'-'+g.clock.m, sat:Math.round(g.econ.sat*100)/100, ev:(g.events||[]).filter(function(e){return e.tag==='史实'}).length}})()"),null,1));
  console.log('errors', JSON.stringify(errs.slice(0,3)));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
