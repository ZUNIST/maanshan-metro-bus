import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9200+Math.floor(Math.random()*200);
const year=process.argv[2]||'2000', OUT=process.argv[3], zoom=Number(process.argv[4]||8);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1500,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpz${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const t of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});};
const wheel=async(x,y,dy)=>{await send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:dy});};
const shot=async(f)=>{const r=await send('Page.captureScreenshot',{format:'jpeg',quality:75}); await writeFile(f,Buffer.from(r.data,'base64'));};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  const logs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') logs.push(((m.params.exceptionDetails.exception||{}).description||'').slice(0,160));});
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  const t0=Date.now();
  await ev(`CM.newGame({map:'ms',mode:'free',name:'cmp',${year!=='2000'?`startYear:${year},`:''}})`);
  for(let i=0;i<240;i++){ await sleep(500); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const build=Date.now()-t0;
  const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if(r) await click(r[0],r[1]);
  await sleep(3000);
  for(let i=0;i<zoom;i++){ await wheel(750,430,400); await sleep(140); }
  await sleep(2500); await shot(OUT);
  const st=await ev("(function(){var g=CM.game,C=g.city;var urban=0,water=0;for(var i=0;i<C.N;i++){if(C.lu[i]===2||C.lu[i]===3||C.lu[i]===4)urban++;}return {clock:g.clock.y, pop:Math.round(C.pop.reduce(function(a,b){return a+b},0)), urbanCells:urban}})()");
  console.log(JSON.stringify({year, build, st, logs:logs.slice(0,2)}));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
