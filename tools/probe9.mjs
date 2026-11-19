import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9000+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1200,800',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpz${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true,timeout:180000});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html?v='+Date.now()}); await sleep(5000);
  for (const X of [0, 0.25, 0.4, 0.6]) {
    await ev("CM.newGame({map:'ms',mode:'free',name:'p9'})");
    for(let i=0;i<300;i++){ await sleep(300); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
    const out = await ev(`(function(){
      var C=CM.game.city, D=CM.DATA; D.expand=${X};
      function stat(){var n=0;for(var i=0;i<C.N;i++){var v=C.lu[i];if(v>=1&&v<=4)n++;}return +(n*0.0625).toFixed(1);}
      var out=[stat()];
      for(var k=1;k<=240;k++){ if(k%60===0) out.push(stat()); C.growMonth({year:2000+k/12, monthIndex:k, zoneAccess:null, cellWalk:null, coverage:0, econ:null}); }
      return out;
    })()`);
    console.log('expand='+X, JSON.stringify(out));
  }
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
