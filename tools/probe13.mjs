import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9100+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1200,800',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpr3${PORT}`,'about:blank'],{stdio:'ignore'});
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
  await ev("CM.newGame({map:'ms',mode:'free',name:'p13'})");
  for(let i=0;i<300;i++){ await sleep(300); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  console.log(JSON.stringify(await ev(`(function(){
    var C=CM.game.city, bt=0, tot=C.roadGroups.length, byCls={};
    C.roadGroups.forEach(function(g,i){ if(!g) return; if(C.roadsBuilt[i]){bt++; byCls[g.cls]=(byCls[g.cls]||0)+1;} });
    var names=['沪安线','乌香路','和州路','湖东路','湖南路','解放路','项羽北路','浦乌南路'];
    var found={};
    C.roadGroups.forEach(function(g,i){ if(!g||!g.name) return; if(names.indexOf(g.name)>=0) found[g.name]=(C.roadsBuilt[i]? '已建':'未建')+' y'+g.year; });
    var pending={};
    C.roadGroups.forEach(function(g,i){ if(!g||C.roadsBuilt[i]) return; pending[g.year]=(pending[g.year]||0)+1; });
    return {total:tot, built:bt, byCls:byCls, found:found, pendingYears:Object.keys(pending).sort().slice(0,12).map(function(y){return y+':'+pending[y]})};
  })()`),null,1));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
