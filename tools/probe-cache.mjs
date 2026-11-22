// 校验缓存像素账目：cachePx 与各分块 px 之和是否一致，以及各档位占用（v3.58：分离「必须显示」与预绘，
// 缩小一档时缓存不应超过上限的两倍）。
// 用法：node tools/probe-cache.mjs
import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9000+Math.floor(Math.random()*200);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1500,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpca${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
const wheel=async(x,y,dy)=>{await send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:dy});};
const st=()=>ev(`(function(){var R=CM.R,g={g:0,gp:0,i:0,ip:0},bylvl={},byl=0;
 R.ground.forEach(function(e,k){g.g++;g.gp+=e.px;var L=e.lvl;bylvl['g'+L]=(bylvl['g'+L]||0)+e.px;});
 R.iso.forEach(function(e,k){g.i++;g.ip+=e.px;var L=e.lvl;bylvl['i'+L]=(bylvl['i'+L]||0)+e.px;});
 var sum=g.gp+g.ip, out={z:+R.cam.zoom.toFixed(1),dl:R.displayedLevel,rq:R.requestedLevel,pend:R.stats.pendingVisible,
  cachePx:+(R.cachePx/1e6).toFixed(2),sum:+(sum/1e6).toFixed(2),drift:+((R.cachePx-sum)/1e6).toFixed(2),cap:+(R.cacheLimit()/1e6).toFixed(0),
  gn:g.g,inn:g.i,fps:+(R.lastFrameMs||0).toFixed(1)};
 var L={};for(var k in bylvl)L[k]=+(bylvl[k]/1e6).toFixed(1);out.byLvl=L;return out})()`);
try{
 let t=null;for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
 ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'});
 await sleep(5000);
 await ev("CM.newGame({map:'ms',mode:'free',name:'p'})");
 for(let i=0;i<120;i++){await sleep(500);if(await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())'))break;}
 const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
 if(r)await click(r[0],r[1]);
 await sleep(2500); await ev("CM.game.setSpeed(3)");
 console.log('S',JSON.stringify(await st()));
 for(let i=0;i<9;i++){await wheel(750,450,-240);await sleep(300);}
 await sleep(5000);
 console.log('IN',JSON.stringify(await st()));
 for(let i=0;i<3;i++) await wheel(750,450,240);
 for(let i=0;i<20;i++){await sleep(300);console.log('O',i,JSON.stringify(await st()));}
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
