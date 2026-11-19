import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9500+Math.floor(Math.random()*80);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1400,860',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpb${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true,timeout:180000});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const t of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});};
const shot=async(f)=>{const r=await send('Page.captureScreenshot',{format:'png'}); await writeFile(f,Buffer.from(r.data,'base64'));};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html?v='+Date.now()}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'p10'})");
  for(let i=0;i<300;i++){ await sleep(300); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if(r) await click(r[0],r[1]);
  await sleep(2000);
  await ev("(function(){var c=CM.R.cam;c.cx=258;c.cy=175;c.zoom=c.tz=13;c.t=1;c.anchor=null;c.fly=null;return 1})()");
  await sleep(2500); await shot('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/grow-before.png');
  const n1=await ev("(function(){var C=CM.game.city,n=0;for(var i=0;i<C.N;i++){var v=C.lu[i];if(v>=1&&v<=4)n++;}return n})()");
  await ev("(function(){var C=CM.game.city;for(var k=1;k<=144;k++){C.growMonth({year:2000+k/12,monthIndex:k,zoneAccess:null,cellWalk:null,coverage:0,econ:null});} return 1})()");
  await sleep(3000);
  await shot('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/grow-after.png');
  const n2=await ev("(function(){var C=CM.game.city,n=0;for(var i=0;i<C.N;i++){var v=C.lu[i];if(v>=1&&v<=4)n++;}return n})()");
  console.log(JSON.stringify({before:n1, after:n2, km2:[+(n1*0.0625).toFixed(1), +(n2*0.0625).toFixed(1)]}));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
