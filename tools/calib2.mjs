// 单会话内扫描密度系数，量建成区面积
import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9650+Math.floor(Math.random()*60);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1200,800',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpk2${PORT}`,'about:blank'],{stdio:'ignore'});
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
  // 备份原始 centers
  await ev("window.__orig=null;1");
  const ks=[0.16,0.22,0.28,0.34];
  for(const k of ks){
    await ev(`(function(){var cs=CM.MAPS.ms.data.centers;
      if(!window.__orig) window.__orig=cs.map(function(c){return [c.pop,c.jobs]});
      cs.forEach(function(c,i){c.pop=Math.max(120,Math.round(window.__orig[i][0]*${k}));c.jobs=Math.max(120,Math.round(window.__orig[i][1]*${k}))});
      return cs.length})()`);
    await ev("CM.newGame({map:'ms',mode:'free',name:'c'})");
    for(let i=0;i<120;i++){ await sleep(300); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
    const st=await ev("(function(){var C=CM.game.city,c=0;for(var i=0;i<C.N;i++){var v=C.lu[i];if(v===1||v===2||v===3||v===4||v===6)c++;}return {km2:+(c*0.0625).toFixed(1)}})()");
    console.log('k='+k, JSON.stringify(st));
    await ev("CM.endGame()"); await sleep(800);
  }
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
