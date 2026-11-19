import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1500,900','--remote-debugging-port=9336','--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof5','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)):r.result.value;};
const shot=async(f)=>{const r=await send('Page.captureScreenshot',{format:'jpeg',quality:72}); await writeFile(f,Buffer.from(r.data,'base64'));};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch('http://127.0.0.1:9336/json')).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  const logs=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') logs.push(m.params.args.map(a=>a.value||a.description||'').join(' ').slice(0,200)); if(m.method==='Runtime.exceptionThrown') logs.push('EXC '+(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description||'').slice(0,300));});
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'});
  await sleep(6000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'t'})");
  // 等游戏就绪
  for(let i=0;i<60;i++){ await sleep(1000); const ok=await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())"); if(ok) break; }
  await sleep(3000);
  const rect = await ev("(function(){var bs=[].slice.call(document.querySelectorAll('button'));var b=bs.find(function(x){return /开始规划/.test(x.textContent)});if(!b) return null;var r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,t:b.textContent};})()");
  console.log('btn', JSON.stringify(rect));
  if (rect) {
    for (const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1});
  }
  await sleep(4000);
  await shot('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/game1.png');
  const info=await ev("(function(){var C=CM.game.city,g=CM.game;return {pop:Math.round(C.pop.reduce?C.pop.reduce(function(a,b){return a+b},0):0), cells:C.N, station:0, clock:g.clock.y+'-'+g.clock.m, regions:C.regions.length, lu:{water:Array.prototype.filter.call(C.lu,function(v){return v===0}).length}}})()");
  console.log(JSON.stringify(info));
  // 缩放全景
  await ev("(function(){var r=CM.ui; if(CM.ui&&CM.ui.zoomTo) {} return 1})()");
  await shot('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/game2.png');
  console.log('logs', JSON.stringify(logs.slice(0,5)));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
