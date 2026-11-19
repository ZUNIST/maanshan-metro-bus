import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9100+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1500,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpq${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
const wheel=async(x,y,dy)=>{await send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:dy});};
const shot=async(f)=>{const r=await send('Page.captureScreenshot',{format:'jpeg',quality:72}); await writeFile(f,Buffer.from(r.data,'base64'));};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  const t0=Date.now();
  await ev("CM.newGame({map:'ms',mode:'free',name:'2020',startYear:2020})");
  for(let i=0;i<240;i++){ await sleep(500); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const build=Date.now()-t0;
  const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if(r) await click(r[0],r[1]);
  await sleep(3000);
  for(let i=0;i<7;i++){ await wheel(700,420,400); await sleep(150); }
  await sleep(2000); await shot('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/shot-2020.png');
  const st=await ev("(function(){var g=CM.game;return {clock:g.clock.y+'-'+g.clock.m, pop:Math.round(g.city.pop.reduce(function(a,b){return a+b},0)), roads:g.city.roadGroups.length, built:Array.prototype.filter.call(g.city.roadsBuilt,function(v){return v}).length}})()");
  console.log(JSON.stringify({build, st}));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
