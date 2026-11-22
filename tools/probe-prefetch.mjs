// 对比「开/关空闲预绘」时缩小视角的切档耗时与缓存抖动，判断预绘策略是否造成反复重建。
// 用法：node tools/probe-prefetch.mjs <url> [map] [ema阈值|0=关闭]
import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9000+Math.floor(Math.random()*200);
const url=process.argv[2]||'http://127.0.0.1:8127/index.html';
const MAP=process.argv[3]||'ms';
const EMA=Number(process.argv[4]||'26');
const W=1440,H=900;
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars',`--window-size=${W},${H}`,`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cppf${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
const wheel=async(x,y,dy)=>{await send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:dy});};
const snap=()=>ev(`(function(){var R=CM.R;var g={};R.ground.forEach(function(e){g[e.lvl||'?']=(g[e.lvl||'?']||0)+1});
 return {dl:R.displayedLevel,rq:R.requestedLevel,pend:R.stats.pendingVisible,cache:+(R.cachePx/1e6).toFixed(1),cap:+(R.cacheLimit()/1e6).toFixed(0),g:g,gn:R.ground.size,inn:R.iso.size,ms:+(R.lastFrameMs||0).toFixed(1)}})()`);
try{
 let t=null;for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
 ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url});
 await sleep(5000);
 await ev(`CM.newGame({map:'${MAP}',mode:'free',name:'p'})`);
 for(let i=0;i<160;i++){await sleep(400);if(await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())'))break;}
 const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
 if(r)await click(r[0],r[1]);
 await sleep(3000);
 await ev(`CM.game.setSpeed(0); CM.CFG.perf.prefetchEma=${EMA}`);
 await ev("CM.R.zoomAt(CM.R.w/2, CM.R.h/2, 96/CM.R.cam.zoom)");
 await sleep(5000);
 console.log('EMA='+EMA,'at96',JSON.stringify(await snap()));
 for(let k=0;k<3;k++){await wheel(W/2,H/2,240);await sleep(100);}
 const t0=Date.now();
 for(let i=0;i<60;i++){await sleep(300);const s=await snap();console.log('t+'+(Date.now()-t0),JSON.stringify(s));if(s.dl===s.rq&&s.pend===0)break;}
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
