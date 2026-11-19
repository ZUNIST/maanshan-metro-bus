import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9300+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1200,800',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpt${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true,timeout:120000});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(((m.params.exceptionDetails.exception||{}).description||'').slice(0,200));});
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html?v='+Date.now()}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'p11',startYear:2020})");
  for(let i=0;i<300;i++){ await sleep(300); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  console.log(JSON.stringify(await ev(`(function(){
    var C=CM.game.city, D=CM.MAPS.ms.data;
    var lbl={}; C.districtLabels.forEach(function(l){lbl[l[0]]=l[1].toFixed(0)+','+l[2].toFixed(0)});
    var lms=D.landmarks.filter(function(l){return /大桥|工业大学/.test(l.name)}).map(function(l){return l.name+'@'+l.x.toFixed(0)+','+l.y.toFixed(0)});
    var fac=D.facilities.filter(function(f){return /奥体|人民医院|万达/.test(f.n)}).map(function(f){return f.n+'@'+(f.at?f.at.map(function(v){return v.toFixed(0)}).join(','):'lm')});
    return {places:D.places.length, labels:{石杨:lbl['石杨'],仙踪:lbl['仙踪'],清溪:lbl['清溪'],陶厂:lbl['陶厂'],昭关:lbl['昭关'],林头:lbl['林头'],铜闸:lbl['铜闸'],运漕:lbl['运漕'],乌江:lbl['乌江'],环峰:lbl['环峰'],历阳:lbl['历阳'],郑蒲港:lbl['郑蒲港']},
      lms:lms, fac:fac, tasks:D.histTasks.length, hasBridgeTask:D.histTasks.some(function(t){return /公铁/.test(t.title)})};
  })()`),null,1));
  console.log('errors', JSON.stringify(errs.slice(0,3)));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
