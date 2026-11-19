import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const BROWSERS=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
import { existsSync } from 'node:fs';
const EXE=BROWSERS.find(p=>existsSync(p));
const URL=process.argv[2], OUT=process.argv[3]||'amap.png', WAIT=Number(process.argv[4]||9000);
const PORT=9300+Math.floor(Math.random()*200);
const child=spawn(EXE,[`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpam${PORT}`,'--window-size=1400,900','--hide-scrollbars','--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'});
  await send('Page.navigate',{url:URL});
  await sleep(WAIT);
  // 关掉可能的登录弹窗
  await ev(`(function(){var els=[].slice.call(document.querySelectorAll('div,button,span,i'));var c=els.filter(function(e){var t=(e.className&&e.className.toString())||'';return /close|Close/.test(t)&&e.offsetWidth>0&&e.offsetWidth<60});if(c[0]){c[0].click();return 'closed'}return 'none'})()`);
  await sleep(2500);
  const r=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(OUT,Buffer.from(r.data,'base64'));
  console.log('title', await ev('document.title'), '| url', await ev('location.href'));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
