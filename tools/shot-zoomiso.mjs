// 同一机位截图：检查建筑分块几何变化后的接缝与遮挡。
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9000+Math.floor(Math.random()*200);
const out=process.argv[2]||'shot-iso.png';
const MID=process.argv[3]||'ms';
const Z=Number(process.argv[4]||56);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1500,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cps${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
try{
 let t=null;for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
 ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'});
 await sleep(5000);
 await ev("CM.newGame({map:'" + MID + "',mode:'free',name:'p'})");
 for(let i=0;i<120;i++){await sleep(500);if(await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())'))break;}
 const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
 if(r)await click(r[0],r[1]);
 await sleep(3000);
 await ev("CM.game.setSpeed(0)");
 await ev("CM.R.zoomAt(CM.R.w/2, CM.R.h/2, " + Z + "/CM.R.cam.zoom)");
 await sleep(9000);
 console.log(JSON.stringify(await ev("(function(){var R=CM.R;return {z:+R.cam.zoom.toFixed(1),dl:R.stats.displayedLevel,pend:R.stats.pendingVisible,iso:R.iso.size,g:R.ground.size}})()")));
 const sh=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(out,Buffer.from(sh.data,'base64'));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
