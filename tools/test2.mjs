import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9500+Math.floor(Math.random()*100);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1500,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cp${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
const shot=async(f)=>{const r=await send('Page.captureScreenshot',{format:'jpeg',quality:70}); await writeFile(f,Buffer.from(r.data,'base64'));};
const waitBtn=async(re)=>{for(let i=0;i<40;i++){const r=await ev(`(function(){var b=[].slice.call(document.querySelectorAll('button,a')).find(function(x){return ${re}.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2,b.textContent.trim().slice(0,20)]})()`); if(r) return r; await sleep(500);} return null;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  const logs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') logs.push('EXC '+((m.params.exceptionDetails.exception||{}).description||'').slice(0,200));});
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'});
  await sleep(5000);
  const start=await waitBtn("/开始游戏/"); await click(start[0],start[1]); await sleep(2500);
  // 选择马鞍山卡片
  const card=await ev("(function(){var els=[].slice.call(document.querySelectorAll('*')).filter(function(e){return e.children.length===0&&/^马鞍山$/.test(e.textContent.trim())});if(!els.length)return null;var r=els[0].getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
  if (card) { await click(card[0],card[1]); await sleep(2500); }
  await shot('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/select-ms.png');
  const info=await ev("(function(){var d=document.body.innerText;return d.replace(/\\s+/g,' ').slice(0,600)})()");
  console.log('SELECT:', info);
  console.log('logs', JSON.stringify(logs));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
