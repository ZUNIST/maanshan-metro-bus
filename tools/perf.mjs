import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1500,900','--remote-debugging-port=9337','--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof6','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
const shot=async(f)=>{const r=await send('Page.captureScreenshot',{format:'jpeg',quality:70}); await writeFile(f,Buffer.from(r.data,'base64'));};
const mapId = process.argv[2] || 'ms';
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch('http://127.0.0.1:9337/json')).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'});
  await sleep(5000);
  const t0=Date.now();
  await ev(`CM.newGame({map:'${mapId}',mode:'free',name:'p'})`);
  for(let i=0;i<90;i++){ await sleep(500); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const build=Date.now()-t0;
  const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if(r) await click(r[0],r[1]);
  await sleep(2500);
  // 推进 4 个月（. 键）
  const times=[];
  for(let i=0;i<4;i++){ const a=Date.now(); await ev("(function(){CM.game.advanceMonth&&CM.game.advanceMonth();return 1})()"); await sleep(150); times.push(Date.now()-a); }
  const st=await ev("(function(){var g=CM.game;return {clock:g.clock.y+'-'+g.clock.m, fps: (CM.ui&&CM.ui.fps)||null}})()");
  // 全图
  await ev("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'f',bubbles:true}))");
  await sleep(2500); await shot(`C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/full-${mapId}.png`);
  console.log(JSON.stringify({mapId, buildMs:build, monthMs:times, state:st}));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
