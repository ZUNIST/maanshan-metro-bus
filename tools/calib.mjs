import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9600+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1300,860',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpk${PORT}`,'about:blank'],{stdio:'ignore'});
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
  const t0=Date.now();
  const YEAR=process.argv[2]||'';
  await ev("CM.newGame({map:'ms',mode:'free',name:'calib'" + (YEAR?",startYear:"+YEAR:"") + "})");
  for(let i=0;i<200;i++){ await sleep(500); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const build=Date.now()-t0;
  const st=await ev(`(function(){var C=CM.game.city,n={},cells=0;
    for(var i=0;i<C.N;i++){var v=C.lu[i]; n[v]=(n[v]||0)+1; if(v===1||v===2||v===3||v===4||v===6)cells++;}
    return {built:cells*0.0625, cells:cells, lu:n, centers:CM.MAPS.ms.data.centers.length}})()`);
  console.log(JSON.stringify({build, ...st, luKeys:Object.keys(st.lu).length}));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
