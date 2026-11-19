import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9800+Math.floor(Math.random()*90);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1400,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpv${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'probe'})");
  for(let i=0;i<200;i++){ await sleep(400); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  console.log(JSON.stringify(await ev(`(function(){
    var D=CM.MAPS.ms.data, C=CM.game.city;
    var open={}; C.regions.forEach(function(r){ if(r.open!=null) open[r.id]=r.open; });
    var plc=D.places.length;
    return {places:plc, regions:C.regions.length, open2000:Object.keys(open).filter(function(k){return open[k]===2000}), 
      ytOpen: open.yt, hxOpen:open.hx, events:D.events.length, evTitles:D.events.slice(0,6).map(function(e){return e.y+'-'+e.m+' '+e.title})};
  })()`),null,1));
  // 站名测试：和县、含山、银塘几个点
  console.log(JSON.stringify(await ev(`(function(){
    var C=CM.game.city, out=[];
    [[201,153],[103,151],[263,202],[195,190],[92,252],[240,235]].forEach(function(p){
      out.push(p.join(',')+' → '+CM.Metro.suggestName({stations:{}}, p[0], p[1], C));
    });
    return out;
  })()`),null,1));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
