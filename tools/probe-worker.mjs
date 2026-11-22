// 检查各剧本是否真的启用了地面块后台线程（R.tiles.list 是否为空、是否已退回主线程），并打印相关告警。
// 用法：node tools/probe-worker.mjs <url> [map...]
import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9000+Math.floor(Math.random()*200);
const url=process.argv[2]||'http://127.0.0.1:8123/index.html';
const maps=process.argv.slice(3); if(!maps.length) maps.push('ms','ms27','ms30','hx','hx27');
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1440,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpw${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map();const logs=[];
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
try{
 let t=null;for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
 ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}
   if(d.method==='Log.entryAdded') logs.push(d.params.entry.level+': '+d.params.entry.text+(d.params.entry.url?' ['+d.params.entry.url+']':''));
   if(d.method==='Runtime.consoleAPICalled') logs.push(d.params.type+': '+d.params.args.map(a=>a.value!==undefined?a.value:(a.description||'')).join(' '));
   if(d.method==='Runtime.exceptionThrown') logs.push('EXC: '+(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description||d.params.exceptionDetails.text));};
 await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
 await send('Page.navigate',{url});
 await sleep(5000);
 for(const m of maps){
   logs.length=0;
   await ev(`CM.newGame({map:'${m}',mode:'free',name:'w'})`);
   for(let i=0;i<200;i++){await sleep(400);if(await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())'))break;}
   const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
   if(r)await click(r[0],r[1]);
   await sleep(3500);
   const s=await ev(`(function(){var R=CM.R,P=R.tiles;return {off:!!P.off, slots:P.list?P.list.length:0, pending:P.pending.size, ground:R.ground.size, iso:R.iso.size, dl:R.displayedLevel, pend:R.stats.pendingVisible, ms:+(R.lastFrameMs||0).toFixed(1), single:!!CM.SINGLE_FILE}})()`);
   console.log(m, JSON.stringify(s), logs.filter(x=>/工作线程|地面块|worker|Error|EXC/i.test(x)).slice(0,3));
   await ev("if(CM.endGame) CM.endGame();");
   await sleep(1500);
 }
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
